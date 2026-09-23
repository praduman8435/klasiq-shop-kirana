import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getExchangePriceDifference } from "@/lib/exchange-price";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { createReturnRequest } from "@/server/commerce/returns";
import { getReturnRequestsForOrder } from "@/server/queries/customer-portal/returns";

// Real Postgres integration tests — inventory atomicity and concurrency
// safety are properties of the actual guarded SQL, never provable against
// a mocked array. Mirrors src/server/commerce/__tests__/admin-returns.test.ts's
// own fixture shape (Phase 3.5 Part 3).

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-return-fulfillment-${randomUUID()}`, name: "Test Return Fulfillment Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: {
      name: "Test Fulfillment Admin",
      email: `test-fulfillment-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  await db.adminUser.delete({ where: { id: adminUserId } });
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
      customerId: `KLQ-RF${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createVariant(params: { stockQuantity: number; isActive?: boolean; priceInPaise?: number }) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-rf-product-${suffix}`, name: `Test RF Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-RF-SKU-${suffix}`,
      priceInPaise: params.priceInPaise ?? 30000,
      stockQuantity: params.stockQuantity,
      isActive: params.isActive ?? true,
    },
  });
  return { product, variant };
}

async function createApprovedReturn(params: {
  customerId: string;
  type: "RETURN" | "EXCHANGE";
  quantity?: number;
  variantStock?: number;
  source?: "ONLINE" | "COUNTER";
}) {
  const quantity = params.quantity ?? 2;
  const { product, variant } = await createVariant({ stockQuantity: params.variantStock ?? 10 });
  const suffix = randomUUID();
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-RF-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: params.source ?? "ONLINE",
      customerId: params.customerId,
      customerName: "Test RF Customer",
      customerMobile: "9800000000",
      fulfillmentType: params.source === "COUNTER" ? "COUNTER_HANDOVER" : "STORE_PICKUP",
      paymentMethod: params.source === "COUNTER" ? "CASH" : "CASH_ON_DELIVERY",
      paymentStatus: params.source === "COUNTER" ? "PAID" : "UNPAID",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 30000 * quantity,
      deliveryFeeInPaise: 0,
      totalInPaise: 30000 * quantity,
      amountReceivedInPaise: 30000 * quantity,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 30000,
            quantity,
            lineTotalInPaise: 30000 * quantity,
            effectiveLineTotalInPaise: 30000 * quantity,
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
    type: params.type,
    items: [{ orderItemId: order.items[0]!.id, quantity, reason: "WRONG_SIZE" }],
  });
  if (!created.success) throw new Error("fixture setup failed: " + JSON.stringify(created));

  const approved = await updateReturnRequestStatus({
    returnNumber: created.returnNumber,
    newStatus: "APPROVED",
    adminUserId,
  });
  if (!approved.success) throw new Error("fixture approve failed: " + JSON.stringify(approved));

  const request = await db.returnRequest.findUniqueOrThrow({
    where: { returnNumber: created.returnNumber },
    include: { items: true },
  });

  return { order, product, variant, quantity, returnNumber: created.returnNumber, requestItemId: request.items[0]!.id };
}

describe("receiveReturnRequest — RETURN: inventory restored", () => {
  it("restores the original item's stock exactly once and creates a RETURN_RESTORE adjustment", async () => {
    const customer = await createTestCustomer("Restore Customer");
    const { variant, quantity, returnNumber } = await createApprovedReturn({
      customerId: customer.id,
      type: "RETURN",
      quantity: 2,
      variantStock: 10,
    });

    const result = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(result).toEqual({ success: true });

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(10 + quantity);

    const request = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(request.status).toBe("COMPLETED");
    expect(request.receivedAt).not.toBeNull();
    expect(request.receivedByAdminUserId).toBe(adminUserId);
    expect(request.completedAt).not.toBeNull();
    expect(request.completedByAdminUserId).toBe(adminUserId);

    const adjustments = await db.inventoryAdjustment.findMany({ where: { returnRequestId: request.id } });
    expect(adjustments).toHaveLength(1);
    expect(adjustments[0]!.reason).toBe("RETURN_RESTORE");
    expect(adjustments[0]!.delta).toBe(quantity);
    expect(adjustments[0]!.productVariantId).toBe(variant.id);
    expect(adjustments[0]!.adminUserId).toBe(adminUserId);
  });

  it("prevents a duplicate receive — a second call is rejected and stock is not restored twice", async () => {
    const customer = await createTestCustomer("Duplicate Receive Customer");
    const { variant, returnNumber } = await createApprovedReturn({
      customerId: customer.id,
      type: "RETURN",
      quantity: 1,
      variantStock: 5,
    });

    const first = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(first.success).toBe(true);
    const afterFirst = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(afterFirst.stockQuantity).toBe(6);

    const second = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.type).toBe("INVALID_TRANSITION");

    const afterSecond = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(afterSecond.stockQuantity).toBe(6);

    const adjustments = await db.inventoryAdjustment.findMany({ where: { productVariantId: variant.id } });
    expect(adjustments).toHaveLength(1);
  });

  it("rejects receiving a request that is still REQUESTED (never approved)", async () => {
    const customer = await createTestCustomer("Not Approved Customer");
    const { product, variant } = await createVariant({ stockQuantity: 5 });
    const suffix = randomUUID();
    const order = await db.order.create({
      data: {
        orderNumber: `ORD-TEST-RF-NA-${suffix.slice(0, 8).toUpperCase()}`,
        accessToken: randomUUID(),
        source: "ONLINE",
        customerId: customer.id,
        customerName: "Test RF Customer",
        customerMobile: "9800000000",
        fulfillmentType: "STORE_PICKUP",
        paymentMethod: "CASH_ON_DELIVERY",
        paymentStatus: "UNPAID",
        status: "DELIVERED",
        deliveredAt: new Date(),
        subtotalInPaise: 30000,
        deliveryFeeInPaise: 0,
        totalInPaise: 30000,
        amountReceivedInPaise: 30000,
        outstandingInPaise: 0,
        items: {
          create: [
            {
              productId: product.id,
              productVariantId: variant.id,
              productName: product.name,
              size: "M",
              skuSnapshot: variant.sku,
              unitPriceInPaise: 30000,
              quantity: 1,
              lineTotalInPaise: 30000,
              effectiveLineTotalInPaise: 30000,
            },
          ],
        },
      },
      include: { items: true },
    });
    createdOrderIds.push(order.id);
    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: order.items[0]!.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    if (!created.success) throw new Error("fixture setup failed");

    const result = await receiveReturnRequest({ returnNumber: created.returnNumber, adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });

  it("returns NOT_FOUND for a nonexistent return number", async () => {
    const result = await receiveReturnRequest({ returnNumber: "RET-DOES-NOT-EXIST-9999", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
  });
});

describe("receiveReturnRequest — EXCHANGE: replacement selection and stock", () => {
  it("restores the original item and deducts the replacement, creating both adjustments", async () => {
    const customer = await createTestCustomer("Exchange Customer");
    const { variant, quantity, returnNumber, requestItemId } = await createApprovedReturn({
      customerId: customer.id,
      type: "EXCHANGE",
      quantity: 1,
      variantStock: 5,
    });
    const { variant: replacement } = await createVariant({ stockQuantity: 3 });

    const result = await receiveReturnRequest({
      returnNumber,
      adminUserId,
      replacements: { [requestItemId]: replacement.id },
    });
    expect(result).toEqual({ success: true });

    const originalAfter = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(originalAfter.stockQuantity).toBe(5 + quantity);

    const replacementAfter = await db.productVariant.findUniqueOrThrow({ where: { id: replacement.id } });
    expect(replacementAfter.stockQuantity).toBe(3 - quantity);

    const request = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(request.status).toBe("COMPLETED");

    const adjustments = await db.inventoryAdjustment.findMany({
      where: { returnRequestId: request.id },
      orderBy: { createdAt: "asc" },
    });
    expect(adjustments).toHaveLength(2);
    expect(adjustments.map((a) => a.reason).sort()).toEqual(["EXCHANGE_ISSUE", "RETURN_RESTORE"]);

    const requestItem = await db.returnRequestItem.findUniqueOrThrow({ where: { id: requestItemId } });
    expect(requestItem.replacementVariantId).toBe(replacement.id);
    expect(requestItem.replacementUnitPriceInPaiseSnapshot).toBe(replacement.priceInPaise);
  });

  it("requires a replacement variant for every item before receiving", async () => {
    const customer = await createTestCustomer("Missing Replacement Customer");
    const { returnNumber } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE" });

    const result = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("REPLACEMENT_REQUIRED");
  });

  it("rejects a replacement variant that doesn't exist", async () => {
    const customer = await createTestCustomer("Bogus Replacement Customer");
    const { returnNumber, requestItemId } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE" });

    const result = await receiveReturnRequest({
      returnNumber,
      adminUserId,
      replacements: { [requestItemId]: "not-a-real-variant-id" },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_REPLACEMENT_VARIANT");
  });

  it("rejects a replacement variant that is inactive", async () => {
    const customer = await createTestCustomer("Inactive Replacement Customer");
    const { returnNumber, requestItemId } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE" });
    const { variant: inactiveReplacement } = await createVariant({ stockQuantity: 5, isActive: false });

    const result = await receiveReturnRequest({
      returnNumber,
      adminUserId,
      replacements: { [requestItemId]: inactiveReplacement.id },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_REPLACEMENT_VARIANT");
  });

  it("insufficient replacement stock rejects the whole transaction — original stock stays untouched, request stays APPROVED", async () => {
    const customer = await createTestCustomer("Insufficient Stock Customer");
    const { variant, returnNumber, requestItemId } = await createApprovedReturn({
      customerId: customer.id,
      type: "EXCHANGE",
      quantity: 3,
      variantStock: 10,
    });
    const { variant: scarceReplacement } = await createVariant({ stockQuantity: 1 }); // needs 3, only has 1

    const result = await receiveReturnRequest({
      returnNumber,
      adminUserId,
      replacements: { [requestItemId]: scarceReplacement.id },
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INSUFFICIENT_REPLACEMENT_STOCK");

    // Atomicity (section 11): the original item's stock must NOT have been
    // restored just because the replacement side failed.
    const originalAfter = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(originalAfter.stockQuantity).toBe(10);

    const replacementAfter = await db.productVariant.findUniqueOrThrow({ where: { id: scarceReplacement.id } });
    expect(replacementAfter.stockQuantity).toBe(1);

    const request = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(request.status).toBe("APPROVED");

    const adjustments = await db.inventoryAdjustment.findMany({ where: { returnRequestId: request.id } });
    expect(adjustments).toHaveLength(0);
  });
});

describe("receiveReturnRequest — concurrency", () => {
  it("prevents two simultaneous receives — exactly one reconciles inventory", async () => {
    const customer = await createTestCustomer("Concurrent Receive Customer");
    const { variant, quantity, returnNumber } = await createApprovedReturn({
      customerId: customer.id,
      type: "RETURN",
      quantity: 2,
      variantStock: 10,
    });

    const [a, b] = await Promise.all([
      receiveReturnRequest({ returnNumber, adminUserId }),
      receiveReturnRequest({ returnNumber, adminUserId }),
    ]);

    const successes = [a, b].filter((r) => r.success);
    expect(successes).toHaveLength(1);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(10 + quantity);

    const request = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(request.status).toBe("COMPLETED");

    const adjustments = await db.inventoryAdjustment.findMany({ where: { returnRequestId: request.id } });
    expect(adjustments).toHaveLength(1);
  });
});

describe("receiveReturnRequest — Counter-linked purchase", () => {
  it("reconciles inventory identically for a Counter-linked purchase", async () => {
    const customer = await createTestCustomer("Fulfillment Counter Customer");
    const { variant, quantity, returnNumber } = await createApprovedReturn({
      customerId: customer.id,
      type: "RETURN",
      quantity: 1,
      variantStock: 5,
      source: "COUNTER",
    });

    const result = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(result.success).toBe(true);

    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(5 + quantity);
  });
});

describe("receiveReturnRequest — customer portal synchronization", () => {
  it("the customer portal reflects COMPLETED immediately after receiving", async () => {
    const customer = await createTestCustomer("Fulfillment Portal Sync Customer");
    const { order, returnNumber } = await createApprovedReturn({
      customerId: customer.id,
      type: "RETURN",
      quantity: 1,
      variantStock: 5,
    });

    const result = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(result.success).toBe(true);

    const history = await getReturnRequestsForOrder(order.orderNumber, customer.id);
    const entry = history?.find((r) => r.returnNumber === returnNumber);
    expect(entry?.status).toBe("COMPLETED");
  });
});

describe("receiveReturnRequest — price difference snapshot (Phase 3.5 Part 5)", () => {
  it("EQUAL_VALUE — replacement at the same price", async () => {
    const customer = await createTestCustomer("Price Equal Customer");
    const { returnNumber, requestItemId } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE", quantity: 1 });
    const { variant: replacement } = await createVariant({ stockQuantity: 3, priceInPaise: 30000 });

    const result = await receiveReturnRequest({ returnNumber, adminUserId, replacements: { [requestItemId]: replacement.id } });
    expect(result.success).toBe(true);

    const requestItem = await db.returnRequestItem.findUniqueOrThrow({
      where: { id: requestItemId },
      include: { orderItem: true },
    });
    expect(requestItem.replacementUnitPriceInPaiseSnapshot).toBe(30000);

    const diff = getExchangePriceDifference({
      originalValueInPaise: requestItem.orderItem.effectiveLineTotalInPaise,
      replacementValueInPaise: requestItem.replacementUnitPriceInPaiseSnapshot! * requestItem.quantity,
    });
    expect(diff.type).toBe("EQUAL_VALUE");
    expect(diff.differenceInPaise).toBe(0);
  });

  it("CUSTOMER_PAYS — replacement is more expensive", async () => {
    const customer = await createTestCustomer("Price Customer Pays Customer");
    const { returnNumber, requestItemId } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE", quantity: 2 });
    const { variant: replacement } = await createVariant({ stockQuantity: 5, priceInPaise: 45000 });

    const result = await receiveReturnRequest({ returnNumber, adminUserId, replacements: { [requestItemId]: replacement.id } });
    expect(result.success).toBe(true);

    const requestItem = await db.returnRequestItem.findUniqueOrThrow({
      where: { id: requestItemId },
      include: { orderItem: true },
    });
    expect(requestItem.replacementUnitPriceInPaiseSnapshot).toBe(45000);

    const diff = getExchangePriceDifference({
      originalValueInPaise: requestItem.orderItem.effectiveLineTotalInPaise,
      replacementValueInPaise: requestItem.replacementUnitPriceInPaiseSnapshot! * requestItem.quantity,
    });
    expect(diff.type).toBe("CUSTOMER_PAYS");
    expect(diff.differenceInPaise).toBe((45000 - 30000) * 2);
  });

  it("REFUND_DUE — replacement is cheaper", async () => {
    const customer = await createTestCustomer("Price Refund Due Customer");
    const { returnNumber, requestItemId } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE", quantity: 1 });
    const { variant: replacement } = await createVariant({ stockQuantity: 5, priceInPaise: 20000 });

    const result = await receiveReturnRequest({ returnNumber, adminUserId, replacements: { [requestItemId]: replacement.id } });
    expect(result.success).toBe(true);

    const requestItem = await db.returnRequestItem.findUniqueOrThrow({
      where: { id: requestItemId },
      include: { orderItem: true },
    });
    expect(requestItem.replacementUnitPriceInPaiseSnapshot).toBe(20000);

    const diff = getExchangePriceDifference({
      originalValueInPaise: requestItem.orderItem.effectiveLineTotalInPaise,
      replacementValueInPaise: requestItem.replacementUnitPriceInPaiseSnapshot! * requestItem.quantity,
    });
    expect(diff.type).toBe("REFUND_DUE");
    expect(diff.differenceInPaise).toBe(20000 - 30000);
  });

  it("the snapshot is immutable — a later price change on the live variant never alters it", async () => {
    const customer = await createTestCustomer("Price Snapshot Immutable Customer");
    const { returnNumber, requestItemId } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE", quantity: 1 });
    const { variant: replacement } = await createVariant({ stockQuantity: 5, priceInPaise: 40000 });

    await receiveReturnRequest({ returnNumber, adminUserId, replacements: { [requestItemId]: replacement.id } });

    // The replacement variant's price changes AFTER the exchange (e.g. a
    // routine price update) — the historical record must not move.
    await db.productVariant.update({ where: { id: replacement.id }, data: { priceInPaise: 99999 } });

    const requestItem = await db.returnRequestItem.findUniqueOrThrow({ where: { id: requestItemId } });
    expect(requestItem.replacementUnitPriceInPaiseSnapshot).toBe(40000);
  });
});
