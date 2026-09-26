import { db } from "@/lib/db";
import { KhataError, getKhataTimeline, openKhataItemsOldestFirst, recordCollectionInTransaction } from "@/server/khatabook/quick-khata";

/** How many "I've paid" claims a customer can have waiting at once. */
export const MAX_PENDING_CLAIMS = 3;

async function dueAndPending(customerDbId: string) {
  const [open, pending] = await Promise.all([
    openKhataItemsOldestFirst(db, customerDbId),
    db.khataPaymentClaim.findMany({
      where: { customerId: customerDbId, status: "PENDING" },
      select: { id: true, amountInPaise: true, upiReference: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  return {
    dueInPaise: open.reduce((s, i) => s + i.outstandingInPaise, 0),
    pending,
    pendingInPaise: pending.reduce((s, c) => s + c.amountInPaise, 0),
  };
}

/** Just the amount due, for the Mera Khata tab badge. */
export async function getCustomerKhataDue(customerDbId: string): Promise<number> {
  const open = await openKhataItemsOldestFirst(db, customerDbId);
  return open.reduce((s, i) => s + i.outstandingInPaise, 0);
}

export type CustomerKhata = Awaited<ReturnType<typeof getCustomerKhata>>;

/**
 * Mera Khata: what the customer owes the shop, every udhaar and payment
 * (same running balance the shop sees), payments waiting for the shop to
 * confirm, and any the shop couldn't find in the last two weeks.
 * Payment notes are the shop's own and are not shown to the customer.
 */
export async function getCustomerKhata(customerDbId: string) {
  const [timeline, { pending, pendingInPaise }, rejected] = await Promise.all([
    getKhataTimeline(customerDbId, 60),
    dueAndPending(customerDbId),
    db.khataPaymentClaim.findMany({
      where: { customerId: customerDbId, status: "REJECTED", decidedAt: { gte: new Date(Date.now() - 14 * 86_400_000) } },
      select: { id: true, amountInPaise: true, createdAt: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  return {
    dueInPaise: timeline.dueInPaise,
    dueSince: timeline.dueSince,
    totalCount: timeline.totalCount,
    events: timeline.events.map((e) => ({
      key: e.key,
      type: e.type,
      date: e.date,
      amountInPaise: e.amountInPaise,
      balanceInPaise: e.balanceInPaise,
      note: e.type === "UDHAAR" ? e.note : null,
      orderNumber: e.orderNumber,
      paymentMethod: e.paymentMethod,
    })),
    pending,
    pendingInPaise,
    /** What's still left to pay once the waiting payments are confirmed. */
    payableInPaise: Math.max(0, timeline.dueInPaise - pendingInPaise),
    rejected,
  };
}

export class PaymentClaimError extends Error {}

/** "I've paid ₹X" from Mera Khata. Changes nothing in the khata until the shop confirms. */
export async function createKhataPaymentClaim(params: {
  customerDbId: string;
  amountInPaise: number;
  upiReference?: string | null;
}) {
  const { dueInPaise, pending, pendingInPaise } = await dueAndPending(params.customerDbId);
  if (dueInPaise === 0) throw new PaymentClaimError("Nothing is due on your khata.");
  if (pending.length >= MAX_PENDING_CLAIMS) {
    throw new PaymentClaimError("The shop is still checking your earlier payments. Please wait for them first.");
  }
  const left = dueInPaise - pendingInPaise;
  if (params.amountInPaise > left) {
    throw new PaymentClaimError(
      left > 0 ? `That's more than the ₹${left / 100} left to pay.` : "Your payments already cover everything due.",
    );
  }
  return db.khataPaymentClaim.create({
    data: {
      customerId: params.customerDbId,
      amountInPaise: params.amountInPaise,
      upiReference: params.upiReference?.trim() || null,
    },
    select: { id: true },
  });
}

/** Payments customers say they've made, oldest first, for the shop to check. */
export async function getPendingKhataPaymentClaims(customerDbId?: string) {
  return db.khataPaymentClaim.findMany({
    where: { status: "PENDING", ...(customerDbId ? { customerId: customerDbId } : {}) },
    select: {
      id: true,
      amountInPaise: true,
      upiReference: true,
      createdAt: true,
      customer: { select: { id: true, customerId: true, displayName: true, primaryPhone: true } },
    },
    orderBy: { createdAt: "asc" },
  });
}

/**
 * The shop found the money in its UPI app: record it as a UPI collection
 * (oldest udhaar first, dated when the customer paid) and mark the claim
 * confirmed, in one transaction. A claim can only be decided once.
 */
export async function confirmKhataPaymentClaim(claimId: string, admin: { id: string }) {
  return db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM "khata_payment_claims" WHERE id = ${claimId} FOR UPDATE`;
    if (rows.length === 0) throw new KhataError("Payment not found.");
    if (rows[0].status !== "PENDING") throw new KhataError("This payment was already checked.");

    const claim = await tx.khataPaymentClaim.findUniqueOrThrow({
      where: { id: claimId },
      select: { amountInPaise: true, upiReference: true, createdAt: true, customer: { select: { customerId: true } } },
    });
    const collection = await recordCollectionInTransaction(
      tx,
      {
        customerId: claim.customer.customerId,
        amountInRupees: claim.amountInPaise / 100,
        paymentMethod: "UPI",
        note: claim.upiReference ? `Paid online · UPI ref ${claim.upiReference}` : "Paid online by UPI",
        collectedAt: claim.createdAt,
      },
      admin,
    );
    await tx.khataPaymentClaim.update({
      where: { id: claimId },
      data: { status: "CONFIRMED", decidedAt: new Date(), decidedByAdminUserId: admin.id, collectionId: collection.collectionId },
    });
    return { customerCode: claim.customer.customerId, dueAfterInPaise: collection.dueAfterInPaise };
  });
}

/** The money isn't in the shop's UPI app: nothing changes in the khata. */
export async function rejectKhataPaymentClaim(claimId: string, admin: { id: string }) {
  const claim = await db.khataPaymentClaim.findUnique({
    where: { id: claimId },
    select: { customer: { select: { customerId: true } } },
  });
  if (!claim) throw new KhataError("Payment not found.");
  const updated = await db.khataPaymentClaim.updateMany({
    where: { id: claimId, status: "PENDING" },
    data: { status: "REJECTED", decidedAt: new Date(), decidedByAdminUserId: admin.id },
  });
  if (updated.count === 0) throw new KhataError("This payment was already checked.");
  return { customerCode: claim.customer.customerId };
}
