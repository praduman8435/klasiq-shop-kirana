import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createReturnRequest } from "@/server/commerce/returns";
import {
  getAdminReturnRequestByNumber,
  getAdminReturnRequests,
  getReturnRequestsForCustomer,
} from "@/server/queries/admin/returns";

let categoryId: string;
let schoolId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-admin-returns-q-${randomUUID()}`, name: "Test Admin Returns Query Category" },
  });
  categoryId = category.id;

  const school = await db.school.create({
    data: { slug: `test-admin-returns-school-${randomUUID()}`, name: `Test Returns School ${randomUUID().slice(0, 6)}` },
  });
  schoolId = school.id;
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  await db.school.delete({ where: { id: schoolId } });
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
      customerId: `KLQ-AQ${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createReturnableOrderAndRequest(params: {
  customerId: string;
  withSchool?: boolean;
  type?: "RETURN" | "EXCHANGE";
}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-admin-returns-q-product-${suffix}`, name: `Test Admin Q ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "L", sku: `TEST-ADMIN-Q-SKU-${suffix}`, priceInPaise: 25000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-ADMQ-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId: params.customerId,
      schoolId: params.withSchool ? schoolId : null,
      customerName: "Test Admin Query Customer",
      customerMobile: "9800000000",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 25000 * 2,
      deliveryFeeInPaise: 0,
      totalInPaise: 25000 * 2,
      amountReceivedInPaise: 25000 * 2,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "L",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 25000,
            quantity: 2,
            lineTotalInPaise: 25000 * 2,
            effectiveLineTotalInPaise: 25000 * 2,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);

  const created = await createReturnRequest({
    customerId: params.customerId,
    orderNumber: order.orderNumber,
    type: params.type ?? "RETURN",
    items: [{ orderItemId: order.items[0]!.id, quantity: 1, reason: "WRONG_SIZE" }],
  });
  if (!created.success) throw new Error("fixture setup failed: " + JSON.stringify(created));
  return { order, returnNumber: created.returnNumber };
}

describe("getAdminReturnRequests — filters", () => {
  it("filters by status", async () => {
    const customer = await createTestCustomer("Filter Status Customer");
    const { returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id });

    const requested = await getAdminReturnRequests({ status: "REQUESTED" });
    expect(requested.some((r) => r.returnNumber === returnNumber)).toBe(true);

    const approved = await getAdminReturnRequests({ status: "APPROVED" });
    expect(approved.some((r) => r.returnNumber === returnNumber)).toBe(false);
  });

  it("filters by type", async () => {
    const customer = await createTestCustomer("Filter Type Customer");
    const { returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id, type: "EXCHANGE" });

    const exchanges = await getAdminReturnRequests({ type: "EXCHANGE" });
    expect(exchanges.some((r) => r.returnNumber === returnNumber)).toBe(true);

    const returns = await getAdminReturnRequests({ type: "RETURN" });
    expect(returns.some((r) => r.returnNumber === returnNumber)).toBe(false);
  });

  it("filters by school", async () => {
    const customer = await createTestCustomer("Filter School Customer");
    const { returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id, withSchool: true });

    const withSchool = await getAdminReturnRequests({ schoolId });
    expect(withSchool.some((r) => r.returnNumber === returnNumber)).toBe(true);

    const otherSchool = await getAdminReturnRequests({ schoolId: "nonexistent-school-id" });
    expect(otherSchool.some((r) => r.returnNumber === returnNumber)).toBe(false);
  });
});

describe("getAdminReturnRequests — search", () => {
  it("finds a request by its own return number", async () => {
    const customer = await createTestCustomer("Search Return Number Customer");
    const { returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id });

    const results = await getAdminReturnRequests({ query: returnNumber });
    expect(results.some((r) => r.returnNumber === returnNumber)).toBe(true);
  });

  it("finds a request by the underlying order number", async () => {
    const customer = await createTestCustomer("Search Order Number Customer");
    const { order, returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id });

    const results = await getAdminReturnRequests({ query: order.orderNumber });
    expect(results.some((r) => r.returnNumber === returnNumber)).toBe(true);
  });

  it("finds a request by customer display name (partial, case-insensitive)", async () => {
    const customer = await createTestCustomer("Zzyx Uncommon Name");
    const { returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id });

    const results = await getAdminReturnRequests({ query: "uncommon name" });
    expect(results.some((r) => r.returnNumber === returnNumber)).toBe(true);
  });

  it("finds a request by customer ID", async () => {
    const customer = await createTestCustomer("Search Customer ID Customer");
    const { returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id });

    const results = await getAdminReturnRequests({ query: customer.customerId });
    expect(results.some((r) => r.returnNumber === returnNumber)).toBe(true);
  });

  it("finds a request by school name", async () => {
    const customer = await createTestCustomer("Search School Customer");
    const { returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id, withSchool: true });

    const school = await db.school.findUniqueOrThrow({ where: { id: schoolId } });
    const results = await getAdminReturnRequests({ query: school.name });
    expect(results.some((r) => r.returnNumber === returnNumber)).toBe(true);
  });
});

describe("getAdminReturnRequestByNumber", () => {
  it("returns full detail with order/customer/items", async () => {
    const customer = await createTestCustomer("Detail Query Customer");
    const { order, returnNumber } = await createReturnableOrderAndRequest({ customerId: customer.id });

    const detail = await getAdminReturnRequestByNumber(returnNumber);
    expect(detail).not.toBeNull();
    expect(detail!.order.orderNumber).toBe(order.orderNumber);
    expect(detail!.customer.customerId).toBe(customer.customerId);
    expect(detail!.items).toHaveLength(1);
    expect(detail!.items[0]!.orderItem.productName).toBeTruthy();
  });

  it("returns null for a nonexistent return number", async () => {
    const detail = await getAdminReturnRequestByNumber("RET-DOES-NOT-EXIST-9999");
    expect(detail).toBeNull();
  });
});

describe("getReturnRequestsForCustomer", () => {
  it("returns every request for a customer, newest first, across different orders", async () => {
    const customer = await createTestCustomer("Customer History Query Customer");
    const first = await createReturnableOrderAndRequest({ customerId: customer.id });
    const second = await createReturnableOrderAndRequest({ customerId: customer.id, type: "EXCHANGE" });

    const history = await getReturnRequestsForCustomer(customer.id);
    expect(history.map((r) => r.returnNumber)).toEqual([second.returnNumber, first.returnNumber]);
  });

  it("returns an empty array for a customer with no return requests", async () => {
    const customer = await createTestCustomer("No Returns Customer");
    const history = await getReturnRequestsForCustomer(customer.id);
    expect(history).toEqual([]);
  });
});
