import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

// Delivery distance comes from Geoapify; fix it at 5 km (past the free
// radius, so the ₹50 fee applies on small orders).
vi.mock("@/server/geoapify", () => ({
  calculateRouteDistanceMeters: async () => ({ success: true, distanceMeters: 5000 }),
  isGeoapifyConfigured: () => true,
}));

const { db } = await import("@/lib/db");
const { placeOrderForBasket } = await import("@/server/commerce/place-order");
const { previewCoupon } = await import("@/server/coupons/coupons");

let categoryId: string;
const productIds: string[] = [];
const basketIds: string[] = [];
const couponIds: string[] = [];
const phones: string[] = [];

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { slug: `test-coupons-${randomUUID()}`, name: "Test Coupons" } })).id;
});

afterAll(async () => {
  const customers = await db.customer.findMany({ where: { primaryPhone: { in: phones } }, select: { id: true } });
  const orders = await db.order.findMany({ where: { customerId: { in: customers.map((c) => c.id) } }, select: { id: true } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await db.basket.updateMany({ where: { id: { in: basketIds } }, data: { convertedOrderId: null } });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.basketItem.deleteMany({ where: { basketId: { in: basketIds } } });
  await db.basket.deleteMany({ where: { id: { in: basketIds } } });
  await db.customer.deleteMany({ where: { id: { in: customers.map((c) => c.id) } } });
  await db.coupon.deleteMany({ where: { id: { in: couponIds } } });
  await db.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function phone() {
  const p = `9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
  phones.push(p);
  return p;
}

async function coupon(data: Partial<Parameters<typeof db.coupon.create>[0]["data"]> & { type: "PERCENT" | "FLAT" | "FREE_DELIVERY" }) {
  const c = await db.coupon.create({ data: { code: `T${randomUUID().slice(0, 8).toUpperCase().replace(/-/g, "")}`, value: 0, ...data } });
  couponIds.push(c.id);
  return c;
}

/** A bag with two lines (₹300 + ₹200 = ₹500). */
async function bag() {
  const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
  basketIds.push(basket.id);
  for (const price of [30000, 20000]) {
    const suffix = randomUUID();
    const product = await db.product.create({ data: { slug: `test-coupon-p-${suffix}`, name: `Coupon Item ${suffix.slice(0, 4)}`, categoryId } });
    productIds.push(product.id);
    const v = await db.productVariant.create({
      data: { productId: product.id, size: "1 kg", sku: `TEST-COUPON-${suffix}`, priceInPaise: price, stockQuantity: 20 },
    });
    await db.basketItem.create({ data: { basketId: basket.id, productVariantId: v.id, quantity: 1, priceInPaiseAtAdd: price } });
  }
  return basket;
}

function input(mobile: string, extra: Record<string, unknown> = {}) {
  return {
    customerName: "Coupon Tester",
    customerMobile: mobile,
    whatsappSameAsPrimary: true,
    fulfillmentType: "STORE_PICKUP" as const,
    idempotencyKey: randomUUID(),
    ...extra,
  };
}

describe("coupons at checkout", () => {
  it("takes the offer off the bill, spreads it over the items, and records it", async () => {
    const c = await coupon({ type: "FLAT", value: 5000, minOrderInPaise: 49900 });
    const b = await bag();
    const result = await placeOrderForBasket(b.id, input(phone(), { couponCode: c.code.toLowerCase(), expectedCouponSavingInPaise: 5000 }));
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber }, include: { items: true } });
    expect(order).toMatchObject({
      subtotalInPaise: 50000,
      discountInPaise: 5000,
      totalInPaise: 45000,
      couponId: c.id,
      couponCode: c.code,
      couponSavingInPaise: 5000,
      discountReason: `Offer ${c.code}`,
    });
    expect(order.items.map((i) => i.effectiveLineTotalInPaise).sort((a, z) => z - a)).toEqual([27000, 18000]);
  });

  it("allows one use per customer, and refuses the second with a clear reason", async () => {
    const c = await coupon({ type: "PERCENT", value: 10, maxDiscountInPaise: 3000 });
    const mobile = phone();
    const first = await placeOrderForBasket((await bag()).id, input(mobile, { couponCode: c.code }));
    expect(first.success).toBe(true);
    const second = await placeOrderForBasket((await bag()).id, input(mobile, { couponCode: c.code }));
    expect(second).toMatchObject({ success: false, error: { type: "COUPON_INVALID", message: expect.stringMatching(/already used/) } });
  });

  it("first-order offers only work for a number's first online order", async () => {
    const c = await coupon({ type: "FLAT", value: 3000, firstOrderOnly: true, perCustomerLimit: 5 });
    const mobile = phone();
    expect((await placeOrderForBasket((await bag()).id, input(mobile))).success).toBe(true);
    const preview = await previewCoupon({ code: c.code, subtotalInPaise: 50000, deliveryFeeInPaise: 0, isDelivery: false, phone: mobile });
    expect(preview).toMatchObject({ found: true, check: { ok: false, reason: "This code is only for your first online order." } });
    const result = await placeOrderForBasket((await bag()).id, input(mobile, { couponCode: c.code }));
    expect(result).toMatchObject({ success: false, error: { type: "COUPON_INVALID" } });
    // A brand-new number qualifies.
    const fresh = await previewCoupon({ code: c.code, subtotalInPaise: 50000, deliveryFeeInPaise: 0, isDelivery: false, phone: phone() });
    expect(fresh).toMatchObject({ found: true, check: { ok: true, savingInPaise: 3000 } });
  });

  it("stops at the total usage limit, and a cancelled order frees its use", async () => {
    const c = await coupon({ type: "FLAT", value: 1000, usageLimit: 1 });
    const first = await placeOrderForBasket((await bag()).id, input(phone(), { couponCode: c.code }));
    expect(first.success).toBe(true);
    const blocked = await placeOrderForBasket((await bag()).id, input(phone(), { couponCode: c.code }));
    expect(blocked).toMatchObject({ success: false, error: { message: expect.stringMatching(/fully used/) } });
    if (first.success) await db.order.update({ where: { orderNumber: first.orderNumber }, data: { status: "CANCELLED" } });
    expect((await placeOrderForBasket((await bag()).id, input(phone(), { couponCode: c.code }))).success).toBe(true);
  });

  it("makes delivery free with a free-delivery offer", async () => {
    const c = await coupon({ type: "FREE_DELIVERY" });
    const result = await placeOrderForBasket(
      (await bag()).id,
      input(phone(), {
        fulfillmentType: "LOCAL_DELIVERY",
        deliveryAddressLine: "House 1",
        destinationLat: 26.03,
        destinationLon: 83.15,
        destinationFormattedAddress: "Kopaganj",
        expectedDeliveryFeeInPaise: 5000,
        couponCode: c.code,
        expectedCouponSavingInPaise: 5000,
      }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    expect(order).toMatchObject({ deliveryFeeInPaise: 0, discountInPaise: 0, totalInPaise: 50000, couponSavingInPaise: 5000 });
  });

  it("asks the customer to re-check when the offer's saving changed", async () => {
    const c = await coupon({ type: "PERCENT", value: 10 });
    const result = await placeOrderForBasket((await bag()).id, input(phone(), { couponCode: c.code, expectedCouponSavingInPaise: 999 }));
    expect(result).toMatchObject({ success: false, error: { type: "COUPON_CHANGED", message: expect.stringMatching(/₹50/) } });
  });

  it("refuses an expired or unknown code without placing the order", async () => {
    const c = await coupon({ type: "FLAT", value: 1000, expiresAt: new Date(Date.now() - 1000) });
    const b = await bag();
    expect(await placeOrderForBasket(b.id, input(phone(), { couponCode: c.code }))).toMatchObject({ success: false, error: { message: expect.stringMatching(/expired/) } });
    expect(await placeOrderForBasket(b.id, input(phone(), { couponCode: "NOPE123" }))).toMatchObject({ success: false, error: { type: "COUPON_INVALID" } });
    expect((await db.basket.findUniqueOrThrow({ where: { id: b.id } })).status).toBe("ACTIVE");
  });
});
