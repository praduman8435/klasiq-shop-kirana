import type { OrderStatus } from "@prisma/client";
import { RETURN_WINDOW_DAYS } from "@/lib/return-lifecycle";

export type ItemEligibilityError =
  | { type: "ORDER_NOT_DELIVERED" }
  | { type: "RETURN_WINDOW_EXPIRED" }
  | { type: "INSUFFICIENT_QUANTITY"; returnableQuantity: number };

export type ItemEligibilityResult =
  | { eligible: true; returnableQuantity: number }
  | { eligible: false; error: ItemEligibilityError };

/**
 * Pure, DB-free eligibility check — the one place both the future
 * customer-portal UI (Part 2) and the creation logic
 * (src/server/commerce/returns.ts) can ask "is this item currently
 * returnable?" without reimplementing the rule. See
 * docs/PHASE_3_5_REPORT.md "Eligibility" / "Return window".
 *
 * Order-level rules (checked first, apply to every item on the order):
 * - The order must have actually been DELIVERED — `deliveredAt` non-null
 *   is the authoritative signal (not `order.status === "DELIVERED"`
 *   alone, since that's a stricter, redundant check the caller doesn't
 *   need to also pass — see the query layer for how these two facts are
 *   kept trivially consistent: `deliveredAt` is only ever set exactly
 *   when status transitions to DELIVERED).
 * - `now` must be within `RETURN_WINDOW_DAYS` of `deliveredAt` —
 *   inclusive, so a return attempted exactly 7×24h after delivery is
 *   still allowed; one millisecond later is not. `now` must always be a
 *   server-generated timestamp, never client-supplied.
 *
 * Item-level rule: `requestedQuantity` must not exceed what's left after
 * subtracting `claimedQuantity` (the OrderItem's own
 * `returnClaimedQuantity` — see its schema doc comment) from
 * `purchasedQuantity`.
 *
 * `bypassWindowCheck` (Phase 3.5 Part 5, Admin Override) skips ONLY the
 * two time-based checks above (delivered / within window) — the
 * quantity-availability check below is NEVER bypassable, by any caller,
 * under any circumstance. See docs/PHASE_3_5_REPORT.md Part 5 "Admin
 * Override architecture" for why: the time window is a business policy
 * an owner may legitimately want to waive for a specific customer; the
 * remaining-quantity figure is a hard data-integrity fact (how much was
 * genuinely purchased minus what's genuinely already claimed) that no
 * override can make more available than it actually is. This function
 * itself does not decide WHO may pass `bypassWindowCheck: true` — that
 * authorization (an authenticated admin explicitly choosing to override,
 * with a mandatory reason) happens entirely in the caller
 * (`createReturnRequest`); this parameter is honored unconditionally.
 */
export function getItemReturnEligibility(params: {
  deliveredAt: Date | null;
  purchasedQuantity: number;
  claimedQuantity: number;
  requestedQuantity: number;
  now: Date;
  bypassWindowCheck?: boolean;
}): ItemEligibilityResult {
  const { deliveredAt, purchasedQuantity, claimedQuantity, requestedQuantity, now, bypassWindowCheck } = params;

  if (!bypassWindowCheck) {
    if (!deliveredAt) {
      return { eligible: false, error: { type: "ORDER_NOT_DELIVERED" } };
    }

    const windowMs = RETURN_WINDOW_DAYS * 24 * 60 * 60 * 1000;
    if (now.getTime() > deliveredAt.getTime() + windowMs) {
      return { eligible: false, error: { type: "RETURN_WINDOW_EXPIRED" } };
    }
  }

  const returnableQuantity = purchasedQuantity - claimedQuantity;
  if (requestedQuantity > returnableQuantity) {
    return {
      eligible: false,
      error: { type: "INSUFFICIENT_QUANTITY", returnableQuantity: Math.max(0, returnableQuantity) },
    };
  }

  return { eligible: true, returnableQuantity };
}

/**
 * Order-level gate only — used by the query layer to short-circuit before
 * even looking at individual items (e.g. a Store Pickup order that's
 * still PENDING has nothing returnable at all, for any item). Reuses the
 * exact same `deliveredAt`/window logic as the item-level check, applied
 * with a purchasedQuantity of 0 so only the order-level errors can ever
 * surface — never a false INSUFFICIENT_QUANTITY for a check that isn't
 * about any specific item's quantity.
 */
export function getOrderReturnEligibility(params: {
  orderStatus: OrderStatus;
  deliveredAt: Date | null;
  now: Date;
  bypassWindowCheck?: boolean;
}): { eligible: true } | { eligible: false; error: ItemEligibilityError } {
  const result = getItemReturnEligibility({
    deliveredAt: params.deliveredAt,
    purchasedQuantity: 0,
    claimedQuantity: 0,
    requestedQuantity: 0,
    now: params.now,
    bypassWindowCheck: params.bypassWindowCheck,
  });
  if (!result.eligible) return result;
  return { eligible: true };
}
