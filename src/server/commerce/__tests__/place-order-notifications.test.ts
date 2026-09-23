import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import type { CheckoutInput } from "@/lib/validation/checkout";

// Phase 3.6 Part 2 — proves the WIRING between placeOrderForBasket and the
// notification service: the right event, the right data, exactly once per
// real order, and that commerce survives a notification failure. The
// notification service's OWN internal logic (template selection, phone
// fallback, retries, Counter exclusion, etc.) is already fully covered by
// src/server/whatsapp/__tests__/notification-service.test.ts — this file
// only tests that placeOrderForBasket calls it correctly.
vi.mock("@/server/whatsapp/notification-service", () => ({
  notifyOrderEvent: vi.fn().mockResolvedValue(undefined),
}));
import { notifyOrderEvent } from "@/server/whatsapp/notification-service";
import { placeOrderForBasket } from "@/server/commerce/place-order";

const mockedNotifyOrderEvent = vi.mocked(notifyOrderEvent);

let categoryId: string;
const createdProductIds: string[] = [];
const createdBasketIds: string[] = [];
const createdOrderIds: string[] = [];
const createdPhones: string[] = [];

beforeEach(() => {
  mockedNotifyOrderEvent.mockClear();
  mockedNotifyOrderEvent.mockResolvedValue(undefined);
});

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-checkout-notify-${randomUUID()}`, name: "Test Checkout Notify Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdBasketIds.length) await db.basket.deleteMany({ where: { id: { in: createdBasketIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  const normalized = createdPhones
    .map((p) => normalizePhoneNumber(p))
    .filter((r): r is { valid: true; normalized: string } => r.valid)
    .map((r) => r.normalized);
  if (normalized.length) await db.customer.deleteMany({ where: { primaryPhoneNormalized: { in: normalized } } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  const phone = `${firstDigit}${rest}`;
  createdPhones.push(phone);
  return phone;
}

async function createTestVariant() {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-notify-product-${suffix}`, name: `Test Notify Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-NOTIFY-SKU-${suffix}`, priceInPaise: 30000, stockQuantity: 10 },
  });
  return { product, variant };
}

async function createTestBasketWithItem(variantId: string) {
  const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
  createdBasketIds.push(basket.id);
  await db.basketItem.create({ data: { basketId: basket.id, productVariantId: variantId, quantity: 1, priceInPaiseAtAdd: 30000 } });
  return basket;
}

function pickupInput(overrides: Partial<CheckoutInput> = {}): CheckoutInput {
  return {
    customerName: "Notify Test Customer",
    customerMobile: freshTestPhone(),
    whatsappSameAsPrimary: true,
    fulfillmentType: "STORE_PICKUP",
    idempotencyKey: randomUUID(),
    ...overrides,
  };
}

describe("placeOrderForBasket — Order Placed notification wiring", () => {
  it("calls notifyOrderEvent exactly once with ORDER_PLACED and the correct order data", async () => {
    const { variant } = await createTestVariant();
    const basket = await createTestBasketWithItem(variant.id);
    const input = pickupInput();

    const result = await placeOrderForBasket(basket.id, input);
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: result.orderNumber } })).id);

    expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);
    const [orderArg, eventArg] = mockedNotifyOrderEvent.mock.calls[0]!;
    expect(eventArg).toBe("ORDER_PLACED");
    expect(orderArg.orderNumber).toBe(result.orderNumber);
    expect(orderArg.source).toBe("ONLINE");
    expect(orderArg.customerName).toBe(input.customerName);
    expect(orderArg.customerMobile).toBe(input.customerMobile);
  });

  it("does not notify again for an idempotency-key replay of an already-placed order", async () => {
    const { variant } = await createTestVariant();
    const basket = await createTestBasketWithItem(variant.id);
    const input = pickupInput();

    const first = await placeOrderForBasket(basket.id, input);
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: first.orderNumber } })).id);
    expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);

    // Same basket, same idempotency key — the basket is already CONVERTED,
    // so this must return the SAME order without ever calling
    // notifyOrderEvent a second time.
    const second = await placeOrderForBasket(basket.id, input);
    expect(second.success).toBe(true);
    if (second.success) expect(second.alreadyExisted).toBe(true);
    expect(mockedNotifyOrderEvent).toHaveBeenCalledTimes(1);
  });

  it("does not roll back the order when notifyOrderEvent throws (commerce never depends on messaging)", async () => {
    mockedNotifyOrderEvent.mockRejectedValueOnce(new Error("simulated notification service crash"));

    const { variant } = await createTestVariant();
    const basket = await createTestBasketWithItem(variant.id);
    const result = await placeOrderForBasket(basket.id, pickupInput());

    expect(result.success).toBe(true);
    if (!result.success) return;
    const order = await db.order.findUnique({ where: { orderNumber: result.orderNumber } });
    expect(order).not.toBeNull();
    createdOrderIds.push(order!.id);
  });
});
