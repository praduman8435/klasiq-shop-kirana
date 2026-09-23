import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { placeOrderForBasket } from "@/server/commerce/place-order";
import type { CheckoutInput } from "@/lib/validation/checkout";

// The Geoapify boundary (src/server/geoapify.ts) is mocked here so this
// suite never depends on a live network call or a real GEOAPIFY_API_KEY —
// see docs/PHASE_3_3_REPORT.md Part 2 "Tests". Each test controls its own
// route distance via mockResolvedValueOnce; a default is set in beforeEach
// so tests that don't care about the exact distance still get a sane one.
vi.mock("@/server/geoapify", () => ({
  calculateRouteDistanceMeters: vi.fn(),
}));
import { calculateRouteDistanceMeters } from "@/server/geoapify";
const mockedCalculateRouteDistanceMeters = vi.mocked(calculateRouteDistanceMeters);

// Integration tests against the real seeded-or-not local Postgres (docker
// compose). Everything this file creates is tracked and torn down in
// afterAll — it doesn't depend on or interfere with prisma/seed.ts data.

let categoryId: string;
const createdProductIds: string[] = [];
const createdBasketIds: string[] = [];
const createdOrderIds: string[] = [];
// Tests that need a customer isolated from the file's shared fixed-phone
// customers (e.g. because they assert on mutable Customer fields like
// whatsappPhone, where cross-test-order coupling on a shared row would
// make the test fragile) track their own fresh phone here for cleanup.
const createdIsolatedPhones: string[] = [];

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

// Default: a route beyond the free 3km radius, so LOCAL_DELIVERY tests that
// don't care about the exact distance still exercise the fee-charging path
// unless a subtotal free-delivery threshold applies. Individual tests
// override with mockResolvedValueOnce for a specific scenario.
beforeEach(() => {
  mockedCalculateRouteDistanceMeters.mockReset();
  mockedCalculateRouteDistanceMeters.mockResolvedValue({ success: true, distanceMeters: 5000 });
});

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-checkout-${randomUUID()}`, name: "Test Checkout Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  // FK-safe order: orders first (cascades order_items, nulls
  // basket.convertedOrderId), then baskets (cascades basket_items), then
  // products (cascades product_variants), then the category.
  if (createdOrderIds.length) {
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdBasketIds.length) {
    await db.basket.deleteMany({ where: { id: { in: createdBasketIds } } });
  }
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  // Since Phase 3.3, every successful placeOrderForBasket call also
  // resolves/creates a Customer for pickupInput()/deliveryInput()'s fixed
  // phone numbers (reused across this file's many tests, on purpose — see
  // docs/PHASE_3_3_REPORT.md). Orders referencing them are already gone by
  // this point (deleted above); delete the customers by their known,
  // fixed normalized phone so the dev database is left exactly as clean as
  // it was before this file ran.
  const isolatedNormalized = createdIsolatedPhones
    .map((p) => normalizePhoneNumber(p))
    .filter((r): r is { valid: true; normalized: string } => r.valid)
    .map((r) => r.normalized);
  await db.customer.deleteMany({
    where: {
      primaryPhoneNormalized: { in: ["+919876543210", "+919123456789", ...isolatedNormalized] },
    },
  });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createTestVariant(params: {
  priceInPaise: number;
  stockQuantity: number;
  lowStockThreshold?: number;
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: {
      slug: `test-product-${suffix}`,
      name: `Test Product ${suffix.slice(0, 8)}`,
      categoryId,
    },
  });
  createdProductIds.push(product.id);

  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-SKU-${suffix}`,
      priceInPaise: params.priceInPaise,
      stockQuantity: params.stockQuantity,
      lowStockThreshold: params.lowStockThreshold ?? 5,
      stockStatus: params.stockQuantity <= 0 ? "OUT_OF_STOCK" : "IN_STOCK",
    },
  });

  return { product, variant };
}

async function createTestBasket() {
  const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
  createdBasketIds.push(basket.id);
  return basket;
}

async function addBasketItem(basketId: string, variantId: string, quantity: number, priceAtAdd: number) {
  return db.basketItem.create({
    data: { basketId, productVariantId: variantId, quantity, priceInPaiseAtAdd: priceAtAdd },
  });
}

function pickupInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    customerName: "Asha Kumar",
    customerMobile: "9876543210",
    whatsappSameAsPrimary: true,
    fulfillmentType: "STORE_PICKUP",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

// Destination coordinates are a plausible nearby point — the actual route
// distance returned for them is entirely controlled by the mocked
// calculateRouteDistanceMeters (see beforeEach above), never computed from
// these numbers.
function deliveryInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    customerName: "Ravi Shah",
    customerMobile: "9123456789",
    whatsappSameAsPrimary: true,
    fulfillmentType: "LOCAL_DELIVERY",
    deliveryAddressLine: "12 Market Road",
    deliveryArea: "Sector 5",
    destinationLat: 25.96,
    destinationLon: 83.27,
    destinationFormattedAddress: "12 Market Road, Sector 5, Test City",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("placeOrderForBasket — successful orders", () => {
  it("creates a real order for Store Pickup, with no delivery fee and no address", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 2, 35000);

    const result = await placeOrderForBasket(basket.id, pickupInput());

    expect(result.success).toBe(true);
    if (!result.success) return;
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } })).id);

    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });

    expect(order.fulfillmentType).toBe("STORE_PICKUP");
    expect(order.deliveryFeeInPaise).toBe(0);
    expect(order.deliveryAddressLine).toBeNull();
    expect(order.subtotalInPaise).toBe(70000);
    expect(order.totalInPaise).toBe(70000);
    expect(order.paymentMethod).toBe("CASH_ON_DELIVERY");
    expect(order.paymentStatus).toBe("UNPAID");
    expect(order.status).toBe("PENDING");
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(2);
    expect(order.items[0]?.lineTotalInPaise).toBe(70000);
    // Phase 3.6.5 Part 2 section 12 — Online Checkout never negotiates a
    // discount; the effective total always equals the original line total,
    // and the order-level discount fields stay at their no-discount default.
    expect(order.items[0]?.effectiveLineTotalInPaise).toBe(70000);
    expect(order.discountType).toBeNull();
    expect(order.discountInPaise).toBe(0);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(8);

    const updatedBasket = await db.basket.findUniqueOrThrow({ where: { id: basket.id } });
    expect(updatedBasket.status).toBe("CONVERTED");
    expect(updatedBasket.convertedOrderId).toBe(order.id);
  });

  it("creates a real order for Local Delivery, applying the delivery fee and storing the address + route snapshot", async () => {
    // Beyond the 3km free radius, subtotal below the free-delivery threshold
    // — the ₹50 fee applies.
    mockedCalculateRouteDistanceMeters.mockResolvedValue({ success: true, distanceMeters: 5000 });
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 30000);

    const result = await placeOrderForBasket(
      basket.id,
      deliveryInput({ expectedDeliveryFeeInPaise: 5000 }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.fulfillmentType).toBe("LOCAL_DELIVERY");
    expect(order.deliveryAddressLine).toBe("12 Market Road");
    expect(order.deliveryArea).toBe("Sector 5");
    expect(order.subtotalInPaise).toBe(30000);
    expect(order.deliveryFeeInPaise).toBe(5000);
    expect(order.totalInPaise).toBe(order.subtotalInPaise + order.deliveryFeeInPaise);
    // The checkout-time route-distance snapshot, so a historical order can
    // be explained without another Geoapify call.
    expect(order.deliveryLatitude).toBe(25.96);
    expect(order.deliveryLongitude).toBe(83.27);
    expect(order.deliveryFormattedAddress).toBe("12 Market Road, Sector 5, Test City");
    expect(order.deliveryRouteDistanceMeters).toBe(5000);
  });

  it("waives the delivery fee once the subtotal meets the free-delivery threshold, even beyond 3km", async () => {
    // FREE_DELIVERY_THRESHOLD_IN_PAISE defaults to 150000 (₹1,500) — see .env.
    mockedCalculateRouteDistanceMeters.mockResolvedValue({ success: true, distanceMeters: 5000 });
    const { variant } = await createTestVariant({ priceInPaise: 150000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 150000);

    const result = await placeOrderForBasket(
      basket.id,
      deliveryInput({ expectedDeliveryFeeInPaise: 0 }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.deliveryFeeInPaise).toBe(0);
    expect(order.totalInPaise).toBe(order.subtotalInPaise);
  });

  it("waives the delivery fee within the free 3km radius, regardless of subtotal", async () => {
    mockedCalculateRouteDistanceMeters.mockResolvedValue({ success: true, distanceMeters: 2000 });
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 30000);

    const result = await placeOrderForBasket(
      basket.id,
      deliveryInput({ expectedDeliveryFeeInPaise: 0 }),
    );
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.deliveryFeeInPaise).toBe(0);
    expect(order.deliveryRouteDistanceMeters).toBe(2000);
  });

  it("snapshots product name/size/SKU/price so later product edits don't rewrite the historical order", async () => {
    const { product, variant } = await createTestVariant({ priceInPaise: 40000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 40000);

    const result = await placeOrderForBasket(basket.id, pickupInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    const originalProductName = product.name;
    const orderItemBeforeEdits = order.items[0]!;
    expect(orderItemBeforeEdits.productName).toBe(originalProductName);

    // Rename the product and reprice the variant AFTER the order exists.
    await db.product.update({ where: { id: product.id }, data: { name: "Renamed Later" } });
    await db.productVariant.update({ where: { id: variant.id }, data: { priceInPaise: 99999 } });

    // Re-fetch the order item fresh from the DB — it must still reflect
    // what was true at order time, not the just-made edits.
    const orderItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItemBeforeEdits.id } });
    expect(orderItem.productName).toBe(originalProductName);
    expect(orderItem.productName).not.toBe("Renamed Later");
    expect(orderItem.unitPriceInPaise).toBe(40000);
    expect(orderItem.skuSnapshot).toBe(variant.sku);
    expect(orderItem.size).toBe("M");
  });

  it("uses the current authoritative price, not the price the basket item was added at", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 5 });
    const basket = await createTestBasket();
    // Simulates "added at ₹350" ...
    await addBasketItem(basket.id, variant.id, 1, 35000);
    // ... then the shop repriced it to ₹380 before checkout.
    await db.productVariant.update({ where: { id: variant.id }, data: { priceInPaise: 38000 } });

    const result = await placeOrderForBasket(basket.id, pickupInput());
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.items[0]?.unitPriceInPaise).toBe(38000);
    expect(order.subtotalInPaise).toBe(38000);
  });
});

describe("placeOrderForBasket — WhatsApp contact snapshot (Phase 3.3 Part 3)", () => {
  // Each test here uses its own freshly-generated phone (tracked in
  // createdIsolatedPhones for afterAll cleanup) rather than pickupInput()'s
  // shared default — these tests assert on the mutable Customer.whatsappPhone
  // field, which the file's many OTHER pickupInput()-based tests also touch
  // as a side effect; sharing that customer row would make these tests'
  // outcomes depend on unrelated test execution order.
  it("snapshots customerWhatsapp as customerMobile when 'same as primary' is checked, and syncs the Customer's profile", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 35000);

    const mobile = freshTestPhone();
    createdIsolatedPhones.push(mobile);
    const input = pickupInput({ customerMobile: mobile, whatsappSameAsPrimary: true });
    const result = await placeOrderForBasket(basket.id, input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    // The order's OWN snapshot — independent of whatever the Customer row
    // says today or says later.
    expect(order.customerWhatsapp).toBe(mobile);

    // Best-effort sync of the customer's ongoing profile — never blocks
    // order success (already proven success above), but should still have
    // happened here since it's a plain, valid phone number.
    expect(order.customerId).not.toBeNull();
    const customer = await db.customer.findUniqueOrThrow({ where: { id: order.customerId! } });
    expect(customer.whatsappPhone).toBe(mobile);
  });

  it("snapshots customerWhatsapp as the distinct number when 'same as primary' is unchecked", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 35000);

    const mobile = freshTestPhone();
    createdIsolatedPhones.push(mobile);
    const distinctWhatsapp = "9988776655";
    const input = pickupInput({
      customerMobile: mobile,
      whatsappSameAsPrimary: false,
      whatsappPhone: distinctWhatsapp,
    });
    const result = await placeOrderForBasket(basket.id, input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerWhatsapp).toBe(distinctWhatsapp);
    expect(order.customerWhatsapp).not.toBe(mobile);

    const customer = await db.customer.findUniqueOrThrow({ where: { id: order.customerId! } });
    expect(customer.whatsappPhone).toBe(distinctWhatsapp);
  });

  it("a later order with 'same as primary' re-syncs the Customer's WhatsApp back to the (possibly new) primary phone", async () => {
    // Checkout 1: distinct WhatsApp number.
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 5 });
    const basket1 = await createTestBasket();
    await addBasketItem(basket1.id, variant.id, 1, 35000);
    const sharedMobile = freshTestPhone();
    createdIsolatedPhones.push(sharedMobile);
    const firstInput = pickupInput({
      customerMobile: sharedMobile,
      whatsappSameAsPrimary: false,
      whatsappPhone: "9988771122",
    });
    const firstResult = await placeOrderForBasket(basket1.id, firstInput);
    expect(firstResult.success).toBe(true);
    if (!firstResult.success) return;
    createdOrderIds.push(
      (await db.order.findUniqueOrThrow({ where: { orderNumber: firstResult.orderNumber } })).id,
    );

    // Checkout 2: same customer (same primary phone), now checks "same as
    // primary" — the Customer's WhatsApp should follow the primary phone,
    // not remain stuck on the earlier distinct number.
    const { variant: variant2 } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 5 });
    const basket2 = await createTestBasket();
    await addBasketItem(basket2.id, variant2.id, 1, 35000);
    const secondInput = pickupInput({ customerMobile: sharedMobile, whatsappSameAsPrimary: true });
    const secondResult = await placeOrderForBasket(basket2.id, secondInput);
    expect(secondResult.success).toBe(true);
    if (!secondResult.success) return;
    const secondOrder = await db.order.findUniqueOrThrow({
      where: { orderNumber: secondResult.orderNumber },
    });
    createdOrderIds.push(secondOrder.id);

    expect(secondOrder.customerWhatsapp).toBe(sharedMobile);
    const customer = await db.customer.findUniqueOrThrow({ where: { id: secondOrder.customerId! } });
    expect(customer.whatsappPhone).toBe(sharedMobile);
  });
});

describe("placeOrderForBasket — rejections", () => {
  it("rejects an empty basket without creating an order", async () => {
    const basket = await createTestBasket();
    const result = await placeOrderForBasket(basket.id, pickupInput());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("EMPTY_BASKET");
  });

  it("rejects a null basket id (no cookie at all) as an empty basket", async () => {
    const result = await placeOrderForBasket(null, pickupInput());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("EMPTY_BASKET");
  });

  it("rejects an out-of-stock item and creates no order", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 0 });
    const basket = await createTestBasket();
    // Force the basket item in directly — the normal add-to-basket action
    // would refuse this, but checkout must independently defend against it.
    await addBasketItem(basket.id, variant.id, 1, 35000);

    const result = await placeOrderForBasket(basket.id, pickupInput());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("STOCK_ISSUE");
    if (result.error.type === "STOCK_ISSUE") {
      expect(result.error.issues[0]?.availableQuantity).toBe(0);
    }

    const orderCount = await db.order.count({
      where: { items: { some: { productVariantId: variant.id } } },
    });
    expect(orderCount).toBe(0);
    const untouchedBasket = await db.basket.findUniqueOrThrow({ where: { id: basket.id } });
    expect(untouchedBasket.status).toBe("ACTIVE");
  });

  it("rejects a quantity greater than what's in stock, naming the item", async () => {
    const { product, variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 1 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 3, 35000);

    const result = await placeOrderForBasket(basket.id, pickupInput());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("STOCK_ISSUE");
    if (result.error.type === "STOCK_ISSUE") {
      expect(result.error.issues[0]).toMatchObject({
        productName: product.name,
        requestedQuantity: 3,
        availableQuantity: 1,
      });
    }

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(1);
  });

  // Phase 3.2 Part 3 production-hardening finding: resolveAndDecrementOrderLines
  // (the shared core) previously never re-checked isActive at order-creation
  // time — only search/listing queries filtered it. A variant added to a
  // basket, then deactivated before checkout, would have gone through. Fixed
  // in src/server/commerce/order-core.ts; proven here for the online flow and
  // in counter-sale.test.ts for the counter flow, since both share the fix.
  it("rejects checkout for a variant deactivated after it was added to the basket", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 35000);
    await db.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });

    const result = await placeOrderForBasket(basket.id, pickupInput());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("STOCK_ISSUE");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });

  it("rejects checkout for a variant whose product was deactivated after it was added to the basket", async () => {
    const { product, variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 35000);
    await db.product.update({ where: { id: product.id }, data: { isActive: false } });

    const result = await placeOrderForBasket(basket.id, pickupInput());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("STOCK_ISSUE");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });
});

describe("placeOrderForBasket — Local Delivery, Geoapify integration", () => {
  it("never guesses a distance when the route provider fails — rejects with DELIVERY_UNAVAILABLE and creates no order", async () => {
    mockedCalculateRouteDistanceMeters.mockResolvedValue({
      success: false,
      error: { type: "TIMEOUT", message: "Address lookup timed out." },
    });
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 30000);

    const result = await placeOrderForBasket(basket.id, deliveryInput());
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("DELIVERY_UNAVAILABLE");

    const orderCount = await db.order.count({
      where: { items: { some: { productVariantId: variant.id } } },
    });
    expect(orderCount).toBe(0);
    const untouchedBasket = await db.basket.findUniqueOrThrow({ where: { id: basket.id } });
    expect(untouchedBasket.status).toBe("ACTIVE");
  });

  it("rejects Local Delivery with no selected destination as a CUSTOMER_ERROR, never silently treating it as Store Pickup", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 30000);

    const result = await placeOrderForBasket(
      basket.id,
      deliveryInput({ destinationLat: undefined, destinationLon: undefined }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("CUSTOMER_ERROR");
    expect(mockedCalculateRouteDistanceMeters).not.toHaveBeenCalled();
  });

  it("rejects a stale delivery quote rather than silently charging the freshly-calculated fee", async () => {
    // Beyond 3km, subtotal below the free threshold — the authoritative fee
    // is ₹50 (5000 paise), but the client's stale preview claims ₹0 (e.g.
    // taken before the basket changed, or simply tampered with).
    mockedCalculateRouteDistanceMeters.mockResolvedValue({ success: true, distanceMeters: 5000 });
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 30000);

    const result = await placeOrderForBasket(
      basket.id,
      deliveryInput({ expectedDeliveryFeeInPaise: 0 }),
    );
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("DELIVERY_QUOTE_STALE");

    const orderCount = await db.order.count({
      where: { items: { some: { productVariantId: variant.id } } },
    });
    expect(orderCount).toBe(0);
  });

  it("recalculates the route fresh for each destination — a previously-seen distance is never reused for a different location", async () => {
    const { variant: variantA } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basketA = await createTestBasket();
    await addBasketItem(basketA.id, variantA.id, 1, 30000);
    mockedCalculateRouteDistanceMeters.mockResolvedValueOnce({ success: true, distanceMeters: 2000 });
    const resultA = await placeOrderForBasket(
      basketA.id,
      deliveryInput({ destinationLat: 25.9, destinationLon: 83.2, expectedDeliveryFeeInPaise: 0 }),
    );
    expect(resultA.success).toBe(true);
    if (resultA.success) {
      const orderA = await db.order.findUniqueOrThrow({ where: { orderNumber: resultA.orderNumber } });
      createdOrderIds.push(orderA.id);
      expect(orderA.deliveryRouteDistanceMeters).toBe(2000);
    }

    const { variant: variantB } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basketB = await createTestBasket();
    await addBasketItem(basketB.id, variantB.id, 1, 30000);
    mockedCalculateRouteDistanceMeters.mockResolvedValueOnce({ success: true, distanceMeters: 8000 });
    const resultB = await placeOrderForBasket(
      basketB.id,
      deliveryInput({ destinationLat: 26.1, destinationLon: 83.5, expectedDeliveryFeeInPaise: 5000 }),
    );
    expect(resultB.success).toBe(true);
    if (resultB.success) {
      const orderB = await db.order.findUniqueOrThrow({ where: { orderNumber: resultB.orderNumber } });
      createdOrderIds.push(orderB.id);
      expect(orderB.deliveryRouteDistanceMeters).toBe(8000);
    }
  });
});

describe("placeOrderForBasket — maximum delivery distance", () => {
  it("refuses a delivery past the limit, creating no order and leaving stock untouched", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 30000);
    mockedCalculateRouteDistanceMeters.mockResolvedValueOnce({ success: true, distanceMeters: 12400 });

    const input = deliveryInput({ destinationLat: 26.2, destinationLon: 83.6, expectedDeliveryFeeInPaise: 5000 });
    const result = await placeOrderForBasket(basket.id, input);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("OUT_OF_RANGE");
      expect(result.error.message).toMatch(/12\.4 km away.*beyond 10 km/);
    }
    expect(await db.order.count({ where: { idempotencyKey: input.idempotencyKey } })).toBe(0);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(5);
  });

  it("still delivers at exactly the limit", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 30000);
    mockedCalculateRouteDistanceMeters.mockResolvedValueOnce({ success: true, distanceMeters: 10000 });

    const result = await placeOrderForBasket(
      basket.id,
      deliveryInput({ destinationLat: 26.1, destinationLon: 83.4, expectedDeliveryFeeInPaise: 5000 }),
    );
    expect(result.success).toBe(true);
    if (result.success) {
      createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } })).id);
    }
  });
});

describe("placeOrderForBasket — idempotency and basket conversion", () => {
  it("returns the same order on a repeated submission with the same idempotency key", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 35000);

    const input = pickupInput();
    const first = await placeOrderForBasket(basket.id, input);
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } })).id);

    const second = await placeOrderForBasket(basket.id, input);
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.alreadyExisted).toBe(true);

    const orderCount = await db.order.count({ where: { idempotencyKey: input.idempotencyKey } });
    expect(orderCount).toBe(1);

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(9); // decremented exactly once
  });

  it("handles two truly concurrent submissions with the SAME idempotency key (the real double-tap race)", async () => {
    // Unlike the sequential test above, this fires both calls via
    // Promise.all so neither has committed when the other starts — the
    // narrow race a real double-tap can hit before the client-side
    // isPending guard re-renders. The DB unique constraint on
    // idempotencyKey, not timing, is what must make this safe.
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 35000);

    const input = pickupInput();
    const [first, second] = await Promise.all([
      placeOrderForBasket(basket.id, input),
      placeOrderForBasket(basket.id, input),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;

    expect(first.orderNumber).toBe(second.orderNumber);

    const orderCount = await db.order.count({ where: { idempotencyKey: input.idempotencyKey } });
    expect(orderCount).toBe(1);
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } })).id);

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(9); // decremented exactly once, not twice
  });

  it("returns the existing order for a stale resubmission with a DIFFERENT idempotency key on the same (now-converted) basket", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 35000);

    const first = await placeOrderForBasket(basket.id, pickupInput());
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } })).id);

    // A stale checkout tab resubmits with a fresh idempotency key.
    const second = await placeOrderForBasket(basket.id, pickupInput());
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.alreadyExisted).toBe(true);

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(9); // still decremented exactly once
  });
});

describe("placeOrderForBasket — concurrency", () => {
  it("allows exactly one of two concurrent checkouts to win the final unit of stock", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 35000, stockQuantity: 1 });

    const basketA = await createTestBasket();
    const basketB = await createTestBasket();
    await addBasketItem(basketA.id, variant.id, 1, 35000);
    await addBasketItem(basketB.id, variant.id, 1, 35000);

    const [resultA, resultB] = await Promise.all([
      placeOrderForBasket(basketA.id, pickupInput()),
      placeOrderForBasket(basketB.id, pickupInput()),
    ]);

    const results = [resultA, resultB];
    const successes = results.filter((r) => r.success);
    const failures = results.filter((r) => !r.success);

    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);

    const failure = failures[0];
    if (!failure!.success) {
      expect(failure!.error.type).toBe("STOCK_ISSUE");
    }

    const winner = successes[0];
    if (winner!.success) {
      const order = await db.order.findUniqueOrThrow({ where: { orderNumber: winner!.orderNumber } });
      createdOrderIds.push(order.id);
    }

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(0);
    expect(finalVariant.stockQuantity).toBeGreaterThanOrEqual(0); // never negative

    const orderCountForVariant = await db.order.count({
      where: { items: { some: { productVariantId: variant.id } } },
    });
    expect(orderCountForVariant).toBe(1);
  });
});
