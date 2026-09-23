import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAdminOrderByNumber, getAdminOrders } from "@/server/queries/admin/orders";

// Phase 3.2 Part 3 production-hardening: verifies the existing order
// filters (source/status/payment/fulfillment/date/text) behave correctly
// now that orders can be ONLINE or COUNTER, and guest or customer-linked —
// no new filtering logic, just proving the existing
// query composes correctly across all of these dimensions at once.

let categoryId: string;
let customerId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-admin-orders-${randomUUID()}`, name: "Test Admin Orders Category" },
  });
  categoryId = category.id;

  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-TAO${randomUUID().slice(0, 3).toUpperCase()}`,
      displayName: "Test Filters Customer",
      primaryPhone: "9800000001",
      primaryPhoneNormalized: "+919800000001",
    },
  });
  customerId = customer.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await db.customer.delete({ where: { id: customerId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createTestOrder(overrides: {
  source: "ONLINE" | "COUNTER";
  customerName?: string | null;
  customerMobile?: string | null;
  customerId?: string | null;
  createdAt?: Date;
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-admin-orders-product-${suffix}`, name: `Test Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-ADMIN-ORDERS-SKU-${suffix}`,
      priceInPaise: 10000,
      stockQuantity: 10,
    },
  });

  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: overrides.source,
      customerName: overrides.customerName ?? null,
      customerMobile: overrides.customerMobile ?? null,
      customerId: overrides.customerId ?? null,
      fulfillmentType: overrides.source === "COUNTER" ? "COUNTER_HANDOVER" : "STORE_PICKUP",
      paymentMethod: overrides.source === "COUNTER" ? "CASH" : "CASH_ON_DELIVERY",
      paymentStatus: overrides.source === "COUNTER" ? "PAID" : "UNPAID",
      status: overrides.source === "COUNTER" ? "DELIVERED" : "PENDING",
      subtotalInPaise: 10000,
      totalInPaise: 10000,
      amountReceivedInPaise: 10000,
      outstandingInPaise: 0,
      ...(overrides.createdAt ? { createdAt: overrides.createdAt } : {}),
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 10000,
            quantity: 1,
            lineTotalInPaise: 10000,
            effectiveLineTotalInPaise: 10000,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);
  return order;
}

describe("getAdminOrders — source filtering", () => {
  it("filters ONLINE orders correctly", async () => {
    const online = await createTestOrder({ source: "ONLINE", customerName: "Online A", customerMobile: "9111111111" });
    const counter = await createTestOrder({ source: "COUNTER" });

    const results = await getAdminOrders({ source: "ONLINE" });
    const ids = results.map((o) => o.id);
    expect(ids).toContain(online.id);
    expect(ids).not.toContain(counter.id);
  });

  it("filters COUNTER orders correctly", async () => {
    const online = await createTestOrder({ source: "ONLINE", customerName: "Online B", customerMobile: "9111111112" });
    const counter = await createTestOrder({ source: "COUNTER" });

    const results = await getAdminOrders({ source: "COUNTER" });
    const ids = results.map((o) => o.id);
    expect(ids).toContain(counter.id);
    expect(ids).not.toContain(online.id);
  });
});

describe("getAdminOrders — guest and customer-linked orders", () => {
  it("includes a guest counter order (null customerName/customerMobile) without crashing", async () => {
    const guest = await createTestOrder({ source: "COUNTER" });

    const results = await getAdminOrders({ source: "COUNTER" });
    const found = results.find((o) => o.id === guest.id);
    expect(found).toBeDefined();
    expect(found?.customerName).toBeNull();
    expect(found?.customerMobile).toBeNull();
  });

  it("a text search does not match a guest order by name/mobile (correctly, since it has neither)", async () => {
    const guest = await createTestOrder({ source: "COUNTER" });

    const results = await getAdminOrders({ query: "Test Filters Customer" });
    expect(results.map((o) => o.id)).not.toContain(guest.id);
  });

  it("a customer-linked order carries its customerId through the filtered result", async () => {
    const linked = await createTestOrder({
      source: "COUNTER",
      customerId,
      customerName: "Test Filters Customer",
      customerMobile: "9800000001",
    });

    const results = await getAdminOrders({ source: "COUNTER" });
    const found = results.find((o) => o.id === linked.id);
    expect(found?.customerId).toBe(customerId);
  });
});

describe("getAdminOrders — date filtering", () => {
  it("includes an order on dateFrom's boundary day and excludes one from the day before", async () => {
    const inRange = await createTestOrder({
      source: "COUNTER",
      createdAt: new Date("2026-06-15T10:00:00.000Z"),
    });
    const before = await createTestOrder({
      source: "COUNTER",
      createdAt: new Date("2026-06-14T23:59:00.000Z"),
    });

    const results = await getAdminOrders({ dateFrom: "2026-06-15" });
    const ids = results.map((o) => o.id);
    expect(ids).toContain(inRange.id);
    expect(ids).not.toContain(before.id);
  });

  it("dateTo is inclusive of the entire named day, not just midnight", async () => {
    const lateInDay = await createTestOrder({
      source: "COUNTER",
      createdAt: new Date("2026-06-20T23:30:00.000Z"),
    });
    const nextDay = await createTestOrder({
      source: "COUNTER",
      createdAt: new Date("2026-06-21T00:30:00.000Z"),
    });

    const results = await getAdminOrders({ dateTo: "2026-06-20" });
    const ids = results.map((o) => o.id);
    expect(ids).toContain(lateInDay.id);
    expect(ids).not.toContain(nextDay.id);
  });

  it("combines dateFrom, dateTo, and source together correctly", async () => {
    const matching = await createTestOrder({
      source: "COUNTER",
      createdAt: new Date("2026-07-10T12:00:00.000Z"),
    });
    const wrongSource = await createTestOrder({
      source: "ONLINE",
      customerName: "Online C",
      customerMobile: "9111111113",
      createdAt: new Date("2026-07-10T12:00:00.000Z"),
    });
    const outsideRange = await createTestOrder({
      source: "COUNTER",
      createdAt: new Date("2026-07-12T12:00:00.000Z"),
    });

    const results = await getAdminOrders({
      source: "COUNTER",
      dateFrom: "2026-07-09",
      dateTo: "2026-07-10",
    });
    const ids = results.map((o) => o.id);
    expect(ids).toContain(matching.id);
    expect(ids).not.toContain(wrongSource.id);
    expect(ids).not.toContain(outsideRange.id);
  });
});

// Phase 3.3 Part 3 audit: the admin order-detail page must degrade
// gracefully for orders that predate Part 2/3's new nullable fields
// (customerId, delivery coordinates/route distance, customerWhatsapp) and
// must render Counter orders correctly (no delivery location, potentially
// guest). These prove the QUERY layer returns both shapes cleanly — the
// detail page's own rendering already null-checks every one of these
// fields with `?.`/conditional JSX (verified by reading
// src/app/admin/(protected)/orders/[orderNumber]/page.tsx directly), so a
// query that returns the expected null/non-null shape is the correct,
// non-redundant boundary to test without a browser-rendering harness.
describe("getAdminOrderByNumber — historical and Counter order compatibility", () => {
  it("returns a pre-Phase-3.3 shaped order (no customer link, no delivery geo/WhatsApp fields) without crashing", async () => {
    const historical = await createTestOrder({
      source: "ONLINE",
      customerName: "Old Style Customer",
      customerMobile: "9111111199",
      customerId: null,
    });

    const found = await getAdminOrderByNumber(historical.orderNumber);
    expect(found).not.toBeNull();
    expect(found?.customer).toBeNull();
    expect(found?.customerWhatsapp).toBeNull();
    expect(found?.deliveryLatitude).toBeNull();
    expect(found?.deliveryLongitude).toBeNull();
    expect(found?.deliveryFormattedAddress).toBeNull();
    expect(found?.deliveryRouteDistanceMeters).toBeNull();
  });

  it("returns a guest COUNTER_HANDOVER order (no customer, no delivery location at all) without crashing", async () => {
    const guest = await createTestOrder({ source: "COUNTER" });

    const found = await getAdminOrderByNumber(guest.orderNumber);
    expect(found).not.toBeNull();
    expect(found?.fulfillmentType).toBe("COUNTER_HANDOVER");
    expect(found?.customer).toBeNull();
    expect(found?.customerName).toBeNull();
    expect(found?.deliveryAddressLine).toBeNull();
  });

  it("returns a full Phase 3.3 Part 2/3-shaped Local Delivery order with every new field populated", async () => {
    const suffix = randomUUID();
    const product = await db.product.create({
      data: { slug: `test-admin-orders-ld-${suffix}`, name: `Test LD Product ${suffix.slice(0, 8)}`, categoryId },
    });
    createdProductIds.push(product.id);
    const variant = await db.productVariant.create({
      data: {
        productId: product.id,
        size: "M",
        sku: `TEST-ADMIN-ORDERS-LD-SKU-${suffix}`,
        priceInPaise: 10000,
        stockQuantity: 10,
      },
    });
    const order = await db.order.create({
      data: {
        orderNumber: `ORD-TEST-LD-${suffix.slice(0, 8).toUpperCase()}`,
        accessToken: randomUUID(),
        source: "ONLINE",
        customerId,
        customerName: "Test Filters Customer",
        customerMobile: "9800000001",
        customerWhatsapp: "9800000001",
        fulfillmentType: "LOCAL_DELIVERY",
        deliveryAddressLine: "12 Market Road",
        deliveryLandmark: "Near the water tank",
        deliveryLatitude: 25.96,
        deliveryLongitude: 83.27,
        deliveryFormattedAddress: "12 Market Road, Test City",
        deliveryRouteDistanceMeters: 1755,
        paymentMethod: "CASH_ON_DELIVERY",
        paymentStatus: "UNPAID",
        status: "PENDING",
        subtotalInPaise: 10000,
        deliveryFeeInPaise: 5000,
        totalInPaise: 15000,
        amountReceivedInPaise: 15000,
        outstandingInPaise: 0,
        items: {
          create: [
            {
              productId: product.id,
              productVariantId: variant.id,
              productName: product.name,
              size: "M",
              skuSnapshot: variant.sku,
              unitPriceInPaise: 10000,
              quantity: 1,
              lineTotalInPaise: 10000,
              effectiveLineTotalInPaise: 10000,
            },
          ],
        },
      },
    });
    createdOrderIds.push(order.id);

    const found = await getAdminOrderByNumber(order.orderNumber);
    expect(found).not.toBeNull();
    expect(found?.customer?.customerId).toBeDefined();
    expect(found?.customerWhatsapp).toBe("9800000001");
    expect(found?.deliveryFormattedAddress).toBe("12 Market Road, Test City");
    expect(found?.deliveryRouteDistanceMeters).toBe(1755);
    expect(found?.deliveryLatitude).toBe(25.96);
    expect(found?.deliveryLongitude).toBe(83.27);
  });
});
