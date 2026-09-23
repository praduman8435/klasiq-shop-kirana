import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createReturnRequest } from "@/server/commerce/returns";
import { getReturnableItemsForOrder, getReturnRequestsForOrder } from "@/server/queries/customer-portal/returns";

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-returnable-${randomUUID()}`, name: "Test Returnable Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdOrderIds.length) await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
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
      customerId: `KLQ-RQ${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createOrderWithItem(params: {
  customerId: string | null;
  deliveredAt: Date | null;
  quantity: number;
  claimed?: number;
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-returnable-product-${suffix}`, name: `Test Returnable ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-RETURNABLE-SKU-${suffix}`, priceInPaise: 20000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-RETQ-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId: params.customerId,
      customerName: "Test Customer",
      customerMobile: "9800000000",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      status: params.deliveredAt ? "DELIVERED" : "PENDING",
      deliveredAt: params.deliveredAt,
      subtotalInPaise: 20000 * params.quantity,
      deliveryFeeInPaise: 0,
      totalInPaise: 20000 * params.quantity,
      amountReceivedInPaise: 20000 * params.quantity,
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
            quantity: params.quantity,
            lineTotalInPaise: 20000 * params.quantity,
            effectiveLineTotalInPaise: 20000 * params.quantity,
            returnClaimedQuantity: params.claimed ?? 0,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return order;
}

describe("getReturnableItemsForOrder", () => {
  it("returns null when the order belongs to a different customer (IDOR-safe)", async () => {
    const customerA = await createTestCustomer("Returnable A");
    const customerB = await createTestCustomer("Returnable B");
    const order = await createOrderWithItem({ customerId: customerB.id, deliveredAt: new Date(), quantity: 2 });

    const result = await getReturnableItemsForOrder(order.orderNumber, customerA.id);
    expect(result).toBeNull();
  });

  it("marks an item eligible with the correct returnable quantity", async () => {
    const customer = await createTestCustomer("Returnable Eligible");
    const order = await createOrderWithItem({
      customerId: customer.id,
      deliveredAt: new Date(),
      quantity: 5,
      claimed: 2,
    });

    const result = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(result).not.toBeNull();
    expect(result![0]!.returnableQuantity).toBe(3);
    expect(result![0]!.eligible).toBe(true);
  });

  it("marks every item ineligible when the order hasn't been delivered", async () => {
    const customer = await createTestCustomer("Returnable Not Delivered");
    const order = await createOrderWithItem({ customerId: customer.id, deliveredAt: null, quantity: 3 });

    const result = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(result).not.toBeNull();
    expect(result![0]!.eligible).toBe(false);
  });

  it("marks an item ineligible once fully claimed", async () => {
    const customer = await createTestCustomer("Returnable Fully Claimed");
    const order = await createOrderWithItem({
      customerId: customer.id,
      deliveredAt: new Date(),
      quantity: 2,
      claimed: 2,
    });

    const result = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(result).not.toBeNull();
    expect(result![0]!.returnableQuantity).toBe(0);
    expect(result![0]!.eligible).toBe(false);
  });
});

describe("getReturnRequestsForOrder", () => {
  it("returns null when the order belongs to a different customer (IDOR-safe)", async () => {
    const customerA = await createTestCustomer("History A");
    const customerB = await createTestCustomer("History B");
    const order = await createOrderWithItem({ customerId: customerB.id, deliveredAt: new Date(), quantity: 2 });

    const result = await getReturnRequestsForOrder(order.orderNumber, customerA.id);
    expect(result).toBeNull();
  });

  it("returns an empty array for an order with no requests yet", async () => {
    const customer = await createTestCustomer("History Empty");
    const order = await createOrderWithItem({ customerId: customer.id, deliveredAt: new Date(), quantity: 2 });

    const result = await getReturnRequestsForOrder(order.orderNumber, customer.id);
    expect(result).toEqual([]);
  });

  it("orders requests newest first and includes each item's product/size snapshot", async () => {
    const customer = await createTestCustomer("History Ordering");
    const order = await createOrderWithItem({ customerId: customer.id, deliveredAt: new Date(), quantity: 4 });

    const first = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: order.items[0]!.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(first.success).toBe(true);

    const second = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: order.items[0]!.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;

    const result = await getReturnRequestsForOrder(order.orderNumber, customer.id);
    expect(result).not.toBeNull();
    expect(result).toHaveLength(2);
    // Newest (second, EXCHANGE) first.
    expect(result![0]!.id).toBe(second.returnRequestId);
    expect(result![0]!.type).toBe("EXCHANGE");
    expect(result![1]!.id).toBe(first.returnRequestId);
    expect(result![1]!.type).toBe("RETURN");
    expect(result![0]!.items[0]!.orderItem.productName).toBe(order.items[0]!.productName);
    expect(result![0]!.items[0]!.orderItem.size).toBe("M");
  });
});
