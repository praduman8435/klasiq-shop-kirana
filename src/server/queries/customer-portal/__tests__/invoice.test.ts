import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getInvoiceForAuthenticatedCustomer } from "@/server/queries/customer-portal/invoice";

// Real Postgres integration tests — the authorization boundary here IS the
// query's WHERE clause, so this must be proven against a real database,
// never a mocked array. Mirrors getOrderForAuthenticatedCustomer's own
// "IDOR resistance" test shape exactly (src/server/queries/customer-portal/__tests__/orders.test.ts).

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-portal-invoice-${randomUUID()}`, name: "Test Portal Invoice Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
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
      customerId: `KLQ-PI${randomUUID().slice(0, 4).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createTestOrder(customerId: string | null) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-portal-invoice-product-${suffix}`, name: `Test Portal Invoice Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-PI-SKU-${suffix}`, priceInPaise: 40000, stockQuantity: 10 },
  });

  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-PI-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId,
      customerName: "Test Portal Invoice Customer",
      customerMobile: "9800000000",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "UNPAID",
      status: "PENDING",
      subtotalInPaise: 40000,
      deliveryFeeInPaise: 0,
      totalInPaise: 40000,
      amountReceivedInPaise: 40000,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 40000,
            quantity: 1,
            lineTotalInPaise: 40000,
            effectiveLineTotalInPaise: 40000,
          },
        ],
      },
    },
  });
  createdOrderIds.push(order.id);
  return order;
}

describe("getInvoiceForAuthenticatedCustomer — authorization (IDOR resistance)", () => {
  it("returns the invoice when the order belongs to the requesting customer", async () => {
    const customer = await createTestCustomer("Invoice Owner Customer");
    const order = await createTestOrder(customer.id);

    const invoice = await getInvoiceForAuthenticatedCustomer(order.orderNumber, customer.id);
    expect(invoice).not.toBeNull();
    expect(invoice?.orderNumber).toBe(order.orderNumber);
  });

  it("returns null when Customer A requests Customer B's invoice by order number — never leaking that it exists", async () => {
    const customerA = await createTestCustomer("Invoice IDOR Customer A");
    const customerB = await createTestCustomer("Invoice IDOR Customer B");
    const orderB = await createTestOrder(customerB.id);

    const invoice = await getInvoiceForAuthenticatedCustomer(orderB.orderNumber, customerA.id);
    expect(invoice).toBeNull();
  });

  it("returns null for a genuinely nonexistent order number — identical shape to the cross-customer case", async () => {
    const customer = await createTestCustomer("Invoice Nonexistent Order Customer");
    const invoice = await getInvoiceForAuthenticatedCustomer(`ORD-DOES-NOT-EXIST-${randomUUID()}`, customer.id);
    expect(invoice).toBeNull();
  });

  it("returns null for a guest Counter order, even if the exact order number were somehow guessed", async () => {
    const customer = await createTestCustomer("Invoice Guest IDOR Customer");
    const guestOrder = await createTestOrder(null);

    const invoice = await getInvoiceForAuthenticatedCustomer(guestOrder.orderNumber, customer.id);
    expect(invoice).toBeNull();
  });
});
