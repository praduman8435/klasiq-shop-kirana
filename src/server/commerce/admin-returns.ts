import type { Prisma, ReturnRequestStatus } from "@prisma/client";
import { db } from "@/lib/db";
import { doesReturnStatusClaimQuantity, isValidReturnStatusTransition } from "@/lib/return-lifecycle";
import { RETURN_STATUS_TRANSITION_EVENT } from "@/server/whatsapp/return-notification-events";
import { notifyReturnEvent } from "@/server/whatsapp/return-notification-service";

export type ReturnStatusTransitionError =
  | { type: "NOT_FOUND"; message: string }
  | { type: "INVALID_TRANSITION"; message: string }
  | { type: "MISSING_REJECTION_REASON"; message: string }
  | { type: "CONFLICT"; message: string };

export type ReturnStatusTransitionResult =
  | { success: true; alreadyInState: boolean }
  | { success: false; error: ReturnStatusTransitionError };

class ConcurrencyConflictError extends Error {}

/**
 * Moves a ReturnRequest to `newStatus`, reusing the exact
 * `isValidReturnStatusTransition` rule from Part 1's `return-lifecycle.ts`
 * — this file never duplicates that logic, only calls it. Mirrors
 * `updateOrderStatus`'s (src/server/commerce/update-order-status.ts) two
 * safety properties exactly:
 *
 * 1. Idempotent: already being in `newStatus` is a no-op success, not an
 *    error or a second side effect.
 * 2. Concurrency-safe: the write is a guarded `updateMany({ where: { id,
 *    status: <status we read> } })`, so two admins (or one admin
 *    double-clicking) racing to transition the same request can't both
 *    succeed — the loser gets CONFLICT, not a silently double-applied
 *    approval/completion.
 *
 * No inventory or refund side effect exists on ANY transition THIS
 * function performs. As of Phase 3.5 Part 4, this function deliberately
 * REFUSES "RECEIVED" and "COMPLETED" as a `newStatus` — those two now
 * only ever happen together, atomically, with real inventory
 * reconciliation, via `receiveReturnRequest`
 * (src/server/commerce/return-fulfillment.ts). Letting this bare,
 * inventory-agnostic function also reach RECEIVED would let a request sit
 * in that status with NO stock ever actually restored — exactly the
 * "silently increase stock" (or rather, silently *not* reconcile it) risk
 * section 7 of the Part 4 brief warns against. See
 * docs/PHASE_3_5_REPORT.md Part 4 "Inventory strategy" for the full
 * reasoning. APPROVED is a bare status write, no side effect.
 *
 * REJECTED/CANCELLED DO have one side effect: releasing each affected
 * OrderItem's claimed quantity (`returnClaimedQuantity`), atomically with
 * the status write, in the SAME transaction. This is `doesReturnStatusClaimQuantity`
 * (src/lib/return-lifecycle.ts) made real — that function has always
 * documented "REJECTED/CANCELLED release the claim... returnable again by
 * a future request," but nothing ever actually performed the release
 * until this fix: `createReturnRequest`'s own guarded claim
 * (src/server/commerce/returns.ts) only ever INCREMENTED
 * `returnClaimedQuantity`, with no corresponding decrement anywhere for
 * the two statuses meant to give it back. Left unfixed, a single
 * rejected or cancelled request permanently and silently "burned" that
 * quantity — the customer could never return those units again, through
 * any flow, for the lifetime of the order. See "Bug fix — Return claim
 * release on Reject/Cancel" in docs/PHASE_3_5_REPORT.md for the full
 * audit and fix write-up.
 *
 * REJECTED requires a non-empty `rejectionReason`, persisted so the
 * customer portal can display it (see
 * `src/components/customer-portal/return-history.tsx`).
 *
 * SECURITY: `adminUserId` must already be authorized by the caller (an
 * Admin Server Action resolving `getAdminSession()`) — this function
 * performs no authorization itself, the same caller-resolves-authorization
 * design as `createReturnRequest` (Part 1/2).
 */
export async function updateReturnRequestStatus(params: {
  returnNumber: string;
  newStatus: ReturnRequestStatus;
  adminUserId: string;
  rejectionReason?: string;
}): Promise<ReturnStatusTransitionResult> {
  const { returnNumber, newStatus, adminUserId, rejectionReason } = params;

  if (newStatus === "RECEIVED" || newStatus === "COMPLETED") {
    return {
      success: false,
      error: {
        type: "INVALID_TRANSITION",
        message: "Receiving a return requires the dedicated Receive flow, which reconciles inventory.",
      },
    };
  }

  const request = await db.returnRequest.findUnique({
    where: { returnNumber },
    include: { order: true, items: true },
  });
  if (!request) {
    return { success: false, error: { type: "NOT_FOUND", message: "Return request not found." } };
  }

  if (request.status === newStatus) {
    return { success: true, alreadyInState: true };
  }

  if (!isValidReturnStatusTransition({ from: request.status, to: newStatus })) {
    return {
      success: false,
      error: {
        type: "INVALID_TRANSITION",
        message: `Cannot move a return request from ${request.status} to ${newStatus}.`,
      },
    };
  }

  if (newStatus === "REJECTED" && !rejectionReason?.trim()) {
    return {
      success: false,
      error: { type: "MISSING_REJECTION_REASON", message: "A rejection reason is required." },
    };
  }

  const now = new Date();
  let data: Prisma.ReturnRequestUncheckedUpdateManyInput = { status: newStatus };
  switch (newStatus) {
    case "APPROVED":
      data = { ...data, approvedAt: now, approvedByAdminUserId: adminUserId };
      break;
    case "REJECTED":
      data = {
        ...data,
        rejectedAt: now,
        rejectedByAdminUserId: adminUserId,
        rejectionReason: rejectionReason!.trim(),
      };
      break;
    case "CANCELLED":
      data = { ...data, cancelledAt: now, cancelledByAdminUserId: adminUserId };
      break;
    case "REQUESTED":
      break;
  }

  // Bug fix (see doc comment above) — REJECTED/CANCELLED release every
  // claimed unit this request holds, atomically with the status write,
  // so the OrderItem's own maintained counter never drifts from what
  // `doesReturnStatusClaimQuantity` says should currently be true. Wrapped
  // in a transaction only for these two statuses — APPROVED has no
  // accompanying write, so it keeps the simpler bare `updateMany`.
  const releasesClaim = !doesReturnStatusClaimQuantity(newStatus);
  let updatedCount: number;
  if (releasesClaim) {
    try {
      updatedCount = await db.$transaction(async (tx) => {
        const updated = await tx.returnRequest.updateMany({
          where: { id: request.id, status: request.status },
          data,
        });
        if (updated.count === 0) throw new ConcurrencyConflictError();

        for (const item of request.items) {
          await tx.orderItem.update({
            where: { id: item.orderItemId },
            data: { returnClaimedQuantity: { decrement: item.quantity } },
          });
        }
        return updated.count;
      });
    } catch (err) {
      if (err instanceof ConcurrencyConflictError) {
        updatedCount = 0;
      } else {
        throw err;
      }
    }
  } else {
    const updated = await db.returnRequest.updateMany({
      where: { id: request.id, status: request.status },
      data,
    });
    updatedCount = updated.count;
  }

  if (updatedCount === 0) {
    return {
      success: false,
      error: {
        type: "CONFLICT",
        message: "This request's status changed since you loaded the page. Please refresh.",
      },
    };
  }

  // Phase 3.6 Part 3 section 3/8 — fires only past this point, after the
  // guarded updateMany above has already committed a REAL transition, and
  // the `alreadyInState`/CONFLICT branches above already returned before
  // this line — the identical exactly-once guarantee `updateOrderStatus`
  // established for order notifications in Part 2, reused verbatim. Only
  // APPROVED and REJECTED can ever reach here as `newStatus` — RECEIVED/
  // COMPLETED are refused at the top of this function (their own
  // notifications are wired into `receiveReturnRequest`); CANCELLED/
  // REQUESTED have no mapped event — not in section 2's fixed list.
  const event =
    newStatus === "REJECTED"
      ? "RETURN_REJECTED"
      : newStatus === "APPROVED"
        ? RETURN_STATUS_TRANSITION_EVENT.APPROVED?.[request.type]
        : undefined;
  if (event) {
    try {
      await notifyReturnEvent(
        {
          returnNumber: request.returnNumber,
          returnType: request.type,
          rejectionReason: newStatus === "REJECTED" ? (rejectionReason?.trim() ?? null) : null,
          orderNumber: request.order.orderNumber,
          accessToken: request.order.accessToken,
          fulfillmentType: request.order.fulfillmentType,
          customerName: request.order.customerName,
          customerMobile: request.order.customerMobile,
          customerWhatsapp: request.order.customerWhatsapp,
        },
        event,
      );
    } catch (err) {
      console.error(
        "updateReturnRequestStatus: best-effort notification failed",
        err instanceof Error ? err.message : String(err),
      );
    }
  }

  return { success: true, alreadyInState: false };
}

export type UpdateAdminNoteResult =
  | { success: true }
  | { success: false; error: { type: "NOT_FOUND"; message: string } };

/**
 * Internal-Admin-only free text — never a status change, so no
 * concurrency guard is needed (last write wins, same as any plain note
 * field with no invariant to protect). Never rendered anywhere in the
 * customer portal — see the field's own schema doc comment.
 */
export async function updateReturnRequestAdminNote(params: {
  returnNumber: string;
  adminNote: string;
}): Promise<UpdateAdminNoteResult> {
  const result = await db.returnRequest.updateMany({
    where: { returnNumber: params.returnNumber },
    data: { adminNote: params.adminNote },
  });
  if (result.count === 0) {
    return { success: false, error: { type: "NOT_FOUND", message: "Return request not found." } };
  }
  return { success: true };
}
