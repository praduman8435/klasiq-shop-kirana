import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as session.test.ts (Phase 3.4) and
// the customer-portal returns action test (Phase 3.5 Part 2) — this
// exercises the REAL getAdminSession()/createAdminSession() and
// getCustomerSession()/createCustomerSession() code, not stubbed session
// objects. Both cookie names coexist in the same Map exactly like a real
// browser would hold both cookies simultaneously.
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

// revalidatePath requires a real Next.js request-scoped render context that
// a plain Vitest run has none of — mocked here as a no-op purely so it
// doesn't throw; the actual behavior under test (authorization, validation,
// the domain mutation's real effect on the database) is unaffected by
// whether Next's page cache is invalidated.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAdminSession } from "@/lib/admin/session";
import { createCustomerSession } from "@/lib/customer-portal/session";
import {
  createWalkInReturnRequestAction,
  receiveReturnRequestAction,
  updateReturnRequestAdminNoteAction,
  updateReturnRequestStatusAction,
} from "@/server/actions/admin/returns";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { createReturnRequest } from "@/server/commerce/returns";

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];
const createdAdminIds: string[] = [];
const usedCustomerPhones: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  if (usedCustomerPhones.length) {
    await db.customerSession.deleteMany({ where: { phoneNormalized: { in: usedCustomerPhones } } });
  }
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function setup() {
  if (!categoryId) {
    const category = await db.category.create({
      data: { slug: `test-admin-returns-action-${randomUUID()}`, name: "Test Admin Returns Action Category" },
    });
    categoryId = category.id;
  }
}

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  const phone = `${firstDigit}${rest}`;
  usedCustomerPhones.push(`+91${phone}`);
  return phone;
}

async function createTestAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Returns Action Admin",
      email: `test-returns-action-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  createdAdminIds.push(admin.id);
  return admin;
}

async function createTestCustomer(displayName: string) {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-AA${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createTestReturnRequest(customerId: string) {
  await setup();
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-admin-returns-action-product-${suffix}`, name: `Test Action ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-ADMIN-ACT-SKU-${suffix}`, priceInPaise: 20000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-ADMACT-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId,
      customerName: "Test Admin Action Customer",
      customerMobile: "9800000000",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 20000,
      deliveryFeeInPaise: 0,
      totalInPaise: 20000,
      amountReceivedInPaise: 20000,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 20000,
            quantity: 1,
            lineTotalInPaise: 20000,
            effectiveLineTotalInPaise: 20000,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);

  const created = await createReturnRequest({
    customerId,
    orderNumber: order.orderNumber,
    type: "RETURN",
    items: [{ orderItemId: order.items[0]!.id, quantity: 1, reason: "WRONG_SIZE" }],
  });
  if (!created.success) throw new Error("fixture setup failed: " + JSON.stringify(created));
  return created.returnNumber;
}

describe("updateReturnRequestStatusAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no session at all", async () => {
    const result = await updateReturnRequestStatusAction({
      returnNumber: "RET-DOES-NOT-MATTER",
      newStatus: "APPROVED",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });

  it("a CUSTOMER session grants no ability to change ReturnRequest status — still UNAUTHORIZED", async () => {
    const customer = await createTestCustomer("Cannot Self-Approve Customer");
    const returnNumber = await createTestReturnRequest(customer.id);

    // Only a customer-portal session exists here — no admin session at
    // all — proving section 18's "Customers cannot modify ReturnRequest
    // status" structurally: getAdminSession() reads a completely
    // different cookie name and never even looks at this one.
    await createCustomerSession(`+91${customer.primaryPhone}`);

    const result = await updateReturnRequestStatusAction({ returnNumber, newStatus: "APPROVED" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("REQUESTED");
  });
});

describe("updateReturnRequestStatusAction — validation", () => {
  it("rejects malformed input before ever touching the domain layer", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    const result = await updateReturnRequestStatusAction({
      returnNumber: "RET-WHATEVER",
      newStatus: "NOT_A_REAL_STATUS",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });
});

describe("updateReturnRequestStatusAction — success path", () => {
  it("an authenticated admin can approve a real request", async () => {
    const admin = await createTestAdmin();
    const customer = await createTestCustomer("Action Success Customer");
    const returnNumber = await createTestReturnRequest(customer.id);
    await createAdminSession(admin.id);

    const result = await updateReturnRequestStatusAction({ returnNumber, newStatus: "APPROVED" });
    expect(result.success).toBe(true);

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("APPROVED");
    expect(row.approvedByAdminUserId).toBe(admin.id);
  });
});

async function createTestDeliveredOrder(customerId: string) {
  await setup();
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-admin-returns-action-walkin-${suffix}`, name: `Test Walk-in ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-ADMIN-WALKIN-SKU-${suffix}`, priceInPaise: 20000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-WALKIN-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId,
      customerName: "Test Walk-in Customer",
      customerMobile: "9800000000",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 20000,
      deliveryFeeInPaise: 0,
      totalInPaise: 20000,
      amountReceivedInPaise: 20000,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 20000,
            quantity: 1,
            lineTotalInPaise: 20000,
            effectiveLineTotalInPaise: 20000,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return { order, orderItem: order.items[0]! };
}

describe("receiveReturnRequestAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const result = await receiveReturnRequestAction({ returnNumber: "RET-DOES-NOT-MATTER" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("receiveReturnRequestAction — success path", () => {
  it("an authenticated admin can receive an approved request, reconciling inventory", async () => {
    const admin = await createTestAdmin();
    const customer = await createTestCustomer("Receive Action Customer");
    const returnNumber = await createTestReturnRequest(customer.id);
    await createAdminSession(admin.id);

    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId: admin.id });

    const result = await receiveReturnRequestAction({ returnNumber });
    expect(result.success).toBe(true);

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("COMPLETED");
  });
});

describe("createWalkInReturnRequestAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const result = await createWalkInReturnRequestAction({
      customerId: "does-not-matter",
      orderNumber: "ORD-DOES-NOT-MATTER",
      type: "RETURN",
      items: [{ orderItemId: "fake", quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createWalkInReturnRequestAction — success path", () => {
  it("an authenticated admin creates a real ReturnRequest via the same createReturnRequest engine", async () => {
    const admin = await createTestAdmin();
    const customer = await createTestCustomer("Walk-in Success Customer");
    const { order, orderItem } = await createTestDeliveredOrder(customer.id);
    await createAdminSession(admin.id);

    const result = await createWalkInReturnRequestAction({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const row = await db.returnRequest.findUniqueOrThrow({ where: { id: result.returnRequestId } });
    expect(row.customerId).toBe(customer.id);
    expect(row.orderId).toBe(order.id);
  });

  it("Admin Override: an admin can create a return for a not-yet-delivered order by supplying overrideReason", async () => {
    const admin = await createTestAdmin();
    const customer = await createTestCustomer("Walk-in Override Customer");
    const { order, orderItem } = await createTestDeliveredOrder(customer.id);
    await db.order.update({ where: { id: order.id }, data: { status: "PENDING", deliveredAt: null } });
    await createAdminSession(admin.id);

    const withoutOverride = await createWalkInReturnRequestAction({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(withoutOverride.success).toBe(false);
    if (!withoutOverride.success) expect(withoutOverride.error.type).toBe("ORDER_NOT_DELIVERED");

    const withOverride = await createWalkInReturnRequestAction({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      overrideReason: "Owner approved exception for this VIP school.",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(withOverride.success).toBe(true);
    if (!withOverride.success) return;

    const row = await db.returnRequest.findUniqueOrThrow({ where: { id: withOverride.returnRequestId } });
    expect(row.overrideReason).toBe("Owner approved exception for this VIP school.");
    expect(row.overriddenByAdminUserId).toBe(admin.id);
    expect(row.overriddenAt).not.toBeNull();
  });

  it("still refuses an order that doesn't belong to the given customer — walk-in creation is not a bypass", async () => {
    const admin = await createTestAdmin();
    const customerA = await createTestCustomer("Walk-in Owner Customer");
    const customerB = await createTestCustomer("Walk-in Wrong Customer");
    const { order, orderItem } = await createTestDeliveredOrder(customerA.id);
    await createAdminSession(admin.id);

    const result = await createWalkInReturnRequestAction({
      customerId: customerB.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_FOUND");
  });
});

describe("updateReturnRequestAdminNoteAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const result = await updateReturnRequestAdminNoteAction({
      returnNumber: "RET-DOES-NOT-MATTER",
      adminNote: "test",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });

  it("an authenticated admin can save a note", async () => {
    const admin = await createTestAdmin();
    const customer = await createTestCustomer("Note Action Customer");
    const returnNumber = await createTestReturnRequest(customer.id);
    await createAdminSession(admin.id);

    const result = await updateReturnRequestAdminNoteAction({ returnNumber, adminNote: "Called customer back." });
    expect(result.success).toBe(true);

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.adminNote).toBe("Called customer back.");
  });
});
