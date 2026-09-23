import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { receivePayment } from "@/server/commerce/receive-payment";

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-receive-payment-${randomUUID()}`, name: "Test Receive Payment Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test Receive Payment Admin", email: `test-receive-payment-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.paymentReceipt.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
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
    data: { slug: `test-rp-product-${suffix}`, name: `Test RP Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-RP-SKU-${suffix}`, priceInPaise, stockQuantity },
  });
  return variant;
}

async function createTestCustomer(label: string) {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-RP${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName: label,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createPartialSale(params: { priceInPaise: number; amountReceivedInPaise: number; customerId: string }) {
  const variant = await createVariant(params.priceInPaise, 5);
  const sale = await createCounterSale({
    lines: [{ productVariantId: variant.id, quantity: 1 }],
    customer: { mode: "EXISTING", customerId: params.customerId },
    schoolId: null,
    paymentMethod: "CASH",
    idempotencyKey: randomUUID(),
    adminUserId,
    payment: { mode: "PARTIAL", amountReceivedInPaise: params.amountReceivedInPaise },
  });
  if (!sale.success) throw new Error("setup sale failed: " + JSON.stringify(sale.error));
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
  createdOrderIds.push(order.id);
  return order;
}

describe("receivePayment — basic collection", () => {
  it("records a partial payment: Outstanding decreases, Received increases, status stays PARTIALLY_PAID", async () => {
    const customer = await createTestCustomer("Basic Partial Payment Customer");
    // ₹1000 total, ₹400 received at sale -> ₹600 outstanding.
    const order = await createPartialSale({ priceInPaise: 100000, amountReceivedInPaise: 40000, customerId: customer.id });

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 20000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outstandingAfterInPaise).toBe(40000);

    const updatedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.amountReceivedInPaise).toBe(60000);
    expect(updatedOrder.outstandingInPaise).toBe(40000);
    expect(updatedOrder.paymentStatus).toBe("PARTIALLY_PAID");

    const receipt = await db.paymentReceipt.findUniqueOrThrow({ where: { id: result.receiptId } });
    expect(receipt.orderId).toBe(order.id);
    expect(receipt.customerId).toBe(customer.id);
    expect(receipt.amountInPaise).toBe(20000);
    expect(receipt.paymentMethod).toBe("CASH");
    expect(receipt.outstandingBeforeInPaise).toBe(60000);
    expect(receipt.outstandingAfterInPaise).toBe(40000);
    expect(receipt.createdByAdminUserId).toBe(adminUserId);
  });

  it("the final payment that exactly clears the balance moves paymentStatus to PAID", async () => {
    const customer = await createTestCustomer("Final Payment Customer");
    // ₹500 total, ₹350 received -> ₹150 outstanding.
    const order = await createPartialSale({ priceInPaise: 50000, amountReceivedInPaise: 35000, customerId: customer.id });

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 15000,
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outstandingAfterInPaise).toBe(0);

    const updatedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.outstandingInPaise).toBe(0);
    expect(updatedOrder.amountReceivedInPaise).toBe(50000);
    expect(updatedOrder.paymentStatus).toBe("PAID");
  });

  it("a full-credit order (₹0 received at sale) can be paid off across two separate receipts, matching the brief's own worked example shape", async () => {
    const customer = await createTestCustomer("Sequential Payments Customer");
    // ₹650 total, ₹0 received -> ₹650 outstanding (mirrors the brief's own
    // "Counter Sale -> Outstanding ₹650" example).
    const order = await createPartialSale({ priceInPaise: 65000, amountReceivedInPaise: 0, customerId: customer.id });

    const first = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 50000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(first.success).toBe(true);
    if (first.success) expect(first.outstandingAfterInPaise).toBe(15000);

    const afterFirst = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterFirst.paymentStatus).toBe("PARTIALLY_PAID");

    const second = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 15000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(second.success).toBe(true);
    if (second.success) expect(second.outstandingAfterInPaise).toBe(0);

    const afterSecond = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(afterSecond.paymentStatus).toBe("PAID");
    expect(afterSecond.amountReceivedInPaise).toBe(65000);

    // Ledger ordering — the two receipts, oldest first, each explaining
    // exactly how the balance moved (section 4).
    const ledger = await db.paymentReceipt.findMany({
      where: { orderId: order.id },
      orderBy: { createdAt: "asc" },
    });
    expect(ledger).toHaveLength(2);
    expect(ledger[0]).toMatchObject({ amountInPaise: 50000, outstandingBeforeInPaise: 65000, outstandingAfterInPaise: 15000 });
    expect(ledger[1]).toMatchObject({ amountInPaise: 15000, outstandingBeforeInPaise: 15000, outstandingAfterInPaise: 0 });
  });
});

describe("receivePayment — validation", () => {
  it("rejects a zero amount", async () => {
    const customer = await createTestCustomer("Zero Amount Customer");
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 10000, customerId: customer.id });

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 0,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_AMOUNT");

    const untouched = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.outstandingInPaise).toBe(20000);
  });

  it("rejects a negative amount", async () => {
    const customer = await createTestCustomer("Negative Amount Customer");
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 10000, customerId: customer.id });

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: -500,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_AMOUNT");
  });

  it("rejects an overpayment, leaving Outstanding and the ledger untouched", async () => {
    const customer = await createTestCustomer("Overpayment Customer");
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 10000, customerId: customer.id });

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 20001,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("EXCEEDS_OUTSTANDING");

    const untouched = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.outstandingInPaise).toBe(20000);
    const receiptCount = await db.paymentReceipt.count({ where: { orderId: order.id } });
    expect(receiptCount).toBe(0);
  });

  it("rejects any payment against an order that's already fully paid, with a distinct ALREADY_PAID error", async () => {
    const customer = await createTestCustomer("Already Paid Customer");
    // Full payment at sale time -> ₹0 outstanding.
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 30000, customerId: customer.id });

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 100,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ALREADY_PAID");
  });

  it("returns ORDER_NOT_FOUND for an unknown order number", async () => {
    const customer = await createTestCustomer("Unknown Order Customer");
    const result = await receivePayment({
      orderNumber: `ORD-DOES-NOT-EXIST-${randomUUID()}`,
      customerId: customer.customerId,
      amountInPaise: 100,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_FOUND");
  });

  it("returns CUSTOMER_MISMATCH when the order belongs to a different customer", async () => {
    const customerA = await createTestCustomer("Mismatch Customer A");
    const customerB = await createTestCustomer("Mismatch Customer B");
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 10000, customerId: customerA.id });

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customerB.customerId,
      amountInPaise: 5000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("CUSTOMER_MISMATCH");

    const untouched = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.outstandingInPaise).toBe(20000);
  });
});

describe("receivePayment — idempotency and concurrency", () => {
  it("returns the same receipt on a repeated submission with the same idempotency key", async () => {
    const customer = await createTestCustomer("Idempotent Payment Customer");
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 10000, customerId: customer.id });
    const idempotencyKey = randomUUID();
    const params = {
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 5000,
      paymentMethod: "CASH" as const,
      idempotencyKey,
      adminUserId,
    };

    const first = await receivePayment(params);
    expect(first.success).toBe(true);

    const second = await receivePayment(params);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(second.receiptId).toBe(first.receiptId);
      expect(second.alreadyExisted).toBe(true);
    }

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    // Only ONE ₹50 payment applied — not two.
    expect(finalOrder.outstandingInPaise).toBe(15000);
    const receiptCount = await db.paymentReceipt.count({ where: { orderId: order.id } });
    expect(receiptCount).toBe(1);
  });

  it("handles two truly concurrent submissions with the SAME idempotency key without double-applying", async () => {
    const customer = await createTestCustomer("Concurrent Idempotent Customer");
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 10000, customerId: customer.id });
    const idempotencyKey = randomUUID();
    const params = {
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 5000,
      paymentMethod: "CASH" as const,
      idempotencyKey,
      adminUserId,
    };

    const [first, second] = await Promise.all([receivePayment(params), receivePayment(params)]);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (first.success && second.success) {
      expect(first.receiptId).toBe(second.receiptId);
    }

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.outstandingInPaise).toBe(15000);
    const receiptCount = await db.paymentReceipt.count({ where: { orderId: order.id } });
    expect(receiptCount).toBe(1);
  });

  it("allows exactly one of two concurrent DIFFERENT payments to win when together they'd overpay", async () => {
    const customer = await createTestCustomer("Concurrent Overpay Customer");
    // ₹300 outstanding.
    const order = await createPartialSale({ priceInPaise: 30000, amountReceivedInPaise: 0, customerId: customer.id });

    const [resultA, resultB] = await Promise.all([
      receivePayment({
        orderNumber: order.orderNumber,
        customerId: customer.customerId,
        amountInPaise: 20000,
        paymentMethod: "CASH",
        idempotencyKey: randomUUID(),
        adminUserId,
      }),
      receivePayment({
        orderNumber: order.orderNumber,
        customerId: customer.customerId,
        amountInPaise: 20000,
        paymentMethod: "CASH",
        idempotencyKey: randomUUID(),
        adminUserId,
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    const failures = [resultA, resultB].filter((r) => !r.success);
    // Exactly one succeeds (₹200 -> ₹100 outstanding); the second, racing
    // against the freshly-updated balance, either fails validation
    // (₹200 > ₹100 remaining) or hits the concurrency guard — either way,
    // it never silently double-applies.
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.outstandingInPaise).toBe(10000);
    expect(finalOrder.outstandingInPaise).toBeGreaterThanOrEqual(0);
  });
});

describe("receivePayment — payment status derivation reuses src/lib/payment.ts", () => {
  it("a full-credit order's first payment moves UNPAID toward PARTIALLY_PAID, never skipping straight to PAID", async () => {
    const customer = await createTestCustomer("Status Derivation Customer");
    const order = await createPartialSale({ priceInPaise: 40000, amountReceivedInPaise: 0, customerId: customer.id });
    expect(order.paymentStatus).toBe("UNPAID");

    const result = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 10000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(result.success).toBe(true);

    const updated = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe("PARTIALLY_PAID");
  });
});
