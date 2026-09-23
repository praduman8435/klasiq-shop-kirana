import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { placeOrderForBasket } from "@/server/commerce/place-order";
import { createCounterSale } from "@/server/commerce/counter-sale";
import type { CheckoutInput } from "@/lib/validation/checkout";

// Phase 3.3 Part 1 — proves online checkout's Customer resolution: new
// customer creation, repeat-customer reuse, phone-format equivalence,
// counter<->online convergence, concurrency (real Postgres races, not
// sequential calls), idempotency interaction, failed-checkout customer
// state, and lastOrderAt semantics. Everything here is additive — it
// doesn't replace or weaken place-order.test.ts's existing coverage.

let categoryId: string;
let testAdminId: string;
const createdProductIds: string[] = [];
const createdBasketIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-checkout-customer-${randomUUID()}`, name: "Test Checkout Customer Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: {
      name: "Test Checkout Admin",
      email: `test-checkout-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  testAdminId = admin.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdBasketIds.length) {
    await db.basket.deleteMany({ where: { id: { in: createdBasketIds } } });
  }
  if (createdCustomerIds.length) {
    await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await db.adminUser.delete({ where: { id: testAdminId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createTestVariant(params: { priceInPaise: number; stockQuantity: number }) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: {
      slug: `test-checkout-customer-product-${suffix}`,
      name: `Test Checkout Customer Product ${suffix.slice(0, 8)}`,
      categoryId,
    },
  });
  createdProductIds.push(product.id);

  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-CHECKOUT-CUSTOMER-SKU-${suffix}`,
      priceInPaise: params.priceInPaise,
      stockQuantity: params.stockQuantity,
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

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

function checkoutInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    customerName: "Test Parent",
    customerMobile: freshTestPhone(),
    whatsappSameAsPrimary: true,
    fulfillmentType: "STORE_PICKUP",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

async function trackOrder(orderNumber: string) {
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber } });
  createdOrderIds.push(order.id);
  return order;
}

describe("placeOrderForBasket — new online customer", () => {
  it("creates exactly one Customer, links the order, and sets lastOrderAt", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 20000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 20000);
    const phone = freshTestPhone();

    const result = await placeOrderForBasket(
      basket.id,
      checkoutInput({ customerName: "Asha Kumar", customerMobile: phone }),
    );

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await trackOrder(result.orderNumber);

    expect(order.customerId).not.toBeNull();
    if (order.customerId) createdCustomerIds.push(order.customerId);

    const customer = await db.customer.findUniqueOrThrow({ where: { id: order.customerId! } });
    expect(customer.customerId).toMatch(/^KLQ-/);
    expect(customer.displayName).toBe("Asha Kumar");
    expect(customer.primaryPhoneNormalized).toBe(`+91${phone}`);
    expect(customer.lastOrderAt).not.toBeNull();

    const totalCustomers = await db.customer.count({
      where: { primaryPhoneNormalized: `+91${phone}` },
    });
    expect(totalCustomers).toBe(1);
  });
});

describe("placeOrderForBasket — repeat online customer", () => {
  it("reuses the same Customer across two separate checkouts and advances lastOrderAt", async () => {
    const { variant: variant1 } = await createTestVariant({ priceInPaise: 15000, stockQuantity: 5 });
    const { variant: variant2 } = await createTestVariant({ priceInPaise: 15000, stockQuantity: 5 });
    const phone = freshTestPhone();

    const basket1 = await createTestBasket();
    await addBasketItem(basket1.id, variant1.id, 1, 15000);
    const first = await placeOrderForBasket(basket1.id, checkoutInput({ customerMobile: phone }));
    expect(first.success).toBe(true);
    if (!first.success) return;
    const firstOrder = await trackOrder(first.orderNumber);
    if (firstOrder.customerId) createdCustomerIds.push(firstOrder.customerId);

    const firstCustomer = await db.customer.findUniqueOrThrow({ where: { id: firstOrder.customerId! } });

    const basket2 = await createTestBasket();
    await addBasketItem(basket2.id, variant2.id, 1, 15000);
    const second = await placeOrderForBasket(basket2.id, checkoutInput({ customerMobile: phone }));
    expect(second.success).toBe(true);
    if (!second.success) return;
    const secondOrder = await trackOrder(second.orderNumber);

    expect(secondOrder.customerId).toBe(firstOrder.customerId);

    const totalCustomers = await db.customer.count({
      where: { primaryPhoneNormalized: `+91${phone}` },
    });
    expect(totalCustomers).toBe(1);

    const updatedCustomer = await db.customer.findUniqueOrThrow({ where: { id: firstCustomer.id } });
    expect(updatedCustomer.lastOrderAt!.getTime()).toBeGreaterThanOrEqual(firstCustomer.lastOrderAt!.getTime());
  });
});

describe("placeOrderForBasket — phone normalization equivalence", () => {
  it("treats 9876543210 and +91 9876543210 as the same customer", async () => {
    const { variant: variant1 } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const { variant: variant2 } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const bareDigits = freshTestPhone();
    const spacedWithPrefix = `+91 ${bareDigits.slice(0, 5)} ${bareDigits.slice(5)}`;

    const basket1 = await createTestBasket();
    await addBasketItem(basket1.id, variant1.id, 1, 10000);
    const first = await placeOrderForBasket(basket1.id, checkoutInput({ customerMobile: bareDigits }));
    expect(first.success).toBe(true);
    if (!first.success) return;
    const firstOrder = await trackOrder(first.orderNumber);
    if (firstOrder.customerId) createdCustomerIds.push(firstOrder.customerId);

    const basket2 = await createTestBasket();
    await addBasketItem(basket2.id, variant2.id, 1, 10000);
    const second = await placeOrderForBasket(
      basket2.id,
      checkoutInput({ customerMobile: spacedWithPrefix.replace(/[\s-]/g, "") }),
    );
    expect(second.success).toBe(true);
    if (!second.success) return;
    const secondOrder = await trackOrder(second.orderNumber);

    expect(secondOrder.customerId).toBe(firstOrder.customerId);
  });
});

describe("placeOrderForBasket — counter/online identity convergence", () => {
  it("reuses a customer created at the counter for a later online checkout", async () => {
    const { variant: counterVariant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const { variant: onlineVariant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();

    const counterResult = await createCounterSale({
      lines: [{ productVariantId: counterVariant.id, quantity: 1 }],
      customer: { mode: "NEW", displayName: "Counter First", primaryPhone: phone },
      schoolId: null,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });
    expect(counterResult.success).toBe(true);
    if (!counterResult.success) return;
    const counterOrder = await trackOrder(counterResult.orderNumber);
    if (counterOrder.customerId) createdCustomerIds.push(counterOrder.customerId);

    const basket = await createTestBasket();
    await addBasketItem(basket.id, onlineVariant.id, 1, 10000);
    const onlineResult = await placeOrderForBasket(
      basket.id,
      checkoutInput({ customerMobile: phone.slice(0, 5) + "-" + phone.slice(5) }),
    );
    expect(onlineResult.success).toBe(true);
    if (!onlineResult.success) return;
    const onlineOrder = await trackOrder(onlineResult.orderNumber);

    expect(onlineOrder.customerId).toBe(counterOrder.customerId);
    const totalCustomers = await db.customer.count({ where: { primaryPhoneNormalized: `+91${phone}` } });
    expect(totalCustomers).toBe(1);
  });

  it("reuses a customer created online for a later counter sale", async () => {
    const { variant: onlineVariant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const { variant: counterVariant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();

    const basket = await createTestBasket();
    await addBasketItem(basket.id, onlineVariant.id, 1, 10000);
    const onlineResult = await placeOrderForBasket(
      basket.id,
      checkoutInput({ customerName: "Online First", customerMobile: phone }),
    );
    expect(onlineResult.success).toBe(true);
    if (!onlineResult.success) return;
    const onlineOrder = await trackOrder(onlineResult.orderNumber);
    if (onlineOrder.customerId) createdCustomerIds.push(onlineOrder.customerId);

    const counterResult = await createCounterSale({
      lines: [{ productVariantId: counterVariant.id, quantity: 1 }],
      customer: { mode: "NEW", primaryPhone: `${phone.slice(0, 5)} ${phone.slice(5)}` },
      schoolId: null,
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });
    expect(counterResult.success).toBe(true);
    if (!counterResult.success) return;
    const counterOrder = await trackOrder(counterResult.orderNumber);

    expect(counterOrder.customerId).toBe(onlineOrder.customerId);
    const totalCustomers = await db.customer.count({ where: { primaryPhoneNormalized: `+91${phone}` } });
    expect(totalCustomers).toBe(1);
  });
});

describe("placeOrderForBasket — concurrency", () => {
  it("never creates duplicate customers for two concurrent checkouts with equivalent phone formats", async () => {
    const { variant: variantA } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const { variant: variantB } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();
    const formatA = phone;
    const formatB = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`.replace(/[\s]/g, "");

    const basketA = await createTestBasket();
    await addBasketItem(basketA.id, variantA.id, 1, 10000);
    const basketB = await createTestBasket();
    await addBasketItem(basketB.id, variantB.id, 1, 10000);

    const [resultA, resultB] = await Promise.all([
      placeOrderForBasket(basketA.id, checkoutInput({ customerMobile: formatA })),
      placeOrderForBasket(basketB.id, checkoutInput({ customerMobile: formatB })),
    ]);

    expect(resultA.success).toBe(true);
    expect(resultB.success).toBe(true);
    if (!resultA.success || !resultB.success) return;

    const orderA = await trackOrder(resultA.orderNumber);
    const orderB = await trackOrder(resultB.orderNumber);
    if (orderA.customerId) createdCustomerIds.push(orderA.customerId);

    expect(orderA.customerId).not.toBeNull();
    expect(orderA.customerId).toBe(orderB.customerId);

    const totalCustomers = await db.customer.count({
      where: { primaryPhoneNormalized: `+91${phone}` },
    });
    expect(totalCustomers).toBe(1);
  });
});

describe("placeOrderForBasket — idempotency interaction with customer resolution", () => {
  it("a repeated submission with the same idempotency key does not re-touch customer state incorrectly", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 10000);
    const phone = freshTestPhone();
    const input = checkoutInput({ customerMobile: phone });

    const first = await placeOrderForBasket(basket.id, input);
    expect(first.success).toBe(true);
    if (!first.success) return;
    const firstOrder = await trackOrder(first.orderNumber);
    if (firstOrder.customerId) createdCustomerIds.push(firstOrder.customerId);
    const customerAfterFirst = await db.customer.findUniqueOrThrow({ where: { id: firstOrder.customerId! } });

    const second = await placeOrderForBasket(basket.id, input);
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.alreadyExisted).toBe(true);

    const totalOrders = await db.order.count({ where: { idempotencyKey: input.idempotencyKey } });
    expect(totalOrders).toBe(1);
    const totalCustomers = await db.customer.count({ where: { primaryPhoneNormalized: `+91${phone}` } });
    expect(totalCustomers).toBe(1);

    const customerAfterSecond = await db.customer.findUniqueOrThrow({ where: { id: firstOrder.customerId! } });
    expect(customerAfterSecond.lastOrderAt!.getTime()).toBe(customerAfterFirst.lastOrderAt!.getTime());
  });

  it("handles two truly concurrent submissions with the SAME idempotency key without duplicating the customer", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 10 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 1, 10000);
    const phone = freshTestPhone();
    const input = checkoutInput({ customerMobile: phone });

    const [first, second] = await Promise.all([
      placeOrderForBasket(basket.id, input),
      placeOrderForBasket(basket.id, input),
    ]);

    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(first.orderNumber).toBe(second.orderNumber);

    const order = await trackOrder(first.orderNumber);
    if (order.customerId) createdCustomerIds.push(order.customerId);
    expect(order.customerId).not.toBeNull();

    const totalCustomers = await db.customer.count({ where: { primaryPhoneNormalized: `+91${phone}` } });
    expect(totalCustomers).toBe(1);
  });
});

describe("placeOrderForBasket — failed checkout and lastOrderAt semantics", () => {
  it("does not update lastOrderAt when checkout fails due to insufficient stock (customer may still be resolved)", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 1 });
    const basket = await createTestBasket();
    await addBasketItem(basket.id, variant.id, 3, 10000);
    const phone = freshTestPhone();

    const result = await placeOrderForBasket(basket.id, checkoutInput({ customerMobile: phone }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("STOCK_ISSUE");

    // Documented, deliberate tradeoff (see docs/PHASE_3_3_REPORT.md
    // "Transaction boundary decision"): resolving the customer happens
    // AFTER the stock check succeeds, inside the same transaction — so a
    // stock failure means customer resolution is never reached at all, and
    // no Customer row is created for this failed attempt.
    const customer = await db.customer.findUnique({ where: { primaryPhoneNormalized: `+91${phone}` } });
    expect(customer).toBeNull();

    const orderCount = await db.order.count({
      where: { items: { some: { productVariantId: variant.id } } },
    });
    expect(orderCount).toBe(0);
  });

  it("does not create an order or touch customer state for an empty basket", async () => {
    const basket = await createTestBasket();
    const phone = freshTestPhone();

    const result = await placeOrderForBasket(basket.id, checkoutInput({ customerMobile: phone }));
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(result.error.type).toBe("EMPTY_BASKET");

    const customer = await db.customer.findUnique({ where: { primaryPhoneNormalized: `+91${phone}` } });
    expect(customer).toBeNull();
  });
});

describe("placeOrderForBasket — historical orders remain valid", () => {
  it("an order created with customerId null (pre-Phase-3.3 shape) still reads back correctly", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const suffix = randomUUID();
    const historicalOrder = await db.order.create({
      data: {
        orderNumber: `ORD-HIST-${suffix.slice(0, 8).toUpperCase()}`,
        accessToken: randomUUID(),
        source: "ONLINE",
        customerName: "Historical Customer",
        customerMobile: "9876500000",
        fulfillmentType: "STORE_PICKUP",
        paymentMethod: "CASH_ON_DELIVERY",
        subtotalInPaise: 10000,
        totalInPaise: 10000,
        amountReceivedInPaise: 10000,
        outstandingInPaise: 0,
        items: {
          create: [
            {
              productId: variant.productId,
              productVariantId: variant.id,
              productName: "Historical Product",
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
    createdOrderIds.push(historicalOrder.id);

    expect(historicalOrder.customerId).toBeNull();

    const reread = await db.order.findUniqueOrThrow({ where: { id: historicalOrder.id } });
    expect(reread.customerId).toBeNull();
    expect(reread.customerName).toBe("Historical Customer");
  });
});
