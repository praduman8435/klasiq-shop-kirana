import type { OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { isValidOrderStatusTransition, isValidPaymentStatusTransition } from "@/lib/order-lifecycle";
import { applyInventoryDelta } from "@/server/commerce/inventory";
import { STATUS_TRANSITION_EVENT } from "@/server/whatsapp/notification-events";
import { notifyOrderEvent } from "@/server/whatsapp/notification-service";

export type OrderTransitionError =
  | { type: "NOT_FOUND"; message: string }
  | { type: "INVALID_TRANSITION"; message: string }
  | { type: "CONFLICT"; message: string };

export type OrderTransitionResult =
  | { success: true; alreadyInState: boolean }
  | { success: false; error: OrderTransitionError };

class ConcurrencyConflictError extends Error {}

/**
 * Moves an order to `newStatus`, reusing the exact Phase 2
 * isValidOrderStatusTransition rule (fulfillment-aware) — this file must
 * never duplicate that logic, only call it. Two safety properties:
 *
 * 1. Idempotent: if the order is already in `newStatus`, this is a no-op
 *    success rather than an error or a second side effect. This is what
 *    makes repeated cancellation requests safe — see below.
 * 2. Concurrency-safe: the actual status write is a guarded
 *    `updateMany({ where: { id, status: <status we read> } })`, so two
 *    admins (or one admin double-clicking) racing to transition the same
 *    order can't both succeed — the loser gets a CONFLICT telling them to
 *    refresh, rather than silently double-applying a side effect.
 *
 * Cancelling restores inventory for every line item, atomically with the
 * status write, in one transaction, and records an InventoryAdjustment
 * (reason: ORDER_CANCELLATION_RESTORE) per item for traceability. Because
 * the status write is idempotent+guarded, a second cancellation attempt on
 * an already-CANCELLED order returns success without touching inventory
 * again — restoration only ever runs on the single transition INTO
 * CANCELLED, never on an already-cancelled order.
 */
export async function updateOrderStatus(params: {
  orderNumber: string;
  newStatus: OrderStatus;
  adminUserId: string;
}): Promise<OrderTransitionResult> {
  const { orderNumber, newStatus, adminUserId } = params;

  const order = await db.order.findUnique({
    where: { orderNumber },
    include: { items: true, school: { select: { name: true } } },
  });
  if (!order) {
    return { success: false, error: { type: "NOT_FOUND", message: "Order not found." } };
  }

  if (order.status === newStatus) {
    return { success: true, alreadyInState: true };
  }

  if (
    !isValidOrderStatusTransition({
      from: order.status,
      to: newStatus,
      fulfillmentType: order.fulfillmentType,
    })
  ) {
    return {
      success: false,
      error: {
        type: "INVALID_TRANSITION",
        message: `Cannot move an order from ${order.status} to ${newStatus}.`,
      },
    };
  }

  try {
    if (newStatus === "CANCELLED") {
      await db.$transaction(async (tx) => {
        const updated = await tx.order.updateMany({
          where: { id: order.id, status: order.status },
          data: { status: "CANCELLED" },
        });
        if (updated.count === 0) throw new ConcurrencyConflictError();

        for (const item of order.items) {
          // Reuses the same guarded primitive every other stock mutation in
          // this codebase goes through (src/server/commerce/inventory.ts) —
          // it re-reads the row AFTER its own atomic increment to log the
          // audit entry, so two orders sharing a variant that get cancelled
          // concurrently each get an accurate previousQuantity/newQuantity
          // rather than one computed from a stale pre-update read. This
          // file previously duplicated that logic inline with its own
          // stale read, which could log a wrong previousQuantity/newQuantity
          // under concurrent cancellations touching the same variant (the
          // stockQuantity column itself was always correct — only the
          // audit trail could drift).
          await applyInventoryDelta(tx, {
            productVariantId: item.productVariantId,
            delta: item.quantity,
            reason: "ORDER_CANCELLATION_RESTORE",
            adminUserId,
            orderId: order.id,
          });
        }
      });
    } else {
      const updated = await db.order.updateMany({
        where: { id: order.id, status: order.status },
        // Stamps deliveredAt the moment this transition actually lands on
        // DELIVERED — see Order.deliveredAt's own doc comment for why
        // this must be its own field, never inferred from updatedAt.
        // Phase 3.5's 7-day return window reads this. A transition INTO
        // any other status leaves it untouched (in particular, moving a
        // DELIVERED order onward — there is no such transition today,
        // since DELIVERED is terminal — would never need to clear it).
        data: { status: newStatus, ...(newStatus === "DELIVERED" ? { deliveredAt: new Date() } : {}) },
      });
      if (updated.count === 0) throw new ConcurrencyConflictError();
    }
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      return {
        success: false,
        error: {
          type: "CONFLICT",
          message: "This order's status changed since you loaded the page. Please refresh.",
        },
      };
    }
    throw err;
  }

  // Phase 3.6 Part 2 section 14 — the customer notification automatically
  // follows a successful status transition; there is no separate "Send
  // Message" action anywhere in the admin UI. Fires only past this point
  // (never inside the try block above) — section 8: only after the
  // authoritative transaction has actually committed. `alreadyInState`
  // is never true here (that branch already returned above, at line 57),
  // so this line is reached at most once per genuine transition into
  // `newStatus` — the exact same guarded-`updateMany` concurrency check
  // that makes the transition itself safe also makes this notification
  // exactly-once (see docs/PHASE_3_6_REPORT.md Part 2 "Duplicate
  // prevention"): a losing concurrent call gets CONFLICT above and never
  // reaches this line at all. `CANCELLED` and every other status not in
  // `STATUS_TRANSITION_EVENT` (PENDING, OUT_FOR_DELIVERY) has no mapped
  // event and is silently skipped — not in section 4's fixed event list.
  const event = STATUS_TRANSITION_EVENT[newStatus];
  if (event) {
    // `notifyOrderEvent` never throws (catches internally), but this call
    // is ALSO wrapped here in its own try/catch — defense in depth: the
    // order's status has already genuinely changed at this point, and
    // must stay changed regardless of any hypothetical future bug in the
    // service's own "never throws" guarantee. See "Failure handling" in
    // docs/PHASE_3_6_REPORT.md Part 2.
    try {
      await notifyOrderEvent(
        {
          orderNumber: order.orderNumber,
          accessToken: order.accessToken,
          source: order.source,
          fulfillmentType: order.fulfillmentType,
          customerName: order.customerName,
          customerMobile: order.customerMobile,
          customerWhatsapp: order.customerWhatsapp,
          schoolName: order.school?.name ?? null,
        },
        event,
      );
    } catch (err) {
      console.error(
        "updateOrderStatus: best-effort status-change notification failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { success: true, alreadyInState: false };
}

export type PaymentTransitionResult =
  | { success: true; alreadyInState: boolean }
  | { success: false; error: OrderTransitionError };

/** Same idempotent + concurrency-guarded shape as updateOrderStatus, for the independent payment-status lifecycle. */
export async function updatePaymentStatus(params: {
  orderNumber: string;
  newPaymentStatus: PaymentStatus;
}): Promise<PaymentTransitionResult> {
  const { orderNumber, newPaymentStatus } = params;

  const order = await db.order.findUnique({ where: { orderNumber } });
  if (!order) {
    return { success: false, error: { type: "NOT_FOUND", message: "Order not found." } };
  }

  if (order.paymentStatus === newPaymentStatus) {
    return { success: true, alreadyInState: true };
  }

  if (!isValidPaymentStatusTransition({ from: order.paymentStatus, to: newPaymentStatus })) {
    return {
      success: false,
      error: {
        type: "INVALID_TRANSITION",
        message: `Cannot move payment status from ${order.paymentStatus} to ${newPaymentStatus}.`,
      },
    };
  }

  // A cancelled order can still move an existing PAID balance to REFUNDED,
  // but it must never be freshly marked PAID after the fact — there's
  // nothing left to collect payment for. Found via manual verification
  // (an admin could otherwise "Mark Paid" a cancelled order), not
  // anticipated up front — see docs/PHASE_3_REPORT.md.
  if (order.status === "CANCELLED" && newPaymentStatus === "PAID") {
    return {
      success: false,
      error: {
        type: "INVALID_TRANSITION",
        message: "This order is cancelled — it can't be marked paid.",
      },
    };
  }

  const updated = await db.order.updateMany({
    where: { id: order.id, paymentStatus: order.paymentStatus },
    data: { paymentStatus: newPaymentStatus },
  });
  if (updated.count === 0) {
    return {
      success: false,
      error: {
        type: "CONFLICT",
        message: "This order's payment status changed since you loaded the page. Please refresh.",
      },
    };
  }

  return { success: true, alreadyInState: false };
}
