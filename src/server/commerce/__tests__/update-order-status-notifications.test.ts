import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Phase 3.6 Part 2 — proves the WIRING between updateOrderStatus and the
// notification service: the right event fires for the right transition,
// exactly once per genuine transition (never on an idempotent no-op,
// never for a losing concurrent call, never for CANCELLED), and that a
// notification failure never affects the order's own status. The
// notification service's own internal logic is covered separately in
// src/server/whatsapp/__tests__/notification-service.test.ts.
vi.mock("@/server/whatsapp/notification-service", () => ({
  notifyOrderEvent: vi.fn().mockResolvedValue(undefined),
}));
import { notifyOrderEvent } from "@/server/whatsapp/notification-service";
import { updateOrderStatus } from "@/server/commerce/update-order-status";

const mockedNotifyOrderEvent = vi.mocked(notifyOrderEvent);

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeEach(() => {
  mockedNotifyOrderEvent.mockClear();
  mockedNotifyOrderEvent.mockResolvedValue(undefined);
});

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-order-status-notify-${randomUUID()}`, name: "Test Order Status Notify Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test Notify Admin", email: `test-notify-admin-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.adminUser.delete({ where: { id: adminUserId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createTestOrder(params: {
  fulfillmentType: "STORE_PICKUP" | "LOCAL_DELIVERY" | "COUNTER_HANDOVER";
  status: "PENDING" | "CONFIRMED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  source?: "ONLINE" | "COUNTER";
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-notify-status-product-${suffix}`, name: `Test Notify Status Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-NOTIFY-STATUS-SKU-${suffix}`, priceInPaise: 30000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-NOTIFYSTATUS-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: params.source ?? "ONLINE",
      customerName: "Notify Status Customer",
      customerMobile: "9876500000",
      customerWhatsapp: "9876500000",
      fulfillmentType: params.fulfillmentType,
      paymentMethod: "CASH_ON_DELIVERY",
      status: params.status,
      subtotalInPaise: 30000,
      totalInPaise: 30000,
      amountReceivedInPaise: 30000,
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
            quantity: 1,
            lineTotalInPaise: 30000,
            effectiveLineTotalInPaise: 30000,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);
  return { order };
}

describe("updateOrderStatus — status-transition notification wiring", () => {
  it("CONFIRMED notifies with ORDER_CONFIRMED exactly once", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PENDING" });
    const result = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CONFIRMED", adminUserId });
    expect(result.success).toBe(true);
    expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);
    const [orderArg, eventArg] = mockedNotifyOrderEvent.mock.calls[0]!;
    expect(eventArg).toBe("ORDER_CONFIRMED");
    expect(orderArg.orderNumber).toBe(order.orderNumber);
  });

  it("PREPARING notifies with PREPARING", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "CONFIRMED" });
    await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "PREPARING", adminUserId });
    expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);
    expect(mockedNotifyOrderEvent.mock.calls[0]![1]).toBe("PREPARING");
  });

  it("READY_FOR_PICKUP notifies with READY_FOR_PICKUP (Store Pickup only)", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PREPARING" });
    await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "READY_FOR_PICKUP", adminUserId });
    expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);
    expect(mockedNotifyOrderEvent.mock.calls[0]![1]).toBe("READY_FOR_PICKUP");
  });

  it("DELIVERED notifies with DELIVERED", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "LOCAL_DELIVERY", status: "OUT_FOR_DELIVERY" });
    await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "DELIVERED", adminUserId });
    expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);
    expect(mockedNotifyOrderEvent.mock.calls[0]![1]).toBe("DELIVERED");
  });

  it("CANCELLED does NOT trigger any notification — not in the fixed event list", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "CONFIRMED" });
    const result = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId });
    expect(result.success).toBe(true);
    expect(mockedNotifyOrderEvent).not.toHaveBeenCalled();
  });

  describe("duplicate prevention (section 11)", () => {
    it("a repeat call to the same already-reached status does not notify a second time", async () => {
      const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PENDING" });
      await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CONFIRMED", adminUserId });
      expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);

      const second = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CONFIRMED", adminUserId });
      expect(second).toEqual({ success: true, alreadyInState: true });
      expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1); // still just once
    });

    it("exactly one of two concurrent transitions to the same new status notifies — the concurrency-losing call never does", async () => {
      const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PENDING" });

      const [a, b] = await Promise.all([
        updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CONFIRMED", adminUserId }),
        updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CONFIRMED", adminUserId }),
      ]);

      const successes = [a, b].filter((r) => r.success && !r.alreadyInState);
      expect(successes).toHaveLength(1);
      expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);
    });
  });

  describe("failure handling (section 9)", () => {
    it("does not affect the order's own status when notifyOrderEvent throws", async () => {
      mockedNotifyOrderEvent.mockRejectedValueOnce(new Error("simulated notification service crash"));
      const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PENDING" });

      const result = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CONFIRMED", adminUserId });
      expect(result.success).toBe(true);

      const updated = await db.order.findUniqueOrThrow({ where: { orderNumber: order.orderNumber } });
      expect(updated.status).toBe("CONFIRMED");
    });
  });
});
