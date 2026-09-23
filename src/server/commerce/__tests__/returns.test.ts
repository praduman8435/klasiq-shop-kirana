import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createReturnRequest } from "@/server/commerce/returns";
import { RETURN_WINDOW_DAYS } from "@/lib/return-lifecycle";

// Real Postgres integration tests — concurrency safety and IDOR
// resistance are properties of the actual guarded SQL, never provable
// against a mocked array. See docs/PHASE_3_5_REPORT.md "Tests".

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-returns-${randomUUID()}`, name: "Test Returns Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
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
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-R${randomUUID().slice(0, 6).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createDeliveredOrder(params: {
  customerId: string | null;
  source?: "ONLINE" | "COUNTER";
  deliveredAt?: Date | null;
  status?: "DELIVERED" | "PENDING" | "CONFIRMED";
  itemQuantity?: number;
  priceInPaise?: number;
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-returns-product-${suffix}`, name: `Test Returns Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-RETURNS-SKU-${suffix}`,
      priceInPaise: params.priceInPaise ?? 30000,
      stockQuantity: 10,
    },
  });

  const quantity = params.itemQuantity ?? 5;
  const priceInPaise = params.priceInPaise ?? 30000;
  const status = params.status ?? "DELIVERED";
  const deliveredAt = params.deliveredAt === undefined ? new Date() : params.deliveredAt;

  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-RET-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: params.source ?? "ONLINE",
      customerId: params.customerId,
      customerName: "Test Returns Customer",
      customerMobile: "9800000000",
      fulfillmentType: params.source === "COUNTER" ? "COUNTER_HANDOVER" : "STORE_PICKUP",
      paymentMethod: params.source === "COUNTER" ? "CASH" : "CASH_ON_DELIVERY",
      paymentStatus: params.source === "COUNTER" ? "PAID" : "UNPAID",
      status,
      deliveredAt,
      subtotalInPaise: priceInPaise * quantity,
      deliveryFeeInPaise: 0,
      totalInPaise: priceInPaise * quantity,
      amountReceivedInPaise: priceInPaise * quantity,
      outstandingInPaise: 0,
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
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return { order, orderItem: order.items[0]! };
}

describe("createReturnRequest — delivered-only rule", () => {
  it("rejects a return for a not-yet-delivered order using its real order item", async () => {
    const customer = await createTestCustomer("Not Delivered Customer 2");
    const { order, orderItem } = await createDeliveredOrder({
      customerId: customer.id,
      status: "PENDING",
      deliveredAt: null,
    });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_DELIVERED");
  });
});

describe("createReturnRequest — 7-day window", () => {
  it("allows a return within the window", async () => {
    const customer = await createTestCustomer("Within Window Customer");
    const { order, orderItem } = await createDeliveredOrder({
      customerId: customer.id,
      deliveredAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000),
    });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(true);
  });

  it("rejects a return after the window has passed", async () => {
    const customer = await createTestCustomer("Expired Window Customer");
    const { order, orderItem } = await createDeliveredOrder({
      customerId: customer.id,
      deliveredAt: new Date(Date.now() - (RETURN_WINDOW_DAYS + 1) * 24 * 60 * 60 * 1000),
    });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("RETURN_WINDOW_EXPIRED");
  });
});

describe("createReturnRequest — partial and quantity-tracked returns", () => {
  it("supports a partial return, then another partial return, tracking remaining quantity correctly", async () => {
    const customer = await createTestCustomer("Partial Returns Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 4 });

    const first = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(first.success).toBe(true);

    const second = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(second.success).toBe(true);

    const third = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 2, reason: "CHANGED_MIND" }],
    });
    expect(third.success).toBe(true);

    // 1 + 1 + 2 = 4, the full purchased quantity — nothing left.
    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(4);

    const fourth = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(fourth.success).toBe(false);
    if (!fourth.success) {
      expect(fourth.error.type).toBe("INSUFFICIENT_QUANTITY");
      if (fourth.error.type === "INSUFFICIENT_QUANTITY") {
        expect(fourth.error.returnableQuantity).toBe(0);
      }
    }
  });

  it("supports returning just 2 of 5 purchased, leaving 3 owned", async () => {
    const customer = await createTestCustomer("Sock Return Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 5 });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 2, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(true);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(2);
    expect(updatedItem.quantity - updatedItem.returnClaimedQuantity).toBe(3);
  });
});

describe("createReturnRequest — double return / over-return prevention", () => {
  it("rejects a request whose quantity exceeds the purchased quantity outright", async () => {
    const customer = await createTestCustomer("Exceeds Purchased Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 2 });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 5, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INSUFFICIENT_QUANTITY");
  });

  it("rejects returning the same purchased quantity twice", async () => {
    const customer = await createTestCustomer("Double Return Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 1 });

    const first = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(first.success).toBe(true);

    const second = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.type).toBe("INSUFFICIENT_QUANTITY");
  });

  it("rejects the whole request when one of several items is over-quantity — all or nothing", async () => {
    const customer = await createTestCustomer("All Or Nothing Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 1 });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [
        { orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" },
        { orderItemId: orderItem.id, quantity: 5, reason: "DEFECTIVE" },
      ],
    });
    // Duplicate orderItemId entries are summed (1 + 5 = 6), which exceeds
    // the purchased quantity of 1 — the whole request is rejected.
    expect(result.success).toBe(false);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(0);
  });
});

describe("createReturnRequest — exchange requests", () => {
  it("creates an EXCHANGE request using the same engine as RETURN", async () => {
    const customer = await createTestCustomer("Exchange Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 2 });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const created = await db.returnRequest.findUniqueOrThrow({ where: { id: result.returnRequestId } });
    expect(created.type).toBe("EXCHANGE");
    expect(created.status).toBe("REQUESTED");
  });
});

describe("createReturnRequest — status starts at REQUESTED", () => {
  it("a newly created request always starts REQUESTED", async () => {
    const customer = await createTestCustomer("Status Test Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 1 });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const created = await db.returnRequest.findUniqueOrThrow({ where: { id: result.returnRequestId } });
    expect(created.status).toBe("REQUESTED");
  });
});

describe("createReturnRequest — customer isolation (IDOR)", () => {
  it("rejects a return attempt using a different customer's order", async () => {
    const customerA = await createTestCustomer("Returns Customer A");
    const customerB = await createTestCustomer("Returns Customer B");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customerB.id, itemQuantity: 2 });

    const result = await createReturnRequest({
      customerId: customerA.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_FOUND");
  });

  it("rejects a return for a genuinely nonexistent order number — identical error shape", async () => {
    const customer = await createTestCustomer("Nonexistent Order Customer");
    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: "ORD-DOES-NOT-EXIST-9999",
      type: "RETURN",
      items: [{ orderItemId: "fake-item-id", quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_FOUND");
  });
});

describe("createReturnRequest — Counter purchase support and guest exclusion", () => {
  it("allows a return for a customer-linked Counter purchase", async () => {
    const customer = await createTestCustomer("Counter Linked Customer");
    const { order, orderItem } = await createDeliveredOrder({
      customerId: customer.id,
      source: "COUNTER",
      itemQuantity: 2,
    });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(result.success).toBe(true);
  });

  it("a guest Counter purchase (customerId: null) can never be returned — no customerId can match it", async () => {
    const customer = await createTestCustomer("Would-Be Guest Returner");
    const { order, orderItem } = await createDeliveredOrder({
      customerId: null,
      source: "COUNTER",
      itemQuantity: 2,
    });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ORDER_NOT_FOUND");
  });
});

describe("createReturnRequest — concurrency", () => {
  it("prevents two simultaneous requests from both claiming the last remaining quantity", async () => {
    const customer = await createTestCustomer("Concurrency Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 1 });

    const [resultA, resultB] = await Promise.all([
      createReturnRequest({
        customerId: customer.id,
        orderNumber: order.orderNumber,
        type: "RETURN",
        items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
      }),
      createReturnRequest({
        customerId: customer.id,
        orderNumber: order.orderNumber,
        type: "RETURN",
        items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    expect(successes).toHaveLength(1);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(1);
  });

  it("allows exactly one of two concurrent requests for the last 2 remaining of a 3-purchased item, when both request 2", async () => {
    const customer = await createTestCustomer("Concurrency Customer 2");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id, itemQuantity: 3 });

    const [resultA, resultB] = await Promise.all([
      createReturnRequest({
        customerId: customer.id,
        orderNumber: order.orderNumber,
        type: "RETURN",
        items: [{ orderItemId: orderItem.id, quantity: 2, reason: "WRONG_SIZE" }],
      }),
      createReturnRequest({
        customerId: customer.id,
        orderNumber: order.orderNumber,
        type: "RETURN",
        items: [{ orderItemId: orderItem.id, quantity: 2, reason: "DEFECTIVE" }],
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    // Both requesting 2 out of 3 available — only one can succeed (2+2=4 > 3).
    expect(successes).toHaveLength(1);

    const updatedItem = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(updatedItem.returnClaimedQuantity).toBe(2);
  });
});

describe("createReturnRequest — input validation", () => {
  it("rejects an empty item list", async () => {
    const customer = await createTestCustomer("Empty Request Customer");
    const { order } = await createDeliveredOrder({ customerId: customer.id });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("EMPTY_REQUEST");
  });

  it("rejects a zero or negative quantity", async () => {
    const customer = await createTestCustomer("Bad Quantity Customer");
    const { order, orderItem } = await createDeliveredOrder({ customerId: customer.id });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 0, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_QUANTITY");
  });

  it("rejects an orderItemId that doesn't belong to the order", async () => {
    const customer = await createTestCustomer("Wrong Item Customer");
    const { order } = await createDeliveredOrder({ customerId: customer.id });
    const { orderItem: otherItem } = await createDeliveredOrder({ customerId: customer.id });

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: otherItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ITEM_NOT_IN_ORDER");
  });
});
