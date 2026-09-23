import type { ReturnReason, ReturnRequestStatus } from "@prisma/client";

/**
 * Centralized so no page/query ever scatters this number inline — see
 * docs/PHASE_3_5_REPORT.md "Return window". A calendar-day boundary
 * measured against `Order.deliveredAt` (never `updatedAt`, never
 * `createdAt`) using server timestamps only — the browser never supplies
 * or influences this value.
 */
export const RETURN_WINDOW_DAYS = 7;

/**
 * Mirrors src/lib/order-lifecycle.ts's own shape exactly — a transition
 * table plus pure validators, existing now so Phase 3.5 Part 2/3's
 * mutating endpoints (customer cancel, admin approve/reject/receive/
 * complete) have a correct, already-tested rule to call rather than
 * improvising one later. Nothing in Part 1 calls
 * `isValidReturnStatusTransition` from a mutating path yet — creation
 * only ever produces a REQUESTED row (see src/server/commerce/returns.ts).
 *
 * REQUESTED -> APPROVED | REJECTED | CANCELLED (customer can still back
 *   out before staff acts; staff can approve or reject).
 * APPROVED -> RECEIVED | CANCELLED (customer can still cancel before
 *   actually returning the item; staff marks it RECEIVED once the
 *   physical item is back).
 * RECEIVED -> COMPLETED (refund/exchange actually processed — Part 5).
 * REJECTED, COMPLETED, CANCELLED are terminal — nothing transitions out.
 */
const RETURN_STATUS_TRANSITIONS: Record<ReturnRequestStatus, ReturnRequestStatus[]> = {
  REQUESTED: ["APPROVED", "REJECTED", "CANCELLED"],
  APPROVED: ["RECEIVED", "CANCELLED"],
  REJECTED: [],
  RECEIVED: ["COMPLETED"],
  COMPLETED: [],
  CANCELLED: [],
};

export function isValidReturnStatusTransition(params: {
  from: ReturnRequestStatus;
  to: ReturnRequestStatus;
}): boolean {
  return RETURN_STATUS_TRANSITIONS[params.from].includes(params.to);
}

export function nextValidReturnStatuses(from: ReturnRequestStatus): ReturnRequestStatus[] {
  return RETURN_STATUS_TRANSITIONS[from];
}

export function isTerminalReturnStatus(status: ReturnRequestStatus): boolean {
  return RETURN_STATUS_TRANSITIONS[status].length === 0;
}

/**
 * Whether a ReturnRequestItem's quantity should still count as "claimed"
 * (i.e. unavailable for a NEW return request) given its parent request's
 * current status. REQUESTED/APPROVED/RECEIVED/COMPLETED all represent an
 * active-or-fulfilled return — the quantity is genuinely gone from what
 * the customer could return again. REJECTED/CANCELLED release the claim
 * — that quantity becomes returnable again by a future request. See
 * `OrderItem.returnClaimedQuantity`'s own doc comment (schema.prisma) for
 * how this is enforced concurrency-safely at write time; this function is
 * the single source of truth for the READ-side rule both today's
 * eligibility check and Part 3's future reject/cancel mutation must agree
 * on.
 */
export function doesReturnStatusClaimQuantity(status: ReturnRequestStatus): boolean {
  return status !== "REJECTED" && status !== "CANCELLED";
}

export const RETURN_REQUEST_STATUS_LABEL: Record<ReturnRequestStatus, string> = {
  REQUESTED: "Requested",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  RECEIVED: "Received",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/**
 * Shared status → color mapping, used by BOTH the customer portal
 * (`src/components/customer-portal/return-history.tsx`) and the admin
 * Returns module (Phase 3.5 Part 3) — centralized here, exactly mirroring
 * `ORDER_STATUS_BADGE_CLASS`'s own precedent (`src/lib/order-lifecycle.ts`),
 * so a status reads the same color everywhere and no page defines its own
 * competing map. `OrderStatus` and `ReturnRequestStatus` share no values,
 * so this is intentionally its own `Record`, not a reuse of the order map.
 */
export const RETURN_REQUEST_STATUS_BADGE_CLASS: Record<ReturnRequestStatus, string> = {
  REQUESTED: "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200",
  APPROVED: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  REJECTED: "bg-red-100 text-red-900 dark:bg-red-950 dark:text-red-200",
  RECEIVED: "bg-blue-100 text-blue-900 dark:bg-blue-950 dark:text-blue-200",
  COMPLETED: "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200",
  CANCELLED: "bg-muted text-muted-foreground",
};

/** The button label an admin sees for transitioning INTO this status. */
export const RETURN_REQUEST_STATUS_ACTION_LABEL: Record<ReturnRequestStatus, string> = {
  REQUESTED: "Reopen",
  APPROVED: "Approve",
  REJECTED: "Reject",
  RECEIVED: "Mark Received",
  COMPLETED: "Complete",
  CANCELLED: "Cancel Request",
};

/** Centralized per the brief's explicit "future localization should be
 * possible" instruction — one Record to translate, never a string
 * scattered across pages. */
export const RETURN_REASON_LABEL: Record<ReturnReason, string> = {
  WRONG_SIZE: "Wrong Pack Size",
  DEFECTIVE: "Defective",
  DAMAGED: "Damaged",
  WRONG_PRODUCT: "Wrong Product",
  QUALITY_ISSUE: "Quality Issue",
  CHANGED_MIND: "Changed Mind",
  OTHER: "Other",
};
