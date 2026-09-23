import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getOrderForAuthenticatedCustomer,
  getOrdersForAuthenticatedCustomer,
} from "@/server/queries/customer-portal/orders";

// Real Postgres integration tests — the authorization boundary here IS the
// query's WHERE clause, so this must be proven against a real database,
// never a mocked array. See docs/PHASE_3_4_REPORT.md Part 2 "Order query
// security".

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-portal-orders-${randomUUID()}`, name: "Test Portal Orders Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  if (createdCustomerIds.length) {
    await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
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
  const suffix = randomUUID().slice(0, 8);
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-P${suffix.toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createTestOrder(overrides: {
  source: "ONLINE" | "COUNTER";
  fulfillmentType?: "STORE_PICKUP" | "LOCAL_DELIVERY" | "COUNTER_HANDOVER";
  customerId?: string | null;
  status?: "PENDING" | "CONFIRMED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED" | "CANCELLED";
  paymentStatus?: "UNPAID" | "PAID" | "REFUNDED" | "FAILED";
  createdAt?: Date;
  priceInPaise?: number;
  quantity?: number;
}) {
  const suffix = randomUUID();
  const priceInPaise = overrides.priceInPaise ?? 40000;
  const quantity = overrides.quantity ?? 1;
  const product = await db.product.create({
    data: {
      slug: `test-portal-orders-product-${suffix}`,
      name: `Test Portal Product ${suffix.slice(0, 8)}`,
      categoryId,
    },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-PORTAL-SKU-${suffix}`,
      priceInPaise,
      stockQuantity: 10,
    },
  });

  const fulfillmentType =
    overrides.fulfillmentType ?? (overrides.source === "COUNTER" ? "COUNTER_HANDOVER" : "STORE_PICKUP");

  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-PORTAL-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: overrides.source,
      customerId: overrides.customerId ?? null,
      customerName: "Test Portal Customer",
      customerMobile: "9800000000",
      fulfillmentType,
      paymentMethod: overrides.source === "COUNTER" ? "CASH" : "CASH_ON_DELIVERY",
      paymentStatus: overrides.paymentStatus ?? (overrides.source === "COUNTER" ? "PAID" : "UNPAID"),
      status: overrides.status ?? (overrides.source === "COUNTER" ? "DELIVERED" : "PENDING"),
      subtotalInPaise: priceInPaise * quantity,
      deliveryFeeInPaise: 0,
      totalInPaise: priceInPaise * quantity,
      amountReceivedInPaise: priceInPaise * quantity,
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
            unitPriceInPaise: priceInPaise,
            quantity,
            lineTotalInPaise: priceInPaise * quantity,
            effectiveLineTotalInPaise: priceInPaise * quantity,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);
  return { order, product, variant };
}

describe("getOrdersForAuthenticatedCustomer — authorization", () => {
  it("Customer A sees only Customer A's orders, never Customer B's", async () => {
    const customerA = await createTestCustomer("Customer A");
    const customerB = await createTestCustomer("Customer B");
    const { order: orderA } = await createTestOrder({ source: "ONLINE", customerId: customerA.id });
    const { order: orderB } = await createTestOrder({ source: "ONLINE", customerId: customerB.id });

    const resultsA = await getOrdersForAuthenticatedCustomer(customerA.id);
    const idsA = resultsA.map((o) => o.id);
    expect(idsA).toContain(orderA.id);
    expect(idsA).not.toContain(orderB.id);

    const resultsB = await getOrdersForAuthenticatedCustomer(customerB.id);
    const idsB = resultsB.map((o) => o.id);
    expect(idsB).toContain(orderB.id);
    expect(idsB).not.toContain(orderA.id);
  });

  it("orders newest first", async () => {
    const customer = await createTestCustomer("Ordering Test Customer");
    const { order: older } = await createTestOrder({
      source: "ONLINE",
      customerId: customer.id,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    });
    const { order: newer } = await createTestOrder({
      source: "ONLINE",
      customerId: customer.id,
      createdAt: new Date("2026-06-01T00:00:00.000Z"),
    });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    const ids = results.map((o) => o.id);
    expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
  });
});

describe("getOrdersForAuthenticatedCustomer — linked purchase history", () => {
  it("includes an ONLINE order genuinely linked to the Customer", async () => {
    const customer = await createTestCustomer("Online History Customer");
    const { order } = await createTestOrder({ source: "ONLINE", customerId: customer.id });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    expect(results.map((o) => o.id)).toContain(order.id);
  });

  it("includes a customer-linked COUNTER order — cross-channel history is one history", async () => {
    const customer = await createTestCustomer("Counter History Customer");
    const { order } = await createTestOrder({ source: "COUNTER", customerId: customer.id });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    expect(results.map((o) => o.id)).toContain(order.id);
  });

  it("excludes a GUEST Counter sale (customerId: null) — never fuzzy-matched in", async () => {
    const customer = await createTestCustomer("Guest Exclusion Customer");
    const { order: linkedOrder } = await createTestOrder({ source: "COUNTER", customerId: customer.id });
    const { order: guestOrder } = await createTestOrder({ source: "COUNTER", customerId: null });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    const ids = results.map((o) => o.id);
    expect(ids).toContain(linkedOrder.id);
    expect(ids).not.toContain(guestOrder.id);
  });

  it("excludes a historical order with no Customer link at all, even for a customer who exists", async () => {
    const customer = await createTestCustomer("Historical Exclusion Customer");
    // Simulates a pre-Phase-3.3 order — customerId was never backfilled.
    const { order: unlinkedOrder } = await createTestOrder({ source: "ONLINE", customerId: null });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    expect(results.map((o) => o.id)).not.toContain(unlinkedOrder.id);
  });

  it("includes a Store Pickup, a Local Delivery, and a Counter Handover order, all correctly", async () => {
    const customer = await createTestCustomer("Multi-Fulfillment Customer");
    const { order: pickup } = await createTestOrder({
      source: "ONLINE",
      fulfillmentType: "STORE_PICKUP",
      customerId: customer.id,
    });
    const { order: delivery } = await createTestOrder({
      source: "ONLINE",
      fulfillmentType: "LOCAL_DELIVERY",
      customerId: customer.id,
    });
    const { order: counter } = await createTestOrder({ source: "COUNTER", customerId: customer.id });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    const byId = new Map(results.map((o) => [o.id, o]));
    expect(byId.get(pickup.id)?.fulfillmentType).toBe("STORE_PICKUP");
    expect(byId.get(delivery.id)?.fulfillmentType).toBe("LOCAL_DELIVERY");
    expect(byId.get(counter.id)?.fulfillmentType).toBe("COUNTER_HANDOVER");
  });

  it("includes a cancelled order correctly", async () => {
    const customer = await createTestCustomer("Cancelled Order Customer");
    const { order } = await createTestOrder({
      source: "ONLINE",
      customerId: customer.id,
      status: "CANCELLED",
    });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    const found = results.find((o) => o.id === order.id);
    expect(found?.status).toBe("CANCELLED");
  });
});

describe("getOrdersForAuthenticatedCustomer — cross-channel convergence", () => {
  it("ONLINE then COUNTER for the same Customer both appear in one history", async () => {
    const customer = await createTestCustomer("Online-Then-Counter Customer");
    const { order: onlineOrder } = await createTestOrder({ source: "ONLINE", customerId: customer.id });
    const { order: counterOrder } = await createTestOrder({ source: "COUNTER", customerId: customer.id });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    const ids = results.map((o) => o.id);
    expect(ids).toContain(onlineOrder.id);
    expect(ids).toContain(counterOrder.id);
  });

  it("COUNTER then ONLINE for the same Customer both appear in one history (reverse convergence)", async () => {
    const customer = await createTestCustomer("Counter-Then-Online Customer");
    const { order: counterOrder } = await createTestOrder({ source: "COUNTER", customerId: customer.id });
    const { order: onlineOrder } = await createTestOrder({ source: "ONLINE", customerId: customer.id });

    const results = await getOrdersForAuthenticatedCustomer(customer.id);
    const ids = results.map((o) => o.id);
    expect(ids).toContain(counterOrder.id);
    expect(ids).toContain(onlineOrder.id);
  });
});

describe("getOrderForAuthenticatedCustomer — IDOR resistance", () => {
  it("returns the order when it belongs to the requesting customer", async () => {
    const customer = await createTestCustomer("Detail Owner Customer");
    const { order } = await createTestOrder({ source: "ONLINE", customerId: customer.id });

    const found = await getOrderForAuthenticatedCustomer(order.orderNumber, customer.id);
    expect(found?.id).toBe(order.id);
  });

  it("returns null when Customer A requests Customer B's order by number — never leaking that it exists", async () => {
    const customerA = await createTestCustomer("IDOR Customer A");
    const customerB = await createTestCustomer("IDOR Customer B");
    const { order: orderB } = await createTestOrder({ source: "ONLINE", customerId: customerB.id });

    const found = await getOrderForAuthenticatedCustomer(orderB.orderNumber, customerA.id);
    expect(found).toBeNull();
  });

  it("returns null for a genuinely nonexistent order number — identical shape to the cross-customer case", async () => {
    const customer = await createTestCustomer("Nonexistent Order Customer");
    const found = await getOrderForAuthenticatedCustomer("ORD-DOES-NOT-EXIST-1234", customer.id);
    expect(found).toBeNull();
  });

  it("returns null for a guest Counter order, even if somehow the exact order number were guessed", async () => {
    const customer = await createTestCustomer("Guest IDOR Customer");
    const { order: guestOrder } = await createTestOrder({ source: "COUNTER", customerId: null });

    const found = await getOrderForAuthenticatedCustomer(guestOrder.orderNumber, customer.id);
    expect(found).toBeNull();
  });
});

describe("getOrderForAuthenticatedCustomer — financial and item snapshot correctness", () => {
  it("returns correct item snapshot, quantity, unit price, and line total", async () => {
    const customer = await createTestCustomer("Snapshot Customer");
    const { order, variant } = await createTestOrder({
      source: "ONLINE",
      customerId: customer.id,
      priceInPaise: 55000,
      quantity: 3,
    });

    const found = await getOrderForAuthenticatedCustomer(order.orderNumber, customer.id);
    expect(found?.items).toHaveLength(1);
    const item = found!.items[0]!;
    expect(item.quantity).toBe(3);
    expect(item.unitPriceInPaise).toBe(55000);
    expect(item.lineTotalInPaise).toBe(165000);
    expect(item.skuSnapshot).toBe(variant.sku);
    expect(found?.subtotalInPaise).toBe(165000);
    expect(found?.totalInPaise).toBe(165000);
  });

  it("historical product repricing after the order does not alter the returned order's snapshot", async () => {
    const customer = await createTestCustomer("Repricing Customer");
    const { order, product, variant } = await createTestOrder({
      source: "ONLINE",
      customerId: customer.id,
      priceInPaise: 30000,
    });

    await db.product.update({ where: { id: product.id }, data: { name: "Renamed After Purchase" } });
    await db.productVariant.update({ where: { id: variant.id }, data: { priceInPaise: 99999 } });

    const found = await getOrderForAuthenticatedCustomer(order.orderNumber, customer.id);
    expect(found?.items[0]?.productName).not.toBe("Renamed After Purchase");
    expect(found?.items[0]?.unitPriceInPaise).toBe(30000);
    expect(found?.subtotalInPaise).toBe(30000);
  });
});
