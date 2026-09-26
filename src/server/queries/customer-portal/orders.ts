import { db } from "@/lib/db";

// A small, single-school shop's realistic order history is nowhere near
// this — a simple capped list, not real pagination, is a deliberate,
// documented simplification for Part 2 (see docs/PHASE_3_4_REPORT.md
// Part 2 "Pagination / scale"), revisitable if a customer's real order
// count ever approaches it.
const CUSTOMER_ORDER_HISTORY_LIMIT = 50;

/**
 * Every genuinely Customer-linked order (ONLINE checkout since Phase 3.3,
 * or a COUNTER sale where the cashier selected/created this same
 * Customer — see docs/PHASE_3_3_REPORT.md "Counter/online identity
 * convergence") — ordered newest first. `customerId` comes from the
 * caller's own already-verified `CustomerSession` (see
 * src/lib/customer-portal/session.ts), never from a client-supplied
 * value — this function has no other way to select whose orders it
 * returns, which is the entire authorization boundary. A guest Counter
 * sale (`customerId: null`) can never match any real customer's id and
 * so never appears here, by construction, not by a separate filter.
 */
/** What an item needs to show its product photo (or category placeholder). */
const ITEM_PRODUCT = {
  product: { select: { imageUrl: true, category: { select: { slug: true } } } },
} as const;

export async function getOrdersForAuthenticatedCustomer(customerId: string) {
  return db.order.findMany({
    where: { customerId },
    include: { items: { orderBy: { id: "asc" }, include: ITEM_PRODUCT } },
    orderBy: { createdAt: "desc" },
    take: CUSTOMER_ORDER_HISTORY_LIMIT,
  });
}

/**
 * A single order, scoped to the authenticated Customer in the SAME query
 * that looks it up — `customerId` is part of the `WHERE` clause itself,
 * not a check applied after an unscoped fetch. A syntactically valid
 * `orderNumber` belonging to a different customer returns `null`,
 * structurally identical to "this order number doesn't exist at all" —
 * the caller (the order-detail page) cannot tell the two apart, and
 * therefore neither can anyone probing it. See docs/PHASE_3_4_REPORT.md
 * Part 2 "Order query security".
 */
export async function getOrderForAuthenticatedCustomer(orderNumber: string, customerId: string) {
  return db.order.findFirst({
    where: { orderNumber, customerId },
    include: { items: { orderBy: { id: "asc" }, include: ITEM_PRODUCT } },
  });
}
