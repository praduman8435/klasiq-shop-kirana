import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { adjustInventoryByDelta, setInventoryQuantity } from "@/server/commerce/inventory";
import { placeOrderForBasket } from "@/server/commerce/place-order";
import type { CheckoutInput } from "@/lib/validation/checkout";

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdBasketIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-inventory-${randomUUID()}`, name: "Test Inventory Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: {
      name: "Test Admin",
      email: `test-inventory-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdBasketIds.length) await db.basket.deleteMany({ where: { id: { in: createdBasketIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  // Since Phase 3.3, placeOrderForBasket also resolves/creates a Customer
  // for this file's fixed checkout phone number — see the identical note
  // in place-order.test.ts's afterAll.
  await db.customer.deleteMany({ where: { primaryPhoneNormalized: "+919876543210" } });
  await db.adminUser.delete({ where: { id: adminUserId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createTestVariant(stockQuantity: number) {
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
      priceInPaise: 20000,
      stockQuantity,
      lowStockThreshold: 5,
    },
  });
  return variant;
}

describe("adjustInventoryByDelta", () => {
  it("increases stock and records an audit entry", async () => {
    const variant = await createTestVariant(10);
    const result = await adjustInventoryByDelta({
      productVariantId: variant.id,
      delta: 5,
      reason: "STOCK_RECEIVED",
      adminUserId,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.newQuantity).toBe(15);

    const adjustments = await db.inventoryAdjustment.findMany({
      where: { productVariantId: variant.id },
    });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]).toMatchObject({
      previousQuantity: 10,
      newQuantity: 15,
      delta: 5,
      reason: "STOCK_RECEIVED",
      adminUserId,
    });
  });

  it("decreases stock via a negative delta", async () => {
    const variant = await createTestVariant(10);
    const result = await adjustInventoryByDelta({
      productVariantId: variant.id,
      delta: -3,
      reason: "MANUAL_CORRECTION",
      adminUserId,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.newQuantity).toBe(7);
  });

  it("rejects a delta that would take stock negative", async () => {
    const variant = await createTestVariant(2);
    const result = await adjustInventoryByDelta({
      productVariantId: variant.id,
      delta: -5,
      reason: "MANUAL_CORRECTION",
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID");

    const untouched = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouched.stockQuantity).toBe(2);
  });

  it("updates stockStatus when crossing the low-stock threshold", async () => {
    const variant = await createTestVariant(10); // threshold is 5
    await adjustInventoryByDelta({
      productVariantId: variant.id,
      delta: -7,
      reason: "MANUAL_CORRECTION",
      adminUserId,
    });
    const updated = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updated.stockQuantity).toBe(3);
    expect(updated.stockStatus).toBe("LOW_STOCK");
  });
});

describe("setInventoryQuantity", () => {
  it("sets an absolute quantity when expectedPreviousQuantity matches", async () => {
    const variant = await createTestVariant(10);
    const result = await setInventoryQuantity({
      productVariantId: variant.id,
      newQuantity: 25,
      expectedPreviousQuantity: 10,
      reason: "MANUAL_CORRECTION",
      adminUserId,
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.newQuantity).toBe(25);
  });

  it("rejects a negative new quantity", async () => {
    const variant = await createTestVariant(10);
    const result = await setInventoryQuantity({
      productVariantId: variant.id,
      newQuantity: -1,
      expectedPreviousQuantity: 10,
      reason: "MANUAL_CORRECTION",
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID");
  });

  it("returns CONFLICT when the stock changed since the admin last saw it", async () => {
    const variant = await createTestVariant(10);
    // Someone else already changed it to 8 in the meantime.
    await db.productVariant.update({ where: { id: variant.id }, data: { stockQuantity: 8 } });

    const result = await setInventoryQuantity({
      productVariantId: variant.id,
      newQuantity: 25,
      expectedPreviousQuantity: 10, // stale
      reason: "MANUAL_CORRECTION",
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("CONFLICT");

    const untouched = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouched.stockQuantity).toBe(8); // the admin's stale write never applied
  });
});

function pickupInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    customerName: "Concurrency Test",
    customerMobile: "9876543210",
    whatsappSameAsPrimary: true,
    fulfillmentType: "STORE_PICKUP",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("concurrency — customer checkout racing an admin stock adjustment", () => {
  it("applies both a checkout decrement and an admin correction correctly when stock covers both", async () => {
    const variant = await createTestVariant(10);
    const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
    createdBasketIds.push(basket.id);
    await db.basketItem.create({
      data: { basketId: basket.id, productVariantId: variant.id, quantity: 3, priceInPaiseAtAdd: 20000 },
    });

    const [checkoutResult, adjustResult] = await Promise.all([
      placeOrderForBasket(basket.id, pickupInput()),
      adjustInventoryByDelta({
        productVariantId: variant.id,
        delta: -2,
        reason: "MANUAL_CORRECTION",
        adminUserId,
      }),
    ]);

    expect(checkoutResult.success).toBe(true);
    expect(adjustResult.success).toBe(true);
    if (checkoutResult.success) {
      const order = await db.order.findUniqueOrThrow({ where: { orderNumber: checkoutResult.orderNumber } });
      createdOrderIds.push(order.id);
    }

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(5); // 10 - 3 (checkout) - 2 (admin) — neither lost
    expect(finalVariant.stockQuantity).toBeGreaterThanOrEqual(0);
  });

  it("lets exactly one of a checkout and an admin over-correction succeed when demand exceeds stock", async () => {
    const variant = await createTestVariant(5);
    const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
    createdBasketIds.push(basket.id);
    await db.basketItem.create({
      data: { basketId: basket.id, productVariantId: variant.id, quantity: 3, priceInPaiseAtAdd: 20000 },
    });

    // Combined demand (3 + 3 = 6) exceeds the 5 on hand — whichever
    // operation's guarded update runs first must win; the other must fail
    // cleanly rather than driving stock negative.
    const [checkoutResult, adjustResult] = await Promise.all([
      placeOrderForBasket(basket.id, pickupInput()),
      adjustInventoryByDelta({
        productVariantId: variant.id,
        delta: -3,
        reason: "MANUAL_CORRECTION",
        adminUserId,
      }),
    ]);

    if (checkoutResult.success) {
      const order = await db.order.findUniqueOrThrow({ where: { orderNumber: checkoutResult.orderNumber } });
      createdOrderIds.push(order.id);
    }

    // Demand (3 + 3 = 6) exceeds the 5 on hand: whichever guarded update
    // runs first drops stock to 2, and the second's guard (requires >= 3)
    // then fails — so exactly one must succeed, never both, never neither.
    const outcomes = [checkoutResult.success, adjustResult.success];
    expect(outcomes.filter(Boolean).length).toBe(1);

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(2); // never negative, and exactly one operation's worth taken
  });
});
