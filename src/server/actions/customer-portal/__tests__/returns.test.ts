import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real-cookie-store mock as session.test.ts — this exercises the
// REAL getCustomerSession()/createCustomerSession() code path (real
// cookie name, real token hashing), not a stubbed session object. See
// docs/PHASE_3_4_REPORT.md "Testing — session".
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

import { createCustomerSession } from "@/lib/customer-portal/session";
import { createReturnRequestAction } from "@/server/actions/customer-portal/returns";

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];
const usedPhones: string[] = [];

beforeEach(() => {
  store.clear();
});

async function setup() {
  if (!categoryId) {
    const category = await db.category.create({
      data: { slug: `test-returns-action-${randomUUID()}`, name: "Test Returns Action Category" },
    });
    categoryId = category.id;
  }
}

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  if (usedPhones.length) await db.customerSession.deleteMany({ where: { phoneNormalized: { in: usedPhones } } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  const phone = `${firstDigit}${rest}`;
  usedPhones.push(`+91${phone}`);
  return phone;
}

async function createTestCustomer(displayName: string) {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-A${randomUUID().slice(0, 6).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createDeliveredOrderFor(customerId: string) {
  await setup();
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-returns-action-product-${suffix}`, name: `Test Action Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-RETACT-SKU-${suffix}`, priceInPaise: 25000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-RETACT-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId,
      customerName: "Test Action Customer",
      customerMobile: "9800000000",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 25000 * 2,
      deliveryFeeInPaise: 0,
      totalInPaise: 25000 * 2,
      amountReceivedInPaise: 25000 * 2,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 25000,
            quantity: 2,
            lineTotalInPaise: 25000 * 2,
            effectiveLineTotalInPaise: 25000 * 2,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return { order, orderItem: order.items[0]! };
}

describe("createReturnRequestAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no session", async () => {
    const result = await createReturnRequestAction({
      orderNumber: "ORD-DOES-NOT-MATTER",
      type: "RETURN",
      items: [{ orderItemId: "fake", quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });

  it("never trusts a customerId supplied in input — only the session's own customer can be used", async () => {
    const customerA = await createTestCustomer("Action Customer A");
    const customerB = await createTestCustomer("Action Customer B");
    const { order, orderItem } = await createDeliveredOrderFor(customerB.id);

    await createCustomerSession(`+91${customerA.primaryPhone}`);

    const result = await createReturnRequestAction({
      orderNumber: order.orderNumber,
      type: "RETURN",
      // Even if a client tried to smuggle a different customerId in here,
      // the schema has no such field — createReturnRequestAction always
      // resolves customerId from the verified session itself.
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_FOUND");
  });
});

describe("createReturnRequestAction — validation", () => {
  it("rejects malformed input before ever touching the domain layer", async () => {
    const customer = await createTestCustomer("Action Validation Customer");
    await createCustomerSession(`+91${customer.primaryPhone}`);

    const result = await createReturnRequestAction({
      orderNumber: "ORD-WHATEVER",
      type: "NOT_A_REAL_TYPE",
      items: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });
});

describe("createReturnRequestAction — success path", () => {
  it("creates a real ReturnRequest for the session's own order and returns its returnNumber", async () => {
    const customer = await createTestCustomer("Action Success Customer");
    const { order, orderItem } = await createDeliveredOrderFor(customer.id);
    await createCustomerSession(`+91${customer.primaryPhone}`);

    const result = await createReturnRequestAction({
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.returnNumber).toMatch(/^RET-\d{8}-[A-Z0-9]{5}$/);

    const created = await db.returnRequest.findUniqueOrThrow({ where: { id: result.returnRequestId } });
    expect(created.customerId).toBe(customer.id);
  });
});
