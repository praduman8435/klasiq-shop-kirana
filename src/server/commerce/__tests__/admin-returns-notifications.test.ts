import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Phase 3.6 Part 3 — proves the WIRING between updateReturnRequestStatus
// and the return-notification service: the right event fires for the
// right transition + type, exactly once per genuine transition, never for
// CANCELLED, and never blocks the transition on a notification failure.
vi.mock("@/server/whatsapp/return-notification-service", () => ({
  notifyReturnEvent: vi.fn().mockResolvedValue(undefined),
}));
import { notifyReturnEvent } from "@/server/whatsapp/return-notification-service";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
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
    data: { slug: `test-admin-returns-notify-${randomUUID()}`, name: "Test Admin Returns Notify Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test Returns Notify Admin", email: `test-returns-notify-admin-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
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
      customerId: `KLQ-ARN${randomUUID().slice(0, 4).toUpperCase()}`,
      displayName: "Admin Returns Notify Customer",
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createRequestedReturn(params: { customerId: string; type: "RETURN" | "EXCHANGE" }) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-arn-product-${suffix}`, name: `Test ARN Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-ARN-SKU-${suffix}`, priceInPaise: 30000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-ARN-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId: params.customerId,
      customerName: "Admin Returns Notify Customer",
      customerMobile: "9800000003",
      fulfillmentType: "STORE_PICKUP",
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
  mockedNotify.mockClear(); // discard the RETURN_REQUESTED call from creation
  return { order, returnNumber: created.returnNumber };
}

describe("updateReturnRequestStatus — approve notification wiring", () => {
  it("RETURN type approval notifies with RETURN_APPROVED exactly once", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "RETURN" });

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(result.success).toBe(true);
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    const [requestArg, eventArg] = mockedNotify.mock.calls[0]!;
    expect(eventArg).toBe("RETURN_APPROVED");
    expect(requestArg.returnNumber).toBe(returnNumber);
  });

  it("EXCHANGE type approval notifies with EXCHANGE_APPROVED exactly once — a distinct event from RETURN", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "EXCHANGE" });

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(result.success).toBe(true);
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    expect(mockedNotify.mock.calls[0]![1]).toBe("EXCHANGE_APPROVED");
  });
});

describe("updateReturnRequestStatus — reject notification wiring", () => {
  it("notifies with RETURN_REJECTED and passes the rejection reason through", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "RETURN" });

    const result = await updateReturnRequestStatus({
      returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Item shows signs of wear beyond normal use",
    });
    expect(result.success).toBe(true);
    expect(mockedNotify).toHaveBeenCalledTimes(1);
    const [requestArg, eventArg] = mockedNotify.mock.calls[0]!;
    expect(eventArg).toBe("RETURN_REJECTED");
    expect(requestArg.rejectionReason).toBe("Item shows signs of wear beyond normal use");
  });

  it("fires RETURN_REJECTED for an EXCHANGE too — rejection isn't type-split", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "EXCHANGE" });

    const result = await updateReturnRequestStatus({
      returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Not eligible",
    });
    expect(result.success).toBe(true);
    expect(mockedNotify.mock.calls[0]![1]).toBe("RETURN_REJECTED");
  });
});

describe("updateReturnRequestStatus — CANCELLED does not notify", () => {
  it("cancelling a request triggers no notification at all — not in the fixed event list", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "RETURN" });

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "CANCELLED", adminUserId });
    expect(result.success).toBe(true);
    expect(mockedNotify).not.toHaveBeenCalled();
  });
});

describe("updateReturnRequestStatus — duplicate prevention (section 8)", () => {
  it("a repeat call to the same already-approved status does not notify a second time", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "RETURN" });

    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(mockedNotify).toHaveBeenCalledTimes(1);

    const second = await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(second).toEqual({ success: true, alreadyInState: true });
    expect(mockedNotify).toHaveBeenCalledTimes(1);
  });

  it("exactly one of two concurrent approvals notifies — the concurrency-losing call never does", async () => {
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "RETURN" });

    const [a, b] = await Promise.all([
      updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId }),
      updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId }),
    ]);

    const successes = [a, b].filter((r) => r.success && !r.alreadyInState);
    expect(successes).toHaveLength(1);
    expect(mockedNotify).toHaveBeenCalledTimes(1);
  });
});

describe("updateReturnRequestStatus — failure handling (section 9)", () => {
  it("does not affect the request's own status when notifyReturnEvent throws", async () => {
    mockedNotify.mockRejectedValueOnce(new Error("simulated notification crash"));
    const customer = await createTestCustomer();
    const { returnNumber } = await createRequestedReturn({ customerId: customer.id, type: "RETURN" });

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(result.success).toBe(true);

    const updated = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(updated.status).toBe("APPROVED");
  });
});
