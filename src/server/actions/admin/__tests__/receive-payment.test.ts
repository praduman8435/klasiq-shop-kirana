import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as returns.test.ts/session.test.ts
// — exercises the REAL getAdminSession()/createAdminSession(), not a
// stubbed session object.
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (arg: string | { name: string }) => {
      store.delete(typeof arg === "string" ? arg : arg.name);
    },
  }),
}));

// revalidatePath requires a real Next.js request-scoped render context a
// plain Vitest run has none of — mocked as a no-op, same as
// returns.test.ts.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAdminSession } from "@/lib/admin/session";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { receivePaymentAction } from "@/server/actions/admin/receive-payment";

let categoryId: string;
let adminId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdAdminIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.paymentReceipt.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

async function setup() {
  if (!categoryId) {
    const category = await db.category.create({
      data: { slug: `test-receive-payment-action-${randomUUID()}`, name: "Test Receive Payment Action Category" },
    });
    categoryId = category.id;
  }
  if (!adminId) {
    const admin = await db.adminUser.create({
      data: {
        name: "Test Receive Payment Action Admin",
        email: `test-receive-payment-action-${randomUUID()}@example.com`,
        passwordHash: "unused:unused",
      },
    });
    adminId = admin.id;
    createdAdminIds.push(admin.id);
  }
}

async function createUnpaidOrder() {
  await setup();
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-RPA${randomUUID().slice(0, 4).toUpperCase()}`,
      displayName: "Test Receive Payment Action Customer",
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);

  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-rpa-product-${suffix}`, name: `Test RPA Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-RPA-SKU-${suffix}`, priceInPaise: 30000, stockQuantity: 5 },
  });

  const sale = await createCounterSale({
    lines: [{ productVariantId: variant.id, quantity: 1 }],
    customer: { mode: "EXISTING", customerId: customer.id },
    schoolId: null,
    paymentMethod: "CASH",
    idempotencyKey: randomUUID(),
    adminUserId: adminId,
    payment: { mode: "PARTIAL", amountReceivedInPaise: 10000 },
  });
  if (!sale.success) throw new Error("fixture setup failed: " + JSON.stringify(sale.error));
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
  createdOrderIds.push(order.id);

  return { customer, order };
}

describe("receivePaymentAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no session at all, without touching the order", async () => {
    const { customer, order } = await createUnpaidOrder();

    const result = await receivePaymentAction({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 5000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");

    const untouched = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.outstandingInPaise).toBe(20000);
  });
});

describe("receivePaymentAction — validation", () => {
  it("rejects a malformed payload (negative amount) with VALIDATION, without touching the order", async () => {
    const { customer, order } = await createUnpaidOrder();
    await createAdminSession(adminId);

    const result = await receivePaymentAction({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: -100,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");

    const untouched = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.outstandingInPaise).toBe(20000);
  });

  it("rejects an unknown payment method with VALIDATION", async () => {
    const { customer, order } = await createUnpaidOrder();
    await createAdminSession(adminId);

    const result = await receivePaymentAction({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 5000,
      paymentMethod: "CASH_ON_DELIVERY",
      idempotencyKey: randomUUID(),
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });
});

describe("receivePaymentAction — happy path", () => {
  it("records a real payment, with adminUserId resolved from the session, never from client input", async () => {
    const { customer, order } = await createUnpaidOrder();
    await createAdminSession(adminId);

    const result = await receivePaymentAction({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 5000,
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      // Even if a malicious client tried to smuggle its own adminUserId in
      // here, receivePaymentSchema has no such field to parse it into —
      // this key is simply dropped by zod's default (non-passthrough)
      // parsing.
      adminUserId: "not-the-real-admin",
    } as never);

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.outstandingAfterInPaise).toBe(15000);

    const receipt = await db.paymentReceipt.findUniqueOrThrow({ where: { id: result.receiptId } });
    expect(receipt.createdByAdminUserId).toBe(adminId);
  });
});
