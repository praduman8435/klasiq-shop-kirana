import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { RETURN_WINDOW_DAYS } from "@/lib/return-lifecycle";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { createReturnRequest } from "@/server/commerce/returns";

// Phase 3.5 Part 5 — Admin Override. Real Postgres integration tests,
// mirroring src/server/commerce/__tests__/returns.test.ts's own fixture
// shape exactly.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-return-override-${randomUUID()}`, name: "Test Return Override Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: {
      name: "Test Override Admin",
      email: `test-override-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
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

async function createTestCustomer(displayName: string) {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-OV${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createOrder(params: {
  customerId: string;
  deliveredAt: Date | null;
  status?: "DELIVERED" | "PENDING";
  itemQuantity?: number;
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-override-product-${suffix}`, name: `Test Override Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-OVERRIDE-SKU-${suffix}`, priceInPaise: 30000, stockQuantity: 10 },
  });
  const quantity = params.itemQuantity ?? 2;
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-OVERRIDE-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId: params.customerId,
      customerName: "Test Override Customer",
      customerMobile: "9800000000",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      status: params.status ?? (params.deliveredAt ? "DELIVERED" : "PENDING"),
      deliveredAt: params.deliveredAt,
      subtotalInPaise: 30000 * quantity,
      deliveryFeeInPaise: 0,
      totalInPaise: 30000 * quantity,
      amountReceivedInPaise: 30000 * quantity,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 30000,
            quantity,
            lineTotalInPaise: 30000 * quantity,
            effectiveLineTotalInPaise: 30000 * quantity,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return { order, orderItem: order.items[0]! };
}

describe("createReturnRequest — Admin Override bypasses the delivery/window rules", () => {
  it("without override: a not-yet-delivered order is still rejected", async () => {
    const customer = await createTestCustomer("No Override Not Delivered Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: null, status: "PENDING" });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_DELIVERED");
  });

  it("with override: a not-yet-delivered order is accepted, and the override is persisted", async () => {
    const customer = await createTestCustomer("Override Not Delivered Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: null, status: "PENDING" });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
      override: { reason: "VIP school — owner approved early return.", adminUserId },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber: result.returnNumber } });
    expect(row.overrideReason).toBe("VIP school — owner approved early return.");
    expect(row.overriddenByAdminUserId).toBe(adminUserId);
    expect(row.overriddenAt).not.toBeNull();
  });

  it("without override: a return past the 7-day window is still rejected", async () => {
    const customer = await createTestCustomer("No Override Expired Customer");
    const { order, orderItem } = await createOrder({
      customerId: customer.id,
      deliveredAt: new Date(Date.now() - (RETURN_WINDOW_DAYS + 3) * 24 * 60 * 60 * 1000),
    });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("RETURN_WINDOW_EXPIRED");
  });

  it("with override: a return past the 7-day window is accepted", async () => {
    const customer = await createTestCustomer("Override Expired Customer");
    const { order, orderItem } = await createOrder({
      customerId: customer.id,
      deliveredAt: new Date(Date.now() - (RETURN_WINDOW_DAYS + 3) * 24 * 60 * 60 * 1000),
    });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
      override: { reason: "Return after 7 days — owner exception.", adminUserId },
    });
    expect(result.success).toBe(true);
  });

  it("override NEVER bypasses the quantity-availability check — over-quantity is still rejected", async () => {
    const customer = await createTestCustomer("Override Quantity Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: new Date(), itemQuantity: 2 });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 5, reason: "OTHER" }],
      override: { reason: "Trying to bypass quantity — must still fail.", adminUserId },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INSUFFICIENT_QUANTITY");
  });

  it("override NEVER bypasses the quantity check even after the item is already fully claimed", async () => {
    const customer = await createTestCustomer("Override Fully Claimed Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: new Date(), itemQuantity: 1 });

    const first = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(first.success).toBe(true);

    const overrideAttempt = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
      override: { reason: "Trying again with override on an already-claimed item.", adminUserId },
    });
    expect(overrideAttempt.success).toBe(false);
    if (!overrideAttempt.success) expect(overrideAttempt.error.type).toBe("INSUFFICIENT_QUANTITY");
  });

  it("a request created without an override leaves the override fields null", async () => {
    const customer = await createTestCustomer("No Override Fields Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: new Date() });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber: result.returnNumber } });
    expect(row.overrideReason).toBeNull();
    expect(row.overriddenAt).toBeNull();
    expect(row.overriddenByAdminUserId).toBeNull();
  });
});

describe("createReturnRequest — concurrent Admin Override creation", () => {
  it("two concurrent overridden requests racing for the same last unit — only one succeeds", async () => {
    const customer = await createTestCustomer("Concurrent Override Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: null, status: "PENDING", itemQuantity: 1 });

    const [a, b] = await Promise.all([
      createReturnRequest({
        customerId: customer.id,
        orderNumber: order.orderNumber,
        type: "RETURN",
        items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
        override: { reason: "Concurrent override attempt A", adminUserId },
      }),
      createReturnRequest({
        customerId: customer.id,
        orderNumber: order.orderNumber,
        type: "RETURN",
        items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
        override: { reason: "Concurrent override attempt B", adminUserId },
      }),
    ]);

    const successes = [a, b].filter((r) => r.success);
    expect(successes).toHaveLength(1);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(1);
  });
});

describe("createReturnRequest — repeated exchanges and return after partial exchange", () => {
  it("supports an EXCHANGE for part of the quantity, then a RETURN for the rest", async () => {
    const customer = await createTestCustomer("Partial Exchange Then Return Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: new Date(), itemQuantity: 4 });

    const exchange = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 2, reason: "WRONG_SIZE" }],
    });
    expect(exchange.success).toBe(true);

    const laterReturn = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 2, reason: "CHANGED_MIND" }],
    });
    expect(laterReturn.success).toBe(true);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(4);

    const nothingLeft = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(nothingLeft.success).toBe(false);
    if (!nothingLeft.success) expect(nothingLeft.error.type).toBe("INSUFFICIENT_QUANTITY");
  });

  it("supports two separate EXCHANGE requests against the same item's remaining quantity", async () => {
    const customer = await createTestCustomer("Repeated Exchange Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: new Date(), itemQuantity: 4 });

    const firstExchange = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(firstExchange.success).toBe(true);

    const secondExchange = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(secondExchange.success).toBe(true);
    expect(secondExchange).not.toEqual(firstExchange);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(2);
  });
});

describe("createReturnRequest — duplicate browser submission (documented, bounded behavior)", () => {
  it("two identical rapid submissions both succeed as separate requests, but never claim more than purchased", async () => {
    const customer = await createTestCustomer("Duplicate Submission Customer");
    const { order, orderItem } = await createOrder({ customerId: customer.id, deliveredAt: new Date(), itemQuantity: 4 });

    const submitSameRequestTwice = () =>
      createReturnRequest({
        customerId: customer.id,
        orderNumber: order.orderNumber,
        type: "RETURN",
        items: [{ orderItemId: orderItem.id, quantity: 2, reason: "CHANGED_MIND" }],
      });

    const [first, second] = await Promise.all([submitSameRequestTwice(), submitSameRequestTwice()]);

    // Both requests are identical in content (same item, same quantity) —
    // this is the "duplicate double-click" scenario. Both are allowed to
    // succeed as two DISTINCT ReturnRequest rows (2 + 2 = 4, exactly the
    // purchased quantity) — a real, disclosed limitation (no idempotency
    // key exists for this creation path, unlike checkout's Order), but
    // the quantity guard still makes it impossible to ever claim MORE
    // than what was purchased, regardless of how many duplicates land.
    expect([first.success, second.success].filter(Boolean)).toHaveLength(2);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(4);

    // A third identical attempt now correctly fails — nothing left.
    const third = await submitSameRequestTwice();
    expect(third.success).toBe(false);
    if (!third.success) expect(third.error.type).toBe("INSUFFICIENT_QUANTITY");
  });
});

describe("edge case — a request created within the window can still be administratively processed after the window later passes", () => {
  it("approving/rejecting/cancelling a REQUESTED row never re-checks the return window (only creation does)", async () => {
    const customer = await createTestCustomer("Expired After Creation Customer");
    // Delivered 6 days ago — still within the window at creation time.
    const { order, orderItem } = await createOrder({
      customerId: customer.id,
      deliveredAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000),
    });

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    // Simulate time passing well beyond the window before the admin acts
    // on it — the request itself doesn't expire; only NEW creation is
    // window-gated. Backdating deliveredAt further is the deterministic
    // equivalent of "time has now passed" without a real wait.
    await db.order.update({
      where: { id: order.id },
      data: { deliveredAt: new Date(Date.now() - (RETURN_WINDOW_DAYS + 30) * 24 * 60 * 60 * 1000) },
    });

    const approved = await updateReturnRequestStatus({
      returnNumber: created.returnNumber,
      newStatus: "APPROVED",
      adminUserId,
    });
    expect(approved.success).toBe(true);
  });
});
