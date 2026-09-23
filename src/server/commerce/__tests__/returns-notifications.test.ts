import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Phase 3.6 Part 3 — proves the WIRING between createReturnRequest and the
// return-notification service: RETURN_REQUESTED fires exactly once per
// genuinely created ReturnRequest, with correct data, and commerce
// survives a notification failure. The service's own internal logic is
// covered separately in src/server/whatsapp/__tests__/return-notification-service.test.ts.
vi.mock("@/server/whatsapp/return-notification-service", () => ({
  notifyReturnEvent: vi.fn().mockResolvedValue(undefined),
}));
import { notifyReturnEvent } from "@/server/whatsapp/return-notification-service";
import { createReturnRequest } from "@/server/commerce/returns";

const mockedNotify = vi.mocked(notifyReturnEvent);

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeEach(() => {
  mockedNotify.mockClear();
  mockedNotify.mockResolvedValue(undefined);
});

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-returns-notify-${randomUUID()}`, name: "Test Returns Notify Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
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

async function createTestCustomer() {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-RN${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName: "Return Notify Customer",
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createDeliveredOrder(customerId: string, source: "ONLINE" | "COUNTER" = "ONLINE") {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-rn-product-${suffix}`, name: `Test RN Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-RN-SKU-${suffix}`, priceInPaise: 30000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-RN-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source,
      customerId,
      customerName: "Return Notify Customer",
      customerMobile: "9800000001",
      customerWhatsapp: "9800000002",
      fulfillmentType: source === "COUNTER" ? "COUNTER_HANDOVER" : "STORE_PICKUP",
      paymentMethod: source === "COUNTER" ? "CASH" : "CASH_ON_DELIVERY",
      paymentStatus: source === "COUNTER" ? "PAID" : "UNPAID",
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
            quantity: 2,
            lineTotalInPaise: 60000,
            effectiveLineTotalInPaise: 60000,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return { order, orderItem: order.items[0]! };
}

describe("createReturnRequest — RETURN_REQUESTED notification wiring", () => {
  it("calls notifyReturnEvent exactly once with RETURN_REQUESTED and correct data", async () => {
    const customer = await createTestCustomer();
    const { order, orderItem } = await createDeliveredOrder(customer.id);

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(mockedNotify).toHaveBeenCalledTimes(1);
    const [requestArg, eventArg] = mockedNotify.mock.calls[0]!;
    expect(eventArg).toBe("RETURN_REQUESTED");
    expect(requestArg.returnNumber).toBe(result.returnNumber);
    expect(requestArg.returnType).toBe("RETURN");
    expect(requestArg.orderNumber).toBe(order.orderNumber);
    expect(requestArg.customerWhatsapp).toBe("9800000002");
  });

  it("fires RETURN_REQUESTED for an EXCHANGE request too, with returnType EXCHANGE", async () => {
    const customer = await createTestCustomer();
    const { order, orderItem } = await createDeliveredOrder(customer.id);

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(true);
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    expect(mockedNotify.mock.calls[0]![0].returnType).toBe("EXCHANGE");
  });

  it("fires a notification for a Counter-linked order too — Part 3 does not exclude by source", async () => {
    const customer = await createTestCustomer();
    const { order, orderItem } = await createDeliveredOrder(customer.id, "COUNTER");

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(result.success).toBe(true);
    expect(mockedNotify).toHaveBeenCalledTimes(1);
  });

  it("does not notify at all when the request fails validation (e.g. insufficient quantity)", async () => {
    const customer = await createTestCustomer();
    const { order, orderItem } = await createDeliveredOrder(customer.id);

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 99, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(false);
    expect(mockedNotify).not.toHaveBeenCalled();
  });

  it("does not roll back the created request when notifyReturnEvent throws", async () => {
    mockedNotify.mockRejectedValueOnce(new Error("simulated notification crash"));
    const customer = await createTestCustomer();
    const { order, orderItem } = await createDeliveredOrder(customer.id);

    const result = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    const created = await db.returnRequest.findUnique({ where: { id: result.returnRequestId } });
    expect(created).not.toBeNull();
    expect(created?.status).toBe("REQUESTED");
  });
});
