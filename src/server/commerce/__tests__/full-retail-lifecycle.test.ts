import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { receivePayment } from "@/server/commerce/receive-payment";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { createReturnRequest } from "@/server/commerce/returns";
import { getKhataBookCustomerProfile, searchKhataBookCustomers } from "@/server/queries/admin/khatabook";

// Phase 3.6.5 Part 6 — Production Acceptance & Final Validation.
//
// Every prior phase (Parts 1-5) tested its own slice of the retail-ops
// engine in isolation. This file is the one thing none of them were:
// a SINGLE, continuous scenario exercising every capability built across
// Phase 3.6.5 together, in the order a real shop day would actually
// produce them — Counter Sale with a negotiated Discount and a Partial
// Payment, found via KhataBook search, its Outstanding paid down via
// Receive Payment to exactly zero, THEN returned, with the return
// required to still use Part 2's effective pricing and leave Part 3/5's
// payment/ledger facts completely undisturbed. If any phase's boundary
// were subtly wrong — a discount leaking into Outstanding, a payment
// leaking into return pricing, a KhataBook aggregate drifting from the
// live Order row — this is the test that would catch it, because it is
// the only one watching the whole chain at once.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-full-lifecycle-${randomUUID()}`, name: "Test Full Lifecycle Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test Full Lifecycle Admin", email: `test-full-lifecycle-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
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
    data: { slug: `test-fl-product-${suffix}`, name: `Test FL Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-FL-SKU-${suffix}`, priceInPaise, stockQuantity },
  });
  return { product, variant };
}

describe("Full retail-ops lifecycle: Discount + Partial Payment -> KhataBook -> Receive Payment -> Return", () => {
  it("carries one order through the entire chain, every phase's own guarantees holding simultaneously", async () => {
    // --- Setup: a real customer and a ₹1000 shirt, 5 in stock. ---
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-FL${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: "Full Lifecycle Customer",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
      },
    });
    createdCustomerIds.push(customer.id);
    const { variant } = await createVariant(100000, 5);

    // --- Step 1 (Part 2 + Part 3): Counter Sale with a 20% discount and a
    // Partial Payment. Subtotal ₹1000, 20% off -> Grand Total ₹800,
    // ₹300 received -> ₹500 outstanding. ---
    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      discount: { type: "PERCENTAGE", value: 20, reason: "Negotiation" },
      payment: { mode: "PARTIAL", amountReceivedInPaise: 30000 },
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: sale.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);
    const orderItem = order.items[0]!;

    expect(order.subtotalInPaise).toBe(100000);
    expect(order.discountInPaise).toBe(20000);
    expect(order.totalInPaise).toBe(80000); // Grand Total
    expect(order.amountReceivedInPaise).toBe(30000);
    expect(order.outstandingInPaise).toBe(50000);
    expect(order.paymentStatus).toBe("PARTIALLY_PAID");
    expect(orderItem.effectiveLineTotalInPaise).toBe(80000); // discount allocated onto the only line

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(4);

    // --- Step 2 (Part 4): KhataBook search finds this exact customer, by
    // phone, with the correct aggregated Outstanding/Lifetime figures. ---
    const searchResults = await searchKhataBookCustomers(phone);
    const searchMatch = searchResults.find((r) => r.id === customer.id);
    expect(searchMatch).toBeDefined();
    expect(searchMatch!.outstandingInPaise).toBe(50000);
    expect(searchMatch!.lifetimePurchaseInPaise).toBe(80000); // Grand Total, never Subtotal

    const profileBeforePayment = await getKhataBookCustomerProfile(customer.customerId);
    expect(profileBeforePayment).not.toBeNull();
    expect(profileBeforePayment!.summary.outstandingInPaise).toBe(50000);
    expect(profileBeforePayment!.summary.unpaidOrderCount).toBe(1);
    expect(profileBeforePayment!.orders).toHaveLength(1);
    expect(profileBeforePayment!.ledger).toHaveLength(0); // no payment collected yet

    // --- Step 3 (Part 5): Receive Payment collects the remaining ₹500 in
    // two installments, exactly clearing the balance. ---
    const firstReceipt = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 20000,
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId,
      note: "First installment",
    });
    expect(firstReceipt.success).toBe(true);
    if (firstReceipt.success) expect(firstReceipt.outstandingAfterInPaise).toBe(30000);

    const secondReceipt = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 30000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      note: "Balance cleared",
    });
    expect(secondReceipt.success).toBe(true);
    if (secondReceipt.success) expect(secondReceipt.outstandingAfterInPaise).toBe(0);

    const orderAfterPayments = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterPayments.outstandingInPaise).toBe(0);
    expect(orderAfterPayments.amountReceivedInPaise).toBe(80000); // == Grand Total, never Subtotal
    expect(orderAfterPayments.paymentStatus).toBe("PAID");

    const profileAfterPayments = await getKhataBookCustomerProfile(customer.customerId);
    expect(profileAfterPayments!.summary.outstandingInPaise).toBe(0);
    expect(profileAfterPayments!.summary.unpaidOrderCount).toBe(0);
    expect(profileAfterPayments!.ledger).toHaveLength(2);
    // Newest first.
    expect(profileAfterPayments!.ledger[0]).toMatchObject({
      amountInPaise: 30000,
      outstandingBeforeInPaise: 30000,
      outstandingAfterInPaise: 0,
      note: "Balance cleared",
    });
    expect(profileAfterPayments!.ledger[1]).toMatchObject({
      amountInPaise: 20000,
      outstandingBeforeInPaise: 50000,
      outstandingAfterInPaise: 30000,
      note: "First installment",
    });

    // --- Step 4 (Phase 3.5 + Part 2's effective pricing): now that the
    // order is fully paid, the customer returns the item. The return
    // must use the DISCOUNTED effective price (₹800), never the ₹1000
    // catalog price, and must leave every payment/ledger fact from Step
    // 3 completely untouched. ---
    const returnRequest = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(returnRequest.success).toBe(true);
    if (!returnRequest.success) return;

    await updateReturnRequestStatus({
      returnNumber: returnRequest.returnNumber,
      newStatus: "APPROVED",
      adminUserId,
    });
    const received = await receiveReturnRequest({ returnNumber: returnRequest.returnNumber, adminUserId });
    expect(received.success).toBe(true);

    // Inventory restored regardless of discount/payment history.
    const variantAfterReturn = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(variantAfterReturn.stockQuantity).toBe(5);

    // The return claimed exactly the purchased quantity, and the
    // effective (discounted) value is what was actually returned —
    // never the ₹1000 catalog price.
    expect(orderItem.effectiveLineTotalInPaise).toBe(80000);
    expect(orderItem.effectiveLineTotalInPaise).not.toBe(orderItem.unitPriceInPaise * orderItem.quantity);

    // --- Final assertion: the WHOLE chain's own facts, re-read fresh from
    // the database, still agree with each other end to end. ---
    const orderAfterReturn = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterReturn.outstandingInPaise).toBe(0); // untouched by the return
    expect(orderAfterReturn.amountReceivedInPaise).toBe(80000); // untouched by the return
    expect(orderAfterReturn.paymentStatus).toBe("PAID"); // untouched by the return
    expect(orderAfterReturn.discountInPaise).toBe(20000); // untouched by anything downstream
    expect(orderAfterReturn.totalInPaise).toBe(80000); // Grand Total is permanent history

    const finalProfile = await getKhataBookCustomerProfile(customer.customerId);
    expect(finalProfile!.summary.returnCount).toBe(1);
    expect(finalProfile!.summary.exchangeCount).toBe(0);
    expect(finalProfile!.summary.outstandingInPaise).toBe(0);
    expect(finalProfile!.summary.lifetimePurchaseInPaise).toBe(80000);
    expect(finalProfile!.ledger).toHaveLength(2); // the return created NO ledger entry
  });
});
