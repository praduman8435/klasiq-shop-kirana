import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getExchangePriceDifference } from "@/lib/exchange-price";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { createReturnRequest } from "@/server/commerce/returns";

// Phase 3.6.5 Part 3, sections 7/8 — end-to-end proof (real Postgres, the
// real createCounterSale -> createReturnRequest -> updateReturnRequestStatus
// -> receiveReturnRequest chain, nothing mocked) that a Partial Payment's
// `outstandingInPaise`/`amountReceivedInPaise` are IMMUTABLE historical
// accounting: neither a Return nor an Exchange ever reads or rewrites them,
// regardless of how much of the sale is returned/exchanged afterward.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-payment-returns-${randomUUID()}`, name: "Test Payment Returns Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test Payment Returns Admin", email: `test-payment-returns-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  await db.adminUser.delete({ where: { id: adminUserId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

async function createVariant(priceInPaise: number, stockQuantity: number) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-pr-product-${suffix}`, name: `Test PR Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-PR-SKU-${suffix}`, priceInPaise, stockQuantity },
  });
  return { product, variant };
}

async function createTestCustomer(label: string) {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-PR${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName: label,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

describe("Returns after a Partial Payment (section 7)", () => {
  it("a full return of a partially-paid sale leaves Outstanding/Received exactly as recorded at sale time", async () => {
    const { variant } = await createVariant(100000, 5);
    const customer = await createTestCustomer("Return After Partial Customer");

    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 40000 },
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber }, include: { items: true } });
    createdOrderIds.push(order.id);
    const orderItem = order.items[0]!;

    expect(order.amountReceivedInPaise).toBe(40000);
    expect(order.outstandingInPaise).toBe(60000);
    expect(order.paymentStatus).toBe("PARTIALLY_PAID");

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    await updateReturnRequestStatus({ returnNumber: created.returnNumber, newStatus: "APPROVED", adminUserId });
    const received = await receiveReturnRequest({ returnNumber: created.returnNumber, adminUserId });
    expect(received.success).toBe(true);

    // The Return pipeline never touches these fields — the Outstanding
    // credit balance a customer owes is a separate, immutable fact from
    // whether the goods themselves were later returned (see
    // docs/PHASE_3_6_5_REPORT.md Part 3 "Returns").
    const orderAfterReturn = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterReturn.amountReceivedInPaise).toBe(40000);
    expect(orderAfterReturn.outstandingInPaise).toBe(60000);
    expect(orderAfterReturn.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("a partial return of one line in a multi-line partially-paid sale still leaves Outstanding untouched", async () => {
    const { variant: shirt } = await createVariant(50000, 5);
    const { variant: pant } = await createVariant(70000, 5);
    const customer = await createTestCustomer("Multi-Line Return Customer");

    const sale = await createCounterSale({
      lines: [
        { productVariantId: shirt.id, quantity: 1 },
        { productVariantId: pant.id, quantity: 1 },
      ],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 60000 },
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber }, include: { items: true } });
    createdOrderIds.push(order.id);
    expect(order.totalInPaise).toBe(120000);
    expect(order.outstandingInPaise).toBe(60000);

    const shirtItem = order.items.find((i) => i.productVariantId === shirt.id)!;
    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: shirtItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    await updateReturnRequestStatus({ returnNumber: created.returnNumber, newStatus: "APPROVED", adminUserId });
    const received = await receiveReturnRequest({ returnNumber: created.returnNumber, adminUserId });
    expect(received.success).toBe(true);

    const orderAfterReturn = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterReturn.amountReceivedInPaise).toBe(60000);
    expect(orderAfterReturn.outstandingInPaise).toBe(60000);
  });
});

describe("Exchange after a Partial Payment (section 8)", () => {
  it("an exchange's price difference is computed from effective pricing; Outstanding stays exactly as recorded at sale time", async () => {
    const { variant: original } = await createVariant(30000, 5);
    const { variant: replacement } = await createVariant(35000, 5);
    const customer = await createTestCustomer("Exchange After Partial Customer");

    const sale = await createCounterSale({
      lines: [{ productVariantId: original.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 10000 },
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber }, include: { items: true } });
    createdOrderIds.push(order.id);
    const orderItem = order.items[0]!;

    expect(order.amountReceivedInPaise).toBe(10000);
    expect(order.outstandingInPaise).toBe(20000);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    await updateReturnRequestStatus({ returnNumber: created.returnNumber, newStatus: "APPROVED", adminUserId });

    const request = await db.returnRequest.findUniqueOrThrow({
      where: { returnNumber: created.returnNumber },
      include: { items: true },
    });
    const requestItem = request.items[0]!;

    const received = await receiveReturnRequest({
      returnNumber: created.returnNumber,
      adminUserId,
      replacements: { [requestItem.id]: replacement.id },
    });
    expect(received.success).toBe(true);

    const finishedRequestItem = await db.returnRequestItem.findUniqueOrThrow({ where: { id: requestItem.id } });
    const diff = getExchangePriceDifference({
      originalValueInPaise: orderItem.effectiveLineTotalInPaise,
      replacementValueInPaise: finishedRequestItem.replacementUnitPriceInPaiseSnapshot! * requestItem.quantity,
    });
    expect(diff.type).toBe("CUSTOMER_PAYS");
    expect(diff.differenceInPaise).toBe(5000); // ₹350 - ₹300, independent of Outstanding

    // The exchange price difference is settled independently (its own cash
    // transaction) — the ORIGINAL sale's Outstanding is untouched by it.
    const orderAfterExchange = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterExchange.amountReceivedInPaise).toBe(10000);
    expect(orderAfterExchange.outstandingInPaise).toBe(20000);
    expect(orderAfterExchange.paymentStatus).toBe("PARTIALLY_PAID");
  });
});
