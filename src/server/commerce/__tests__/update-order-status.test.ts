import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { updateOrderStatus, updatePaymentStatus } from "@/server/commerce/update-order-status";

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-order-status-${randomUUID()}`, name: "Test Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: {
      name: "Test Admin",
      email: `test-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await db.adminUser.delete({ where: { id: adminUserId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createTestOrder(params: {
  fulfillmentType: "STORE_PICKUP" | "LOCAL_DELIVERY";
  status?: "PENDING" | "CONFIRMED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  stockQuantity?: number;
  itemQuantity?: number;
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-product-${suffix}`, name: `Test Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);

  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-SKU-${suffix}`,
      priceInPaise: 35000,
      stockQuantity: params.stockQuantity ?? 10,
      lowStockThreshold: 5,
    },
  });

  const itemQuantity = params.itemQuantity ?? 3;
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      customerName: "Test Customer",
      customerMobile: "9876543210",
      fulfillmentType: params.fulfillmentType,
      paymentMethod: "CASH_ON_DELIVERY",
      status: params.status ?? "CONFIRMED",
      subtotalInPaise: 35000 * itemQuantity,
      totalInPaise: 35000 * itemQuantity,
      amountReceivedInPaise: 35000 * itemQuantity,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 35000,
            quantity: itemQuantity,
            lineTotalInPaise: 35000 * itemQuantity,
            effectiveLineTotalInPaise: 35000 * itemQuantity,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);

  return { order, variant, product };
}

describe("updateOrderStatus — valid/invalid transitions", () => {
  it("allows PENDING -> CONFIRMED for a pickup order", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PENDING" });
    const result = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CONFIRMED", adminUserId });
    expect(result.success).toBe(true);

    const updated = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.status).toBe("CONFIRMED");
  });

  it("rejects skipping straight from PENDING to DELIVERED", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PENDING" });
    const result = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "DELIVERED", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");

    const untouched = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(untouched.status).toBe("PENDING");
  });

  it("rejects OUT_FOR_DELIVERY for a Store Pickup order", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "PREPARING" });
    const result = await updateOrderStatus({
      orderNumber: order.orderNumber,
      newStatus: "OUT_FOR_DELIVERY",
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });

  it("returns NOT_FOUND for an unknown order number", async () => {
    const result = await updateOrderStatus({
      orderNumber: "ORD-DOES-NOT-EXIST",
      newStatus: "CONFIRMED",
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
  });
});

describe("updateOrderStatus — cancellation restores inventory", () => {
  it("restores stock exactly once and records an audit entry", async () => {
    const { order, variant } = await createTestOrder({
      fulfillmentType: "STORE_PICKUP",
      status: "CONFIRMED",
      stockQuantity: 10,
      itemQuantity: 3,
    });

    const result = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId });
    expect(result.success).toBe(true);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(13); // 10 + 3 restored

    const adjustments = await db.inventoryAdjustment.findMany({ where: { orderId: order.id } });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      reason: "ORDER_CANCELLATION_RESTORE",
      previousQuantity: 10,
      newQuantity: 13,
      delta: 3,
      adminUserId,
    });
  });

  it("does not restore inventory twice on a repeated (sequential) cancellation", async () => {
    const { order, variant } = await createTestOrder({
      fulfillmentType: "STORE_PICKUP",
      status: "CONFIRMED",
      stockQuantity: 10,
      itemQuantity: 2,
    });

    const first = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId });
    expect(first.success).toBe(true);
    if (first.success) expect(first.alreadyInState).toBe(false);

    const second = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId });
    expect(second.success).toBe(true);
    if (second.success) expect(second.alreadyInState).toBe(true);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(12); // 10 + 2, restored only once

    const adjustments = await db.inventoryAdjustment.findMany({ where: { orderId: order.id } });
    expect(adjustments).toHaveLength(1);
  });

  it("does not restore inventory twice under a true concurrent double-cancel", async () => {
    const { order, variant } = await createTestOrder({
      fulfillmentType: "STORE_PICKUP",
      status: "CONFIRMED",
      stockQuantity: 10,
      itemQuantity: 4,
    });

    const [a, b] = await Promise.all([
      updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId }),
      updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId }),
    ]);

    const successes = [a, b].filter((r) => r.success);
    // Exactly one wins the guarded status transition; the other either sees
    // it already CANCELLED (idempotent success) or hits the concurrency
    // guard (CONFLICT) — both are safe, neither double-restores.
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(14); // 10 + 4, restored exactly once

    const adjustments = await db.inventoryAdjustment.findMany({ where: { orderId: order.id } });
    expect(adjustments).toHaveLength(1);

    const finalOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(finalOrder.status).toBe("CANCELLED");
  });

  it("logs an accurate audit entry for each order when two different orders sharing the same variant are cancelled concurrently", async () => {
    // Regression test — src/server/commerce/update-order-status.ts's
    // CANCELLED branch used to read the variant, then separately compute
    // previousQuantity/newQuantity from that same (increasingly stale)
    // read for the InventoryAdjustment log, instead of reusing
    // applyInventoryDelta's re-read-after-write pattern. The stockQuantity
    // column itself was always correct (its own update was a genuine
    // atomic increment), but two concurrent cancellations touching the
    // same variant could each log a previousQuantity/newQuantity that
    // never actually existed on the row.
    const suffix = randomUUID();
    const product = await db.product.create({
      data: { slug: `test-product-${suffix}`, name: `Test Product ${suffix.slice(0, 8)}`, categoryId },
    });
    createdProductIds.push(product.id);
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        size: "M",
        sku: `TEST-SKU-${suffix}`,
        priceInPaise: 35000,
        stockQuantity: 10,
        lowStockThreshold: 5,
      },
    });

    async function createOrderAgainstSharedVariant(qty: number) {
      const orderSuffix = randomUUID();
      const order = await db.order.create({
        data: {
          orderNumber: `ORD-TEST-${orderSuffix.slice(0, 8).toUpperCase()}`,
          accessToken: randomUUID(),
          customerName: "Test Customer",
          customerMobile: "9876543210",
          fulfillmentType: "STORE_PICKUP",
          paymentMethod: "CASH_ON_DELIVERY",
          status: "CONFIRMED",
          subtotalInPaise: 35000 * qty,
          totalInPaise: 35000 * qty,
          amountReceivedInPaise: 35000 * qty,
          outstandingInPaise: 0,
          items: {
            create: [
              {
                productId: product.id,
                productVariantId: variant.id,
                productName: product.name,
                size: "M",
                skuSnapshot: variant.sku,
                unitPriceInPaise: 35000,
                quantity: qty,
                lineTotalInPaise: 35000 * qty,
                effectiveLineTotalInPaise: 35000 * qty,
              },
            ],
          },
        },
      });
      createdOrderIds.push(order.id);
      return order;
    }

    const orderA = await createOrderAgainstSharedVariant(2);
    const orderB = await createOrderAgainstSharedVariant(3);

    await Promise.all([
      updateOrderStatus({ orderNumber: orderA.orderNumber, newStatus: "CANCELLED", adminUserId }),
      updateOrderStatus({ orderNumber: orderB.orderNumber, newStatus: "CANCELLED", adminUserId }),
    ]);

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(15); // 10 + 2 + 3

    const adjustmentA = await db.inventoryAdjustment.findFirstOrThrow({ where: { orderId: orderA.id } });
    const adjustmentB = await db.inventoryAdjustment.findFirstOrThrow({ where: { orderId: orderB.id } });

    // Whichever order's restore actually committed first, its own logged
    // previousQuantity/newQuantity must reflect the REAL row values at
    // that moment, and the second one's must chain from the first's —
    // never both claiming the same stale previousQuantity=10.
    const [first, second] =
      adjustmentA.createdAt.getTime() <= adjustmentB.createdAt.getTime()
        ? [adjustmentA, adjustmentB]
        : [adjustmentB, adjustmentA];
    expect(first.previousQuantity).toBe(10);
    expect(first.newQuantity).toBe(10 + first.delta);
    expect(second.previousQuantity).toBe(first.newQuantity);
    expect(second.newQuantity).toBe(first.newQuantity + second.delta);
  });

  it("does not allow cancelling a DELIVERED order", async () => {
    const { order, variant } = await createTestOrder({
      fulfillmentType: "STORE_PICKUP",
      status: "DELIVERED",
      stockQuantity: 5,
    });

    const result = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });
});

describe("updatePaymentStatus", () => {
  it("marks an UNPAID order PAID", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP" });
    const result = await updatePaymentStatus({ orderNumber: order.orderNumber, newPaymentStatus: "PAID" });
    expect(result.success).toBe(true);

    const updated = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updated.paymentStatus).toBe("PAID");
  });

  it("rejects UNPAID -> REFUNDED directly", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP" });
    const result = await updatePaymentStatus({ orderNumber: order.orderNumber, newPaymentStatus: "REFUNDED" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });

  it("rejects PAID -> UNPAID", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP" });
    await updatePaymentStatus({ orderNumber: order.orderNumber, newPaymentStatus: "PAID" });
    const result = await updatePaymentStatus({ orderNumber: order.orderNumber, newPaymentStatus: "UNPAID" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });

  it("rejects marking a cancelled order PAID (found via manual verification)", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "CONFIRMED" });
    const cancelled = await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId });
    expect(cancelled.success).toBe(true);

    const result = await updatePaymentStatus({ orderNumber: order.orderNumber, newPaymentStatus: "PAID" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });

  it("still allows PAID -> REFUNDED on a cancelled order that was already paid", async () => {
    const { order } = await createTestOrder({ fulfillmentType: "STORE_PICKUP", status: "CONFIRMED" });
    await updatePaymentStatus({ orderNumber: order.orderNumber, newPaymentStatus: "PAID" });
    await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId });

    const result = await updatePaymentStatus({ orderNumber: order.orderNumber, newPaymentStatus: "REFUNDED" });
    expect(result.success).toBe(true);
  });
});
