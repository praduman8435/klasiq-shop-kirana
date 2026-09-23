import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { updateReturnRequestAdminNote, updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { createReturnRequest } from "@/server/commerce/returns";
import { getReturnRequestsForOrder } from "@/server/queries/customer-portal/returns";

// Real Postgres integration tests — concurrency safety and transition
// validation are properties of the actual guarded SQL, never provable
// against a mocked array. Mirrors src/server/commerce/__tests__/returns.test.ts
// (Part 1/2) and update-order-status.test.ts's own fixture shape.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-admin-returns-${randomUUID()}`, name: "Test Admin Returns Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: {
      name: "Test Returns Admin",
      email: `test-returns-admin-${randomUUID()}@example.com`,
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
      customerId: `KLQ-AR${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createReturnableOrder(params: { customerId: string; source?: "ONLINE" | "COUNTER" }) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-admin-returns-product-${suffix}`, name: `Test Admin Returns ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-ADMIN-RET-SKU-${suffix}`, priceInPaise: 30000, stockQuantity: 10 },
  });
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-ADMRET-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: params.source ?? "ONLINE",
      customerId: params.customerId,
      customerName: "Test Admin Returns Customer",
      customerMobile: "9800000000",
      fulfillmentType: params.source === "COUNTER" ? "COUNTER_HANDOVER" : "STORE_PICKUP",
      paymentMethod: params.source === "COUNTER" ? "CASH" : "CASH_ON_DELIVERY",
      paymentStatus: params.source === "COUNTER" ? "PAID" : "UNPAID",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 30000 * 3,
      deliveryFeeInPaise: 0,
      totalInPaise: 30000 * 3,
      amountReceivedInPaise: 30000 * 3,
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
            quantity: 3,
            lineTotalInPaise: 30000 * 3,
            effectiveLineTotalInPaise: 30000 * 3,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return { order, orderItem: order.items[0]! };
}

async function createTestReturnRequest(customerId: string, source?: "ONLINE" | "COUNTER") {
  const { order, orderItem } = await createReturnableOrder({ customerId, source });
  const created = await createReturnRequest({
    customerId,
    orderNumber: order.orderNumber,
    type: "RETURN",
    items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
  });
  if (!created.success) throw new Error("fixture setup failed: " + JSON.stringify(created));
  return { order, orderItem, returnNumber: created.returnNumber };
}

describe("updateReturnRequestStatus — approve", () => {
  it("moves REQUESTED to APPROVED and stamps the acting admin + timestamp", async () => {
    const customer = await createTestCustomer("Approve Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(result).toEqual({ success: true, alreadyInState: false });

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("APPROVED");
    expect(row.approvedByAdminUserId).toBe(adminUserId);
    expect(row.approvedAt).not.toBeNull();
  });

  it("is idempotent — re-approving an already-APPROVED request is a no-op success", async () => {
    const customer = await createTestCustomer("Idempotent Approve Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    const firstApprovedAt = (await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } })).approvedAt;

    const second = await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(second).toEqual({ success: true, alreadyInState: true });

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.approvedAt?.getTime()).toBe(firstApprovedAt?.getTime());
  });
});

describe("updateReturnRequestStatus — reject", () => {
  it("requires a non-empty rejection reason", async () => {
    const customer = await createTestCustomer("Missing Reason Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "REJECTED", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("MISSING_REJECTION_REASON");
  });

  it("rejects with a persisted reason, visible on the row", async () => {
    const customer = await createTestCustomer("Reject Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    const result = await updateReturnRequestStatus({
      returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Item shows signs of wear",
    });
    expect(result).toEqual({ success: true, alreadyInState: false });

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("REJECTED");
    expect(row.rejectionReason).toBe("Item shows signs of wear");
    expect(row.rejectedByAdminUserId).toBe(adminUserId);
    expect(row.rejectedAt).not.toBeNull();
  });
});

describe("updateReturnRequestStatus — RECEIVED/COMPLETED are refused (Phase 3.5 Part 4)", () => {
  it("refuses a bare transition to RECEIVED — inventory reconciliation must go through receiveReturnRequest instead", async () => {
    const customer = await createTestCustomer("Bare Receive Refused Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);
    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "RECEIVED", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("APPROVED");
  });

  it("refuses a bare transition to COMPLETED", async () => {
    const customer = await createTestCustomer("Bare Complete Refused Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);
    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "COMPLETED", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });
});

describe("updateReturnRequestStatus — terminal state after receiveReturnRequest", () => {
  it("rejects a further transition once a request has been received+completed via the real Receive flow", async () => {
    const customer = await createTestCustomer("Terminal Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);
    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    const received = await receiveReturnRequest({ returnNumber, adminUserId });
    expect(received.success).toBe(true);

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("COMPLETED");

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "CANCELLED", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });
});

describe("updateReturnRequestStatus — cancel", () => {
  it("cancels directly from REQUESTED", async () => {
    const customer = await createTestCustomer("Cancel From Requested Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "CANCELLED", adminUserId });
    expect(result).toEqual({ success: true, alreadyInState: false });

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("CANCELLED");
    expect(row.cancelledByAdminUserId).toBe(adminUserId);
    expect(row.cancelledAt).not.toBeNull();
  });

  it("cancels from APPROVED", async () => {
    const customer = await createTestCustomer("Cancel From Approved Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);
    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "CANCELLED", adminUserId });
    expect(result.success).toBe(true);
  });
});

describe("updateReturnRequestStatus — invalid transitions and not-found", () => {
  it("rejects skipping straight from REQUESTED to RECEIVED", async () => {
    const customer = await createTestCustomer("Skip Transition Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "RECEIVED", adminUserId });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_TRANSITION");
  });

  it("returns NOT_FOUND for a nonexistent return number", async () => {
    const result = await updateReturnRequestStatus({
      returnNumber: "RET-DOES-NOT-EXIST-9999",
      newStatus: "APPROVED",
      adminUserId,
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
  });
});

describe("updateReturnRequestStatus — concurrency", () => {
  it("prevents two simultaneous approvals — only one succeeds", async () => {
    const customer = await createTestCustomer("Concurrent Approve Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    const [a, b] = await Promise.all([
      updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId }),
      updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId }),
    ]);

    const successes = [a, b].filter((r) => r.success && !r.alreadyInState);
    const conflicts = [a, b].filter((r) => !r.success);
    // Exactly one genuinely transitions; the other either loses the race
    // (CONFLICT) or is idempotent-successful — never two real transitions.
    expect(successes.length).toBe(1);
    expect(successes.length + conflicts.length).toBeGreaterThanOrEqual(1);

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.status).toBe("APPROVED");
  });

  // "Two simultaneous completions" (section 19, Phase 3.5 Part 3) is now
  // covered as "two simultaneous receives" in
  // src/server/commerce/__tests__/return-fulfillment.test.ts (Phase 3.5
  // Part 4) — COMPLETED is no longer independently reachable at all (see
  // the "RECEIVED/COMPLETED are refused" describe block above), so a bare
  // concurrent-COMPLETED race through this function can no longer occur.
});

describe("updateReturnRequestStatus — Counter-linked purchase", () => {
  it("manages a return request from a customer-linked Counter purchase identically to Online", async () => {
    const customer = await createTestCustomer("Admin Counter Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id, "COUNTER");

    const result = await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });
    expect(result.success).toBe(true);
  });
});

describe("updateReturnRequestStatus — customer portal sync", () => {
  it("an admin approval is immediately visible through the customer's own history query", async () => {
    const customer = await createTestCustomer("Portal Sync Customer");
    const { order, returnNumber } = await createTestReturnRequest(customer.id);

    await updateReturnRequestStatus({ returnNumber, newStatus: "APPROVED", adminUserId });

    const history = await getReturnRequestsForOrder(order.orderNumber, customer.id);
    expect(history).not.toBeNull();
    const entry = history!.find((r) => r.returnNumber === returnNumber);
    expect(entry?.status).toBe("APPROVED");
  });
});

describe("updateReturnRequestAdminNote", () => {
  it("persists an internal note", async () => {
    const customer = await createTestCustomer("Admin Note Customer");
    const { returnNumber } = await createTestReturnRequest(customer.id);

    const result = await updateReturnRequestAdminNote({ returnNumber, adminNote: "Customer called to confirm." });
    expect(result).toEqual({ success: true });

    const row = await db.returnRequest.findUniqueOrThrow({ where: { returnNumber } });
    expect(row.adminNote).toBe("Customer called to confirm.");
  });

  it("returns NOT_FOUND for a nonexistent return number", async () => {
    const result = await updateReturnRequestAdminNote({
      returnNumber: "RET-DOES-NOT-EXIST-9999",
      adminNote: "irrelevant",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
  });
});
