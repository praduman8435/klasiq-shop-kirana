import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { createReturnRequest } from "@/server/commerce/returns";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { getReturnableItemsForOrder } from "@/server/queries/customer-portal/returns";

// Bug fix regression suite — see docs/PHASE_3_5_REPORT.md "Bug fix — Return
// claim release on Reject/Cancel" for the full audit.
//
// Root cause: `OrderItem.returnClaimedQuantity` was only ever INCREMENTED
// (at `createReturnRequest` time) — nothing decremented it when a request
// was REJECTED or CANCELLED, even though `doesReturnStatusClaimQuantity`
// (src/lib/return-lifecycle.ts) has always documented that those two
// statuses should release the claim. The practical effect: a rejected or
// cancelled return permanently and silently consumed that quantity,
// making it impossible to ever return those units again through ANY
// flow — admin walk-in or customer portal — for the lifetime of the
// order. Fixed in `updateReturnRequestStatus`
// (src/server/commerce/admin-returns.ts): REJECTED/CANCELLED now
// atomically decrement every affected OrderItem's claim, in the same
// transaction as the status write.
//
// This suite proves BOTH halves explicitly, end to end, via the real
// create -> approve -> receive/complete chain (never a hand-set DB
// fixture for `returnClaimedQuantity`, unlike some of this feature's
// earlier fixture-based tests):
//   1. A genuinely COMPLETED return permanently blocks a second return
//      for the same units (this already worked; now locked in as an
//      explicit regression test so the fix above can never accidentally
//      break it).
//   2. A REJECTED or CANCELLED return releases its claim, so the SAME
//      units become returnable again — the actual bug fix.
//   3. Valid partial returns continue to work exactly as before.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-claim-lifecycle-${randomUUID()}`, name: "Test Claim Lifecycle Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test Claim Lifecycle Admin", email: `test-claim-lifecycle-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
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
      customerId: `KLQ-CL${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

async function createOrderWithItem(quantity: number) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-claim-product-${suffix}`, name: `Test Claim Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-CLAIM-SKU-${suffix}`, priceInPaise: 20000, stockQuantity: 10 },
  });
  const customer = await createTestCustomer(`Claim Test Customer ${suffix.slice(0, 6)}`);
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-CLAIM-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId: customer.id,
      customerName: customer.displayName,
      customerMobile: customer.primaryPhone,
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: "PAID",
      status: "DELIVERED",
      deliveredAt: new Date(),
      subtotalInPaise: 20000 * quantity,
      deliveryFeeInPaise: 0,
      totalInPaise: 20000 * quantity,
      amountReceivedInPaise: 20000 * quantity,
      outstandingInPaise: 0,
      items: {
        create: [
          {
            productId: product.id,
            productVariantId: variant.id,
            productName: product.name,
            size: "M",
            skuSnapshot: variant.sku,
            unitPriceInPaise: 20000,
            quantity,
            lineTotalInPaise: 20000 * quantity,
            effectiveLineTotalInPaise: 20000 * quantity,
          },
        ],
      },
    },
    include: { items: true },
  });
  createdOrderIds.push(order.id);
  return { order, orderItem: order.items[0]!, customer, product, variant };
}

/** Setup helper, not the thing under test — throws on any unexpected
 * failure so call sites stay simple (`await fullyComplete(...)`, no
 * per-step success narrowing needed). */
async function fullyComplete(params: { customerId: string; orderNumber: string; orderItemId: string; quantity: number }) {
  const created = await createReturnRequest({
    customerId: params.customerId,
    orderNumber: params.orderNumber,
    type: "RETURN",
    items: [{ orderItemId: params.orderItemId, quantity: params.quantity, reason: "WRONG_SIZE" }],
  });
  if (!created.success) throw new Error("setup: createReturnRequest failed: " + JSON.stringify(created.error));
  const approved = await updateReturnRequestStatus({
    returnNumber: created.returnNumber,
    newStatus: "APPROVED",
    adminUserId,
  });
  if (!approved.success) throw new Error("setup: approve failed: " + JSON.stringify(approved.error));
  const received = await receiveReturnRequest({ returnNumber: created.returnNumber, adminUserId });
  if (!received.success) throw new Error("setup: receive failed: " + JSON.stringify(received.error));
  return { returnNumber: created.returnNumber };
}

describe("Completed returns permanently block re-returning the same units", () => {
  it("a single fully-completed RETURN blocks a second attempt at the same item", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(1);

    await fullyComplete({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      orderItemId: orderItem.id,
      quantity: 1,
    });

    const eligibility = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(eligibility![0]).toMatchObject({ claimedQuantity: 1, returnableQuantity: 0, eligible: false });

    const secondAttempt = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(secondAttempt.success).toBe(false);
    if (!secondAttempt.success) {
      expect(secondAttempt.error.type).toBe("INSUFFICIENT_QUANTITY");
    }
  });

  it("a single fully-completed EXCHANGE blocks a second attempt at the same item", async () => {
    const { order, orderItem, customer, product } = await createOrderWithItem(1);
    const replacement = await db.productVariant.create({
      data: { productId: product.id, size: "L", sku: `TEST-CLAIM-REPL-${randomUUID()}`, priceInPaise: 22000, stockQuantity: 10 },
    });

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    await updateReturnRequestStatus({ returnNumber: created.returnNumber, newStatus: "APPROVED", adminUserId });
    const requestRow = await db.returnRequest.findUniqueOrThrow({
      where: { returnNumber: created.returnNumber },
      include: { items: true },
    });
    const received = await receiveReturnRequest({
      returnNumber: created.returnNumber,
      adminUserId,
      replacements: { [requestRow.items[0]!.id]: replacement.id },
    });
    expect(received.success).toBe(true);

    const secondAttempt = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(secondAttempt.success).toBe(false);
    if (!secondAttempt.success) expect(secondAttempt.error.type).toBe("INSUFFICIENT_QUANTITY");
  });

  it("two separate completed partial returns that together consume the full quantity block a third attempt", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(2);

    await fullyComplete({ customerId: customer.id, orderNumber: order.orderNumber, orderItemId: orderItem.id, quantity: 1 });

    const midEligibility = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(midEligibility![0]).toMatchObject({ claimedQuantity: 1, returnableQuantity: 1, eligible: true });

    await fullyComplete({ customerId: customer.id, orderNumber: order.orderNumber, orderItemId: orderItem.id, quantity: 1 });

    const finalEligibility = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(finalEligibility![0]).toMatchObject({ claimedQuantity: 2, returnableQuantity: 0, eligible: false });

    const third = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "OTHER" }],
    });
    expect(third.success).toBe(false);
    if (!third.success) expect(third.error.type).toBe("INSUFFICIENT_QUANTITY");
  });
});

describe("Valid partial returns still work", () => {
  it("returning 1 of 2 leaves exactly 1 remaining, still eligible", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(2);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);

    const eligibility = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(eligibility![0]).toMatchObject({ purchasedQuantity: 2, claimedQuantity: 1, returnableQuantity: 1, eligible: true });
  });

  it("a request for MORE than what remains after a partial claim is rejected, not silently truncated", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(2);

    const first = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(first.success).toBe(true);

    const second = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 2, reason: "OTHER" }],
    });
    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error.type).toBe("INSUFFICIENT_QUANTITY");
      if (second.error.type === "INSUFFICIENT_QUANTITY") expect(second.error.returnableQuantity).toBe(1);
    }
  });
});

describe("Bug fix: REJECTED/CANCELLED release the claimed quantity", () => {
  it("rejecting a REQUESTED return releases its claim — the same units become returnable again", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(1);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const beforeReject = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(beforeReject![0]).toMatchObject({ claimedQuantity: 1, returnableQuantity: 0, eligible: false });

    const rejected = await updateReturnRequestStatus({
      returnNumber: created.returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Wrong item selected, customer will resubmit",
    });
    expect(rejected.success).toBe(true);

    const afterReject = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(afterReject![0]).toMatchObject({ claimedQuantity: 0, returnableQuantity: 1, eligible: true });

    const secondAttempt = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(secondAttempt.success).toBe(true);
  });

  it("cancelling a REQUESTED return releases its claim", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(1);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const cancelled = await updateReturnRequestStatus({
      returnNumber: created.returnNumber,
      newStatus: "CANCELLED",
      adminUserId,
    });
    expect(cancelled.success).toBe(true);

    const orderItemAfter = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(orderItemAfter.returnClaimedQuantity).toBe(0);

    const secondAttempt = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(secondAttempt.success).toBe(true);
  });

  it("cancelling an APPROVED (not just REQUESTED) return also releases its claim", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(1);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;
    await updateReturnRequestStatus({ returnNumber: created.returnNumber, newStatus: "APPROVED", adminUserId });

    const cancelled = await updateReturnRequestStatus({
      returnNumber: created.returnNumber,
      newStatus: "CANCELLED",
      adminUserId,
    });
    expect(cancelled.success).toBe(true);

    const orderItemAfter = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(orderItemAfter.returnClaimedQuantity).toBe(0);
  });

  it("rejecting one request never releases a DIFFERENT, still-active request's claim on the same item", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(2);

    const requestA = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(requestA.success).toBe(true);
    const requestB = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "DEFECTIVE" }],
    });
    expect(requestB.success).toBe(true);
    if (!requestA.success || !requestB.success) return;

    const beforeReject = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(beforeReject.returnClaimedQuantity).toBe(2);

    const rejected = await updateReturnRequestStatus({
      returnNumber: requestA.returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Duplicate request",
    });
    expect(rejected.success).toBe(true);

    // Only request A's 1 unit is released — request B's own claimed unit
    // must remain claimed, since B is still REQUESTED (active).
    const afterReject = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(afterReject.returnClaimedQuantity).toBe(1);

    const eligibility = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(eligibility![0]).toMatchObject({ claimedQuantity: 1, returnableQuantity: 1, eligible: true });
  });

  it("rejecting/cancelling is idempotent and releases the claim exactly once, never twice", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(1);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const first = await updateReturnRequestStatus({
      returnNumber: created.returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Test reason",
    });
    expect(first).toMatchObject({ success: true, alreadyInState: false });

    // A second call with the SAME target status is a no-op success, not a
    // second release — the OrderItem must not go negative.
    const second = await updateReturnRequestStatus({
      returnNumber: created.returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Test reason",
    });
    expect(second).toMatchObject({ success: true, alreadyInState: true });

    const orderItemAfter = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(orderItemAfter.returnClaimedQuantity).toBe(0);
  });

  it("two concurrent reject attempts on the same request release the claim exactly once", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(1);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const [first, second] = await Promise.all([
      updateReturnRequestStatus({
        returnNumber: created.returnNumber,
        newStatus: "REJECTED",
        adminUserId,
        rejectionReason: "Concurrent attempt 1",
      }),
      updateReturnRequestStatus({
        returnNumber: created.returnNumber,
        newStatus: "REJECTED",
        adminUserId,
        rejectionReason: "Concurrent attempt 2",
      }),
    ]);

    // Exactly one of the two is the "real" transition; the other is
    // either alreadyInState or a CONFLICT, depending on timing — either
    // way, never a double release.
    const successes = [first, second].filter((r) => r.success);
    expect(successes.length).toBeGreaterThanOrEqual(1);

    const orderItemAfter = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(orderItemAfter.returnClaimedQuantity).toBe(0);
  });

  it("REJECTED status is unaffected for a request that was never approved (REQUESTED -> REJECTED direct path)", async () => {
    const { order, orderItem, customer } = await createOrderWithItem(3);

    const created = await createReturnRequest({
      customerId: customer.id,
      orderNumber: order.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: orderItem.id, quantity: 2, reason: "WRONG_SIZE" }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const beforeReject = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(beforeReject.returnClaimedQuantity).toBe(2);

    await updateReturnRequestStatus({
      returnNumber: created.returnNumber,
      newStatus: "REJECTED",
      adminUserId,
      rejectionReason: "Not eligible after review",
    });

    const afterReject = await db.orderItem.findUniqueOrThrow({ where: { id: orderItem.id } });
    expect(afterReject.returnClaimedQuantity).toBe(0);

    // All 3 units are now returnable again.
    const eligibility = await getReturnableItemsForOrder(order.orderNumber, customer.id);
    expect(eligibility![0]).toMatchObject({ purchasedQuantity: 3, claimedQuantity: 0, returnableQuantity: 3, eligible: true });
  });
});
