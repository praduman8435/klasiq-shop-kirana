import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getExchangePriceDifference } from "@/lib/exchange-price";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { receivePayment } from "@/server/commerce/receive-payment";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { createReturnRequest } from "@/server/commerce/returns";

// Phase 3.6.5 Part 5, sections 9/10 — the OTHER direction from Part 3's own
// "Returns after a Partial Payment" tests: does RECEIVING a payment ever
// affect a Return/Exchange's own price calculation? `receivePayment`
// (src/server/commerce/receive-payment.ts) never reads or writes
// OrderItem/ReturnRequest at all (grep-confirmed, zero matches) — these
// tests prove that structural guarantee holds end-to-end against real
// Postgres rows too.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-rp-returns-exchange-${randomUUID()}`, name: "Test RP Returns Exchange Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test RP Returns Exchange Admin", email: `test-rp-returns-exchange-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.paymentReceipt.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
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
    data: { slug: `test-rpre-product-${suffix}`, name: `Test RPRE Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-RPRE-SKU-${suffix}`, priceInPaise, stockQuantity },
  });
  return variant;
}

async function createTestCustomer(label: string) {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-RE${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName: label,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

describe("A Return's price calculation is unaffected by a payment received on that order", () => {
  it("returning the item after paying off the balance still uses effective pricing, unchanged by the payment", async () => {
    const customer = await createTestCustomer("Return After Payment Customer");
    const variant = await createVariant(50000, 5);

    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 20000 },
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber }, include: { items: true } });
    createdOrderIds.push(order.id);
    const orderItem = order.items[0]!;
    expect(orderItem.effectiveLineTotalInPaise).toBe(50000);

    const payment = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 30000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(payment.success).toBe(true);

    const paidOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paidOrder.outstandingInPaise).toBe(0);
    expect(paidOrder.paymentStatus).toBe("PAID");

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

    // The return's own value is still exactly the effective line total —
    // the payment collected in between never touched it. And receiving
    // the return, in turn, never touches Outstanding/Received back.
    expect(orderItem.effectiveLineTotalInPaise).toBe(50000);
    const orderAfterReturn = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterReturn.outstandingInPaise).toBe(0);
    expect(orderAfterReturn.amountReceivedInPaise).toBe(50000);
    expect(orderAfterReturn.paymentStatus).toBe("PAID");
  });
});

describe("An Exchange's price difference is unaffected by a payment received on that order", () => {
  it("exchanging the item after a partial payment still computes the difference from effective pricing alone", async () => {
    const customer = await createTestCustomer("Exchange After Payment Customer");
    const original = await createVariant(30000, 5);
    const replacement = await createVariant(35000, 5);

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

    const payment = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 20000,
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(payment.success).toBe(true);
    const paidOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(paidOrder.outstandingInPaise).toBe(0);

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
    expect(diff.differenceInPaise).toBe(5000); // ₹350 - ₹300, independent of the payment already collected

    const orderAfterExchange = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterExchange.outstandingInPaise).toBe(0);
    expect(orderAfterExchange.amountReceivedInPaise).toBe(30000);
  });
});
