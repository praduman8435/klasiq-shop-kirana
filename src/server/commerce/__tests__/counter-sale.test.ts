import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { placeOrderForBasket } from "@/server/commerce/place-order";
import type { CheckoutInput } from "@/lib/validation/checkout";

let categoryId: string;
let testAdminId: string;
const createdProductIds: string[] = [];
const createdBasketIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-counter-sale-${randomUUID()}`, name: "Test Counter Sale Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: {
      name: "Test Cashier",
      email: `test-cashier-${randomUUID()}@example.com`,
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
      slug: `test-counter-product-${suffix}`,
      name: `Test Counter Product ${suffix.slice(0, 8)}`,
      categoryId,
    },
  });
  createdProductIds.push(product.id);

  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-COUNTER-SKU-${suffix}`,
      priceInPaise: params.priceInPaise,
      stockQuantity: params.stockQuantity,
      stockStatus: params.stockQuantity <= 0 ? "OUT_OF_STOCK" : "IN_STOCK",
    },
  });

  return { product, variant };
}

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

describe("createCounterSale — guest sale", () => {
  it("creates a COUNTER/COUNTER_HANDOVER order, decrements stock, and records no customer", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 20000, stockQuantity: 10 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 2 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.source).toBe("COUNTER");
    expect(order.fulfillmentType).toBe("COUNTER_HANDOVER");
    expect(order.status).toBe("DELIVERED");
    expect(order.paymentStatus).toBe("PAID");
    expect(order.paymentMethod).toBe("CASH");
    expect(order.customerId).toBeNull();
    expect(order.customerName).toBeNull();
    expect(order.customerMobile).toBeNull();
    expect(order.deliveryFeeInPaise).toBe(0);
    expect(order.subtotalInPaise).toBe(40000);
    expect(order.totalInPaise).toBe(40000);
    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(2);
    expect(order.createdByAdminUserId).toBe(testAdminId);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(8);
  });

  it("merges duplicate variant lines by summing quantity instead of double-guarding the row", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 10 });

    const result = await createCounterSale({
      lines: [
        { productVariantId: variant.id, quantity: 1 },
        { productVariantId: variant.id, quantity: 2 },
      ],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.items).toHaveLength(1);
    expect(order.items[0]?.quantity).toBe(3);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(7);
  });
});

describe("createCounterSale — customer selection", () => {
  it("links an EXISTING customer and updates their lastOrderAt", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 15000, stockQuantity: 5 });
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-T${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: "Existing Walk-in",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
      },
    });
    createdCustomerIds.push(customer.id);
    expect(customer.lastOrderAt).toBeNull();

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerId).toBe(customer.id);
    expect(order.customerName).toBe("Existing Walk-in");
    expect(order.customerMobile).toBe(phone);

    const updatedCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(updatedCustomer.lastOrderAt).not.toBeNull();
  });

  it("returns CUSTOMER_NOT_FOUND for an unknown existing customer id, creating nothing", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 15000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: "does-not-exist" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("CUSTOMER_NOT_FOUND");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });

  it("creates a NEW customer inline via the shared find-or-create service", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 12000, stockQuantity: 5 });
    const phone = freshTestPhone();

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "NEW", displayName: "Fresh Customer", primaryPhone: phone },
      paymentMethod: "CARD",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerId).not.toBeNull();
    expect(order.customerName).toBe("Fresh Customer");
    expect(order.customerMobile).toBe(phone);
    if (order.customerId) createdCustomerIds.push(order.customerId);

    const customer = await db.customer.findUniqueOrThrow({ where: { id: order.customerId! } });
    expect(customer.primaryPhoneNormalized).toBe(`+91${phone}`);
  });

  it("reuses the same customer across two counter sales for the same phone — never creates a duplicate", async () => {
    const { variant: variant1 } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const { variant: variant2 } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();

    const first = await createCounterSale({
      lines: [{ productVariantId: variant1.id, quantity: 1 }],
      customer: { mode: "NEW", displayName: "Repeat Customer", primaryPhone: phone },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });
    expect(first.success).toBe(true);
    if (!first.success) return;
    const firstOrder = await db.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } });
    createdOrderIds.push(firstOrder.id);
    if (firstOrder.customerId) createdCustomerIds.push(firstOrder.customerId);

    const second = await createCounterSale({
      lines: [{ productVariantId: variant2.id, quantity: 1 }],
      customer: { mode: "NEW", primaryPhone: phone },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });
    expect(second.success).toBe(true);
    if (!second.success) return;
    const secondOrder = await db.order.findUniqueOrThrow({ where: { orderNumber: second.orderNumber } });
    createdOrderIds.push(secondOrder.id);

    expect(secondOrder.customerId).toBe(firstOrder.customerId);

    const totalCustomers = await db.customer.count({
      where: { primaryPhoneNormalized: `+91${phone}` },
    });
    expect(totalCustomers).toBe(1);
  });

  it("rejects an invalid phone in NEW mode, creating no customer and no order", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const customersBefore = await db.customer.count();

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "NEW", primaryPhone: "123" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_PHONE");

    const customersAfter = await db.customer.count();
    expect(customersAfter).toBe(customersBefore);
    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });
});

describe("createCounterSale — inactive products and variants (Phase 3.2 Part 3 hardening)", () => {
  it("rejects a sale for a deactivated variant, even though it's otherwise in stock", async () => {
    const { product, variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    await db.productVariant.update({ where: { id: variant.id }, data: { isActive: false } });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(false);
    if (!result.success && result.error.type === "STOCK_ISSUE") {
      expect(result.error.issues[0]?.productName).toBe(product.name);
    } else {
      throw new Error("expected STOCK_ISSUE");
    }

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });

  it("rejects a sale for a variant whose product has been deactivated", async () => {
    const { product, variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    await db.product.update({ where: { id: product.id }, data: { isActive: false } });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("STOCK_ISSUE");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });
});

describe("createCounterSale — rejections", () => {
  it("rejects an empty sale without creating an order", async () => {
    const result = await createCounterSale({
      lines: [],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("EMPTY_SALE");
  });

  it("rejects insufficient stock, naming the item, and leaves stock untouched", async () => {
    const { product, variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 1 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 3 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(false);
    if (!result.success && result.error.type === "STOCK_ISSUE") {
      expect(result.error.issues[0]).toMatchObject({
        productName: product.name,
        requestedQuantity: 3,
        availableQuantity: 1,
      });
    } else {
      throw new Error("expected STOCK_ISSUE");
    }

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(1);
    const orderCount = await db.order.count({
      where: { items: { some: { productVariantId: variant.id } } },
    });
    expect(orderCount).toBe(0);
  });
});

describe("createCounterSale — discounts (Phase 3.6.5 Part 2)", () => {
  it("applies a flat discount: Grand Total, discount fields, and the single item's effective total", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 150000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "FLAT", value: 15000, reason: "Negotiation" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.subtotalInPaise).toBe(150000);
    expect(order.discountType).toBe("FLAT");
    expect(order.discountValue).toBe(15000);
    expect(order.discountReason).toBe("Negotiation");
    expect(order.discountInPaise).toBe(15000);
    expect(order.totalInPaise).toBe(135000);
    expect(order.items[0]?.lineTotalInPaise).toBe(150000);
    expect(order.items[0]?.effectiveLineTotalInPaise).toBe(135000);
  });

  it("applies a percentage discount", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 100000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "PERCENTAGE", value: 10 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.discountType).toBe("PERCENTAGE");
    expect(order.discountValue).toBe(10);
    expect(order.discountReason).toBeNull();
    expect(order.discountInPaise).toBe(10000);
    expect(order.totalInPaise).toBe(90000);
    expect(order.items[0]?.effectiveLineTotalInPaise).toBe(90000);
  });

  it("no discount (the default): effective totals equal the original totals, discountType is null", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 50000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 2 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.discountType).toBeNull();
    expect(order.discountValue).toBeNull();
    expect(order.discountInPaise).toBe(0);
    expect(order.totalInPaise).toBe(order.subtotalInPaise);
    expect(order.items[0]?.effectiveLineTotalInPaise).toBe(order.items[0]?.lineTotalInPaise);
  });

  it("a 100% discount brings the Grand Total to exactly zero", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 75000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "PERCENTAGE", value: 100, reason: "Owner Approval" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.totalInPaise).toBe(0);
    expect(order.items[0]?.effectiveLineTotalInPaise).toBe(0);
  });

  it("the brief's own worked example: Shirt ₹500, Pant ₹700, Belt ₹300, discount ₹150 → ₹450/₹630/₹270", async () => {
    const { variant: shirt } = await createTestVariant({ priceInPaise: 50000, stockQuantity: 5 });
    const { variant: pant } = await createTestVariant({ priceInPaise: 70000, stockQuantity: 5 });
    const { variant: belt } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [
        { productVariantId: shirt.id, quantity: 1 },
        { productVariantId: pant.id, quantity: 1 },
        { productVariantId: belt.id, quantity: 1 },
      ],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "FLAT", value: 15000 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    expect(order.subtotalInPaise).toBe(150000);
    expect(order.totalInPaise).toBe(135000);
    const byVariant = new Map(order.items.map((i) => [i.productVariantId, i.effectiveLineTotalInPaise]));
    expect(byVariant.get(shirt.id)).toBe(45000);
    expect(byVariant.get(pant.id)).toBe(63000);
    expect(byVariant.get(belt.id)).toBe(27000);
  });

  it("rounding: allocated effective totals always sum to exactly the Grand Total, even when they don't divide evenly", async () => {
    // Three items priced so a proportional split forces rounding.
    const { variant: a } = await createTestVariant({ priceInPaise: 33300, stockQuantity: 5 });
    const { variant: b } = await createTestVariant({ priceInPaise: 33300, stockQuantity: 5 });
    const { variant: c } = await createTestVariant({ priceInPaise: 33400, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [
        { productVariantId: a.id, quantity: 1 },
        { productVariantId: b.id, quantity: 1 },
        { productVariantId: c.id, quantity: 1 },
      ],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "FLAT", value: 10000 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({
      where: { orderNumber: result.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(order.id);

    const sumOfEffective = order.items.reduce((sum, item) => sum + item.effectiveLineTotalInPaise, 0);
    expect(sumOfEffective).toBe(order.totalInPaise);
  });

  it("rejects a discount that would exceed the subtotal — no order created, stock untouched (transaction rolled back)", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 50000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "FLAT", value: 60000 },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("DISCOUNT_INVALID");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
    const orderCount = await db.order.count({ where: { items: { some: { productVariantId: variant.id } } } });
    expect(orderCount).toBe(0);
  });

  it("rejects a percentage discount over 100, creating no order", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 50000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "PERCENTAGE", value: 150 },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("DISCOUNT_INVALID");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });
});

describe("createCounterSale — payments (Phase 3.6.5 Part 3)", () => {
  async function createTestCustomer(label: string) {
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-P${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: label,
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
      },
    });
    createdCustomerIds.push(customer.id);
    return customer;
  }

  it("defaults to Full Payment when no payment field is given: received == Grand Total, Outstanding zero, PAID", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 20000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.amountReceivedInPaise).toBe(20000);
    expect(order.outstandingInPaise).toBe(0);
    expect(order.paymentStatus).toBe("PAID");
  });

  it("an explicit Full Payment behaves identically to the default", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 30000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      payment: { mode: "FULL" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.amountReceivedInPaise).toBe(30000);
    expect(order.outstandingInPaise).toBe(0);
    expect(order.paymentStatus).toBe("PAID");
  });

  it("a Partial payment against a customer computes Outstanding as Grand Total minus Received, and lands PARTIALLY_PAID", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 100000, stockQuantity: 5 });
    const customer = await createTestCustomer("Partial Pay Customer");

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 40000 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.totalInPaise).toBe(100000);
    expect(order.amountReceivedInPaise).toBe(40000);
    expect(order.outstandingInPaise).toBe(60000);
    expect(order.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("a zero-amount Partial payment (full credit) is valid: Outstanding equals the whole Grand Total, UNPAID", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 50000, stockQuantity: 5 });
    const customer = await createTestCustomer("Full Credit Customer");

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 0 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.amountReceivedInPaise).toBe(0);
    expect(order.outstandingInPaise).toBe(50000);
    expect(order.paymentStatus).toBe("UNPAID");
  });

  it("a Partial payment for exactly the Grand Total zeroes Outstanding and lands PAID", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 25000, stockQuantity: 5 });
    const customer = await createTestCustomer("Exact Partial Customer");

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 25000 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.outstandingInPaise).toBe(0);
    expect(order.paymentStatus).toBe("PAID");
  });

  it("rejects an overpayment (received > Grand Total) with PAYMENT_INVALID, rolling back the entire transaction including stock", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 20000, stockQuantity: 5 });
    const customer = await createTestCustomer("Overpayment Customer");

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 20001 },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PAYMENT_INVALID");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
    const orderCount = await db.order.count({ where: { items: { some: { productVariantId: variant.id } } } });
    expect(orderCount).toBe(0);
  });

  it("rejects a negative amount received with PAYMENT_INVALID", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 20000, stockQuantity: 5 });
    const customer = await createTestCustomer("Negative Amount Customer");

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: -100 },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PAYMENT_INVALID");
  });

  it("rejects Partial payment for a Guest sale before any DB work — PARTIAL_PAYMENT_REQUIRES_CUSTOMER", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 20000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 10000 },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PARTIAL_PAYMENT_REQUIRES_CUSTOMER");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
    const orderCount = await db.order.count({ where: { items: { some: { productVariantId: variant.id } } } });
    expect(orderCount).toBe(0);
  });

  it("Outstanding is computed from the discounted Grand Total, never the Subtotal (discount + partial payment combined)", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 100000, stockQuantity: 5 });
    const customer = await createTestCustomer("Discount Partial Customer");

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "FLAT", value: 20000 }, // Grand Total 80000
      payment: { mode: "PARTIAL", amountReceivedInPaise: 30000 },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.subtotalInPaise).toBe(100000);
    expect(order.discountInPaise).toBe(20000);
    expect(order.totalInPaise).toBe(80000);
    expect(order.amountReceivedInPaise).toBe(30000);
    expect(order.outstandingInPaise).toBe(50000);
    expect(order.paymentStatus).toBe("PARTIALLY_PAID");
  });

  it("rejects an amount that fits within the Subtotal but exceeds the discounted Grand Total — proves it never validates against Subtotal", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 100000, stockQuantity: 5 });
    const customer = await createTestCustomer("Subtotal Trap Customer");

    // Subtotal 100000, 50% discount -> Grand Total 50000. 60000 fits well
    // inside the Subtotal but must still be rejected against the Grand Total.
    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      discount: { type: "PERCENTAGE", value: 50 },
      payment: { mode: "PARTIAL", amountReceivedInPaise: 60000 },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PAYMENT_INVALID");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });
});

describe("createCounterSale — address (Phase 3.6.6 Part 1)", () => {
  it("Guest sale: a one-time address is snapshotted onto the order", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      address: { mode: "ONE_TIME", addressLine: "12 Guest Lane", city: "Mumbai", state: "MH", pincode: "400001" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerAddressLine).toBe("12 Guest Lane");
    expect(order.customerAddressCity).toBe("Mumbai");
    expect(order.customerAddressState).toBe("MH");
    expect(order.customerAddressPincode).toBe("400001");
  });

  it("Guest sale with no address at all: every snapshot field stays null (default behaviour, unchanged)", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerAddressLine).toBeNull();
    expect(order.customerAddressCity).toBeNull();
    expect(order.customerAddressState).toBeNull();
    expect(order.customerAddressPincode).toBeNull();
  });

  it("rejects a Guest sale requesting the saved address (there is none to read) — ADDRESS_SAVED_REQUIRES_CUSTOMER", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      address: { mode: "SAVED" },
    });

    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("ADDRESS_SAVED_REQUIRES_CUSTOMER");

    const untouchedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(untouchedVariant.stockQuantity).toBe(5);
  });

  it("an EXISTING customer with a saved address: mode SAVED snapshots exactly that address onto the order", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-A${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: "Saved Address Customer",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
        addressLine: "45 Saved Street",
        addressCity: "Pune",
        addressState: "Maharashtra",
        addressPincode: "411001",
      },
    });
    createdCustomerIds.push(customer.id);

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      address: { mode: "SAVED" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerAddressLine).toBe("45 Saved Street");
    expect(order.customerAddressCity).toBe("Pune");
    expect(order.customerAddressState).toBe("Maharashtra");
    expect(order.customerAddressPincode).toBe("411001");

    // The customer's OWN saved address record is completely untouched by
    // using it — reading it for a snapshot is not the same as editing it.
    const unchangedCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(unchangedCustomer.addressLine).toBe("45 Saved Street");
  });

  it("an EXISTING customer with a saved address: a ONE_TIME address is used for the order but NEVER overwrites the saved address (section 4)", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-A${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: "One-Time Override Customer",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
        addressLine: "45 Saved Street",
        addressCity: "Pune",
        addressState: "Maharashtra",
        addressPincode: "411001",
      },
    });
    createdCustomerIds.push(customer.id);

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      address: {
        mode: "ONE_TIME",
        addressLine: "9 Delivery Depot Road",
        city: "Mumbai",
        state: "Maharashtra",
        pincode: "400001",
      },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    // The ORDER got the one-time address...
    expect(order.customerAddressLine).toBe("9 Delivery Depot Road");
    expect(order.customerAddressCity).toBe("Mumbai");

    // ...but the CUSTOMER's saved address is completely unchanged.
    const unchangedCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(unchangedCustomer.addressLine).toBe("45 Saved Street");
    expect(unchangedCustomer.addressCity).toBe("Pune");
  });

  it("an EXISTING customer with NO saved address: a one-time address is used for the order and never becomes the saved address", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-A${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: "No Saved Address Customer",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
      },
    });
    createdCustomerIds.push(customer.id);
    expect(customer.addressLine).toBeNull();

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      address: { mode: "ONE_TIME", addressLine: "1 Walk-in Way", city: "Nashik", state: "MH", pincode: "422001" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerAddressLine).toBe("1 Walk-in Way");

    // Still no saved address on the customer — a one-time entry NEVER
    // becomes the saved address, even when there was nothing to
    // "overwrite."
    const unchangedCustomer = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(unchangedCustomer.addressLine).toBeNull();
  });

  it("mode SAVED for a customer with no saved address resolves to an empty (null) snapshot, rather than failing", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-A${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: "Saved But Empty Customer",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
      },
    });
    createdCustomerIds.push(customer.id);

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      address: { mode: "SAVED" },
    });

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);

    expect(order.customerAddressLine).toBeNull();
    expect(order.customerAddressCity).toBeNull();
  });

  it("historical address stability: mutating the customer's saved address AFTER the sale never changes the order's own snapshot", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 5 });
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-A${randomUUID().slice(0, 5).toUpperCase()}`,
        displayName: "Historical Stability Customer",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
        addressLine: "Original Address",
        addressCity: "Pune",
        addressState: "Maharashtra",
        addressPincode: "411001",
      },
    });
    createdCustomerIds.push(customer.id);

    const result = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId: testAdminId,
      address: { mode: "SAVED" },
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } });
    createdOrderIds.push(order.id);
    expect(order.customerAddressLine).toBe("Original Address");

    // Simulate a hypothetical future "edit saved address" feature (none
    // exists in this codebase yet) by mutating the row directly — the
    // architectural guarantee (Order snapshot never depends on live
    // Customer data) must hold regardless of how the Customer row later
    // changes, not merely because nothing currently can change it.
    await db.customer.update({
      where: { id: customer.id },
      data: { addressLine: "Changed Address", addressCity: "Mumbai", addressState: "MH", addressPincode: "400001" },
    });

    const orderAfterCustomerChange = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(orderAfterCustomerChange.customerAddressLine).toBe("Original Address");
    expect(orderAfterCustomerChange.customerAddressCity).toBe("Pune");
    expect(orderAfterCustomerChange.customerAddressState).toBe("Maharashtra");
    expect(orderAfterCustomerChange.customerAddressPincode).toBe("411001");
  });
});

describe("createCounterSale — idempotency and concurrency", () => {
  it("returns the same order on a repeated submission with the same idempotency key", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 10 });
    const idempotencyKey = randomUUID();
    const params = {
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" as const },
      paymentMethod: "CASH" as const,
      idempotencyKey,
      adminUserId: testAdminId,
    };

    const first = await createCounterSale(params);
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } })).id);

    const second = await createCounterSale(params);
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.orderNumber).toBe(first.orderNumber);
    expect(second.alreadyExisted).toBe(true);

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(9);
  });

  it("handles two truly concurrent submissions with the SAME idempotency key", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 10 });
    const idempotencyKey = randomUUID();
    const params = {
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" as const },
      paymentMethod: "CASH" as const,
      idempotencyKey,
      adminUserId: testAdminId,
    };

    const [first, second] = await Promise.all([createCounterSale(params), createCounterSale(params)]);
    expect(first.success).toBe(true);
    expect(second.success).toBe(true);
    if (!first.success || !second.success) return;
    expect(first.orderNumber).toBe(second.orderNumber);
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } })).id);

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(9);
  });

  it("allows exactly one of two concurrent counter sales to win the final unit of stock", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 1 });

    const [resultA, resultB] = await Promise.all([
      createCounterSale({
        lines: [{ productVariantId: variant.id, quantity: 1 }],
        customer: { mode: "GUEST" },
        paymentMethod: "CASH",
        idempotencyKey: randomUUID(),
        adminUserId: testAdminId,
      }),
      createCounterSale({
        lines: [{ productVariantId: variant.id, quantity: 1 }],
        customer: { mode: "GUEST" },
        paymentMethod: "CASH",
        idempotencyKey: randomUUID(),
        adminUserId: testAdminId,
      }),
    ]);

    const successes = [resultA, resultB].filter((r) => r.success);
    expect(successes).toHaveLength(1);
    const winner = successes[0]!;
    if (winner.success) {
      createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: winner.orderNumber } })).id);
    }

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(0);
  });

  it("never oversells the last unit when an online checkout and a counter sale race for it (cross-flow concurrency)", async () => {
    const { variant } = await createTestVariant({ priceInPaise: 10000, stockQuantity: 1 });

    const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
    createdBasketIds.push(basket.id);
    await db.basketItem.create({
      data: { basketId: basket.id, productVariantId: variant.id, quantity: 1, priceInPaiseAtAdd: 10000 },
    });

    const onlineInput: CheckoutInput = {
      customerName: "Online Shopper",
      // A fresh, random phone (not a fixed fixture value) — since Phase
      // 3.3, placeOrderForBasket resolves/creates a Customer too, and this
      // avoids colliding with any other test file's own fixed-phone
      // customer fixtures.
      customerMobile: freshTestPhone(),
      whatsappSameAsPrimary: true,
      fulfillmentType: "STORE_PICKUP",
      idempotencyKey: randomUUID(),
    };

    const [onlineResult, counterResult] = await Promise.all([
      placeOrderForBasket(basket.id, onlineInput),
      createCounterSale({
        lines: [{ productVariantId: variant.id, quantity: 1 }],
        customer: { mode: "GUEST" },
        paymentMethod: "CASH",
        idempotencyKey: randomUUID(),
        adminUserId: testAdminId,
      }),
    ]);

    const successes = [onlineResult, counterResult].filter((r) => r.success);
    const failures = [onlineResult, counterResult].filter((r) => !r.success);
    expect(successes).toHaveLength(1);
    expect(failures).toHaveLength(1);
    if (!failures[0]!.success) {
      expect(failures[0]!.error.type).toBe("STOCK_ISSUE");
    }

    if (onlineResult.success) {
      const onlineOrder = await db.order.findUniqueOrThrow({ where: { orderNumber: onlineResult.orderNumber } });
      createdOrderIds.push(onlineOrder.id);
      if (onlineOrder.customerId) createdCustomerIds.push(onlineOrder.customerId);
    }
    if (counterResult.success) {
      createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: counterResult.orderNumber } })).id);
    }

    const finalVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(finalVariant.stockQuantity).toBe(0);
    expect(finalVariant.stockQuantity).toBeGreaterThanOrEqual(0);

    const orderCountForVariant = await db.order.count({
      where: { items: { some: { productVariantId: variant.id } } },
    });
    expect(orderCountForVariant).toBe(1);
  });
});
