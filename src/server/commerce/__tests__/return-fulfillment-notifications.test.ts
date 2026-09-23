import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Phase 3.6 Part 3 — proves the WIRING between receiveReturnRequest and
// the return-notification service: ITEM_RECEIVED + the type-specific
// completion event both fire, exactly once each, per genuine receive;
// never a second time on a duplicate/losing-concurrent attempt; and a
// notification failure never blocks inventory reconciliation or the
// other (independently try/caught) notification call.
vi.mock("@/server/whatsapp/return-notification-service", () => ({
  notifyReturnEvent: vi.fn().mockResolvedValue(undefined),
}));
import { notifyReturnEvent } from "@/server/whatsapp/return-notification-service";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { createReturnRequest } from "@/server/commerce/returns";

const mockedNotify = vi.mocked(notifyReturnEvent);

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeEach(() => {
  mockedNotify.mockClear();
  mockedNotify.mockResolvedValue(undefined);
});

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-rf-notify-${randomUUID()}`, name: "Test Return Fulfillment Notify Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test RF Notify Admin", email: `test-rf-notify-admin-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
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

async function createTestCustomer() {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-RFN${randomUUID().slice(0, 4).toUpperCase()}`,
      displayName: "RF Notify Customer",
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createVariant(stockQuantity: number) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-rfn-product-${suffix}`, name: `Test RFN Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-RFN-SKU-${suffix}`, priceInPaise: 30000, stockQuantity },
  });
  return { product, variant };
}

async function createApprovedReturn(params: { customerId: string; type: "RETURN" | "EXCHANGE"; fulfillmentType?: "STORE_PICKUP" | "LOCAL_DELIVERY" }) {
  const { product, variant } = await createVariant(10);
  const suffix = randomUUID();
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-RFN-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId: params.customerId,
      customerName: "RF Notify Customer",
      customerMobile: "9800000004",
      fulfillmentType: params.fulfillmentType ?? "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 30000,
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
    customerId: params.customerId,
    orderNumber: order.orderNumber,
    type: params.type,
    items: [{ orderItemId: order.items[0]!.id, quantity: 1, reason: "WRONG_SIZE" }],
  });
  if (!created.success) throw new Error("fixture setup failed: " + JSON.stringify(created));

  const approved = await updateReturnRequestStatus({ returnNumber: created.returnNumber, newStatus: "APPROVED", adminUserId });
  if (!approved.success) throw new Error("fixture approve failed: " + JSON.stringify(approved));

  const request = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber: created.returnNumber }, include: { items: true } });
  mockedNotify.mockClear(); // discard RETURN_REQUESTED + APPROVED calls from setup

  return { order, variant, returnNumber: created.returnNumber, requestItemId: request.items[0]!.id };
}

describe("receiveReturnRequest — RETURN notification wiring", () => {
  it("fires ITEM_RECEIVED then RETURN_COMPLETED, exactly once each, in order", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createApprovedReturn({ customerId: customer.id, type: "RETURN" });

    const result = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(result.success).toBe(true);

    expect(mockedNotify).toHaveBeenCalledTimes(2);
    expect(mockedNotify.mock.calls[0]![1]).toBe("ITEM_RECEIVED");
    expect(mockedNotify.mock.calls[1]![1]).toBe("RETURN_COMPLETED");
    expect(mockedNotify.mock.calls[0]![0].returnNumber).toBe(returnNumber);
    expect(mockedNotify.mock.calls[1]![0].returnNumber).toBe(returnNumber);
  });
});

describe("receiveReturnRequest — EXCHANGE notification wiring", () => {
  it("fires ITEM_RECEIVED then EXCHANGE_COMPLETED, exactly once each", async () => {
    const customer = await createTestCustomer();
    const { returnNumber, requestItemId } = await createApprovedReturn({ customerId: customer.id, type: "EXCHANGE" });
    const { variant: replacement } = await createVariant(5);

    const result = await receiveReturnRequest({
      returnNumber,
      adminUserId,
      replacements: { [requestItemId]: replacement.id },
    });
    expect(result.success).toBe(true);

    expect(mockedNotify).toHaveBeenCalledTimes(2);
    expect(mockedNotify.mock.calls[0]![1]).toBe("ITEM_RECEIVED");
    expect(mockedNotify.mock.calls[1]![1]).toBe("EXCHANGE_COMPLETED");
  });
});

describe("receiveReturnRequest — duplicate prevention (section 8)", () => {
  it("a second (rejected) receive attempt does not notify again", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createApprovedReturn({ customerId: customer.id, type: "RETURN" });

    const first = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(first.success).toBe(true);
    expect(mockedNotify).toHaveBeenCalledTimes(2);

    const second = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(second.success).toBe(false);
    expect(mockedNotify).toHaveBeenCalledTimes(2); // unchanged
  });

  it("exactly one of two concurrent receives notifies (2 calls total, not 4)", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createApprovedReturn({ customerId: customer.id, type: "RETURN" });

    const [a, b] = await Promise.all([
      receiveReturnRequest({ returnNumber, adminUserId }),
      receiveReturnRequest({ returnNumber, adminUserId }),
    ]);

    const successes = [a, b].filter((r) => r.success);
    expect(successes).toHaveLength(1);
    expect(mockedNotify).toHaveBeenCalledTimes(2);
  });
});

describe("receiveReturnRequest — failure handling (section 9)", () => {
  it("inventory reconciliation and status completion succeed even when both notifications throw", async () => {
    mockedNotify.mockRejectedValue(new Error("simulated notification crash"));
    const customer = await createTestCustomer();
    const { returnNumber, variant } = await createApprovedReturn({ customerId: customer.id, type: "RETURN" });

    const result = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(result.success).toBe(true);

    const request = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(request.status).toBe("COMPLETED");
    const updatedVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(updatedVariant.stockQuantity).toBe(11);
    // Both notification attempts were still made independently, despite each rejecting.
    expect(mockedNotify).toHaveBeenCalledTimes(2);
  });

  it("a failure in the FIRST (ITEM_RECEIVED) notification does not prevent the second (COMPLETED) attempt", async () => {
    mockedNotify.mockRejectedValueOnce(new Error("item-received notification crash"));
    const customer = await createTestCustomer();
    const { returnNumber } = await createApprovedReturn({ customerId: customer.id, type: "RETURN" });

    const result = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(result.success).toBe(true);
    expect(mockedNotify).toHaveBeenCalledTimes(2);
    expect(mockedNotify.mock.calls[1]![1]).toBe("RETURN_COMPLETED");
  });
});

describe("receiveReturnRequest — fulfillment context passed through", () => {
  it("passes the order's fulfillmentType through for EXCHANGE_COMPLETED's fulfillment-aware wording", async () => {
    const customer = await createTestCustomer();
    const { returnNumber, requestItemId } = await createApprovedReturn({
      customerId: customer.id,
      type: "EXCHANGE",
      fulfillmentType: "LOCAL_DELIVERY",
    });
    const { variant: replacement } = await createVariant(5);

    await receiveReturnRequest({ returnNumber, adminUserId, replacements: { [requestItemId]: replacement.id } });

    const completedCall = mockedNotify.mock.calls.find((c) => c[1] === "EXCHANGE_COMPLETED");
    expect(completedCall?.[0].fulfillmentType).toBe("LOCAL_DELIVERY");
  });
});
