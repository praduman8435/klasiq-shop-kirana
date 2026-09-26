import type { FulfillmentType, OrderStatus, PaymentStatus } from "@prisma/client";

/**
 * Explicit order-status lifecycle. Not every status applies to every
 * fulfillment method — a Store Pickup order is never OUT_FOR_DELIVERY, and
 * a Local Delivery order is never READY_FOR_PICKUP. CANCELLED and
 * DELIVERED are terminal: nothing transitions out of them.
 *
 * This only validates transitions; nothing in Phase 2 calls it from a
 * mutating endpoint yet (no admin UI exists). It exists now so Phase 3's
 * admin order-management UI has a correct, tested rule to build on instead
 * of improvising one under deadline pressure.
 */
const BASE_TRANSITIONS: Record<OrderStatus, OrderStatus[]> = {
  PENDING: ["CONFIRMED", "CANCELLED"],
  CONFIRMED: ["PREPARING", "CANCELLED"],
  PREPARING: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY", "CANCELLED"],
  READY_FOR_PICKUP: ["DELIVERED", "CANCELLED"],
  OUT_FOR_DELIVERY: ["DELIVERED", "CANCELLED"],
  DELIVERED: [],
  CANCELLED: [],
};

const FULFILLMENT_ONLY_STATUS: Partial<Record<OrderStatus, FulfillmentType>> = {
  READY_FOR_PICKUP: "STORE_PICKUP",
  OUT_FOR_DELIVERY: "LOCAL_DELIVERY",
};

export function isValidOrderStatusTransition(params: {
  from: OrderStatus;
  to: OrderStatus;
  fulfillmentType: FulfillmentType;
}): boolean {
  const { from, to, fulfillmentType } = params;

  const requiredFulfillment = FULFILLMENT_ONLY_STATUS[to];
  if (requiredFulfillment && requiredFulfillment !== fulfillmentType) {
    return false;
  }

  return BASE_TRANSITIONS[from].includes(to);
}

/** All statuses currently reachable in one step from `from`, for this order's fulfillment method. */
export function nextValidOrderStatuses(params: {
  from: OrderStatus;
  fulfillmentType: FulfillmentType;
}): OrderStatus[] {
  const { from, fulfillmentType } = params;
  return BASE_TRANSITIONS[from].filter((to) => {
    const requiredFulfillment = FULFILLMENT_ONLY_STATUS[to];
    return !requiredFulfillment || requiredFulfillment === fulfillmentType;
  });
}

export function isTerminalOrderStatus(status: OrderStatus): boolean {
  return BASE_TRANSITIONS[status].length === 0;
}

// ---------------------------------------------------------------------------
// Payment status
// ---------------------------------------------------------------------------

/**
 * Deliberately separate from OrderStatus: "confirmed" and "paid" are
 * different facts. COD/pay-at-store orders are created UNPAID and move to
 * PAID only when staff actually collect money — nothing in the order-status
 * lifecycle implies payment.
 */
/**
 * Phase 3.6.5 Part 3 — PARTIALLY_PAID is deliberately terminal here
 * (`[]`), with no other status transitioning into it either: it is
 * reachable ONLY via `createCounterSale`'s own payment computation at
 * order-creation time (`src/lib/payment.ts`), which writes it directly,
 * bypassing this transition table entirely — the exact same precedent
 * `status: "DELIVERED"` already set for Counter Sale's order-status
 * field. This admin-facing mutation (`updatePaymentStatus`) still has no
 * path into or out of PARTIALLY_PAID — Phase 3.6.5 Part 5's
 * `receivePayment` (`src/server/commerce/receive-payment.ts`) is the one
 * OTHER code path allowed to move a partially-paid (or full-credit
 * UNPAID) order toward PAID, and it too writes `paymentStatus` directly
 * via `src/lib/payment.ts`'s own derivation, bypassing this transition
 * table exactly like `createCounterSale` does — see
 * docs/PHASE_3_6_5_REPORT.md Part 3 "Payment lifecycle" and Part 5
 * "Payment status".
 */
const PAYMENT_TRANSITIONS: Record<PaymentStatus, PaymentStatus[]> = {
  UNPAID: ["PAID", "FAILED"],
  PAID: ["REFUNDED"],
  PARTIALLY_PAID: [],
  REFUNDED: [],
  FAILED: ["UNPAID"],
};

export function isValidPaymentStatusTransition(params: {
  from: PaymentStatus;
  to: PaymentStatus;
}): boolean {
  return PAYMENT_TRANSITIONS[params.from].includes(params.to);
}

export function nextValidPaymentStatuses(from: PaymentStatus): PaymentStatus[] {
  return PAYMENT_TRANSITIONS[from];
}

// ---------------------------------------------------------------------------
// Display labels (admin UI)
// ---------------------------------------------------------------------------

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING: "Pending",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparing",
  READY_FOR_PICKUP: "Ready for Pickup",
  OUT_FOR_DELIVERY: "Out for Delivery",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
};

/**
 * Shared status → color mapping, used by BOTH the admin order badge
 * (src/components/admin/order-status-badge.tsx) and the customer portal
 * (src/components/customer-portal/order-card.tsx and the order-
 * detail page) — centralized here rather than duplicated so a status
 * always reads the same way everywhere, and so "can a customer tell a
 * cancelled order apart from a delivered one without opening it" (Phase
 * 3.4 Part 3 audit) is answered by color AND text in exactly one place.
 */
export const ORDER_STATUS_BADGE_CLASS: Record<OrderStatus, string> = {
  PENDING: "bg-muted text-muted-foreground",
  CONFIRMED: "bg-secondary text-secondary-foreground",
  PREPARING: "bg-accent/50 text-accent-foreground",
  READY_FOR_PICKUP: "bg-primary/15 text-primary",
  OUT_FOR_DELIVERY: "bg-primary/15 text-primary",
  DELIVERED: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  CANCELLED: "bg-destructive/10 text-destructive",
};

/** The button label an admin sees for transitioning INTO this status. */
export const ORDER_STATUS_ACTION_LABEL: Record<OrderStatus, string> = {
  PENDING: "Reopen",
  CONFIRMED: "Confirm Order",
  PREPARING: "Start Preparing",
  READY_FOR_PICKUP: "Mark Ready for Pickup",
  OUT_FOR_DELIVERY: "Mark Out for Delivery",
  DELIVERED: "Mark Delivered",
  CANCELLED: "Cancel Order",
};

export const PAYMENT_STATUS_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Unpaid",
  PAID: "Paid",
  PARTIALLY_PAID: "Partially Paid",
  REFUNDED: "Refunded",
  FAILED: "Payment Failed",
};

export const PAYMENT_STATUS_ACTION_LABEL: Record<PaymentStatus, string> = {
  UNPAID: "Mark Unpaid",
  PAID: "Mark Paid",
  PARTIALLY_PAID: "Mark Partially Paid",
  REFUNDED: "Mark Refunded",
  FAILED: "Mark Failed",
};

// ---------------------------------------------------------------------------
// Customer self-cancel (Track Orders)
// ---------------------------------------------------------------------------

/** A customer can cancel their own online order any time before it has
 * left the shop: until it's out for delivery, or, for pickup, until
 * they've collected it. Orders already marked paid go through the shop
 * (money has to be returned by hand). */
const CUSTOMER_CANCELLABLE: OrderStatus[] = ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP"];

export type CustomerCancelCheck = { allowed: true } | { allowed: false; reason: string };

export function checkCustomerCanCancel(order: {
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentStatus: PaymentStatus;
}): CustomerCancelCheck {
  if (order.fulfillmentType === "COUNTER_HANDOVER") {
    return { allowed: false, reason: "Bought at the shop counter, so there's nothing to cancel." };
  }
  if (order.status === "CANCELLED") return { allowed: false, reason: "This order is already cancelled." };
  if (order.status === "DELIVERED") {
    return {
      allowed: false,
      reason: order.fulfillmentType === "STORE_PICKUP" ? "This order has been collected." : "This order has been delivered.",
    };
  }
  if (order.status === "OUT_FOR_DELIVERY") {
    return { allowed: false, reason: "It's already on the way. Call the shop if you don't want it." };
  }
  if (order.paymentStatus === "PAID" || order.paymentStatus === "PARTIALLY_PAID") {
    return { allowed: false, reason: "You've already paid for this order. Call the shop to cancel it." };
  }
  if (!CUSTOMER_CANCELLABLE.includes(order.status)) return { allowed: false, reason: "This order can't be cancelled now." };
  return { allowed: true };
}

/** Reasons offered when a customer cancels (kept short; the shop sees the one picked). */
export const CUSTOMER_CANCEL_REASONS = [
  "Ordered by mistake",
  "Want to change items",
  "Found it somewhere else",
  "Taking too long",
  "Other reason",
] as const;
