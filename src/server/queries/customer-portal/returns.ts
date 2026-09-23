import { db } from "@/lib/db";
import { getOrderReturnEligibility } from "@/lib/return-eligibility";

export type ReturnableItem = {
  orderItemId: string;
  productName: string;
  size: string;
  purchasedQuantity: number;
  claimedQuantity: number;
  returnableQuantity: number;
  eligible: boolean;
};

/**
 * Answers "is this item currently returnable?" for every item on an
 * order, without requiring any UI logic to know the eligibility rule —
 * see docs/PHASE_3_5_REPORT.md "Eligibility". Read-only; never claims
 * quantity or creates anything (that's `createReturnRequest`, src/server/
 * commerce/returns.ts). Intended for a future customer-portal "what can I
 * return" screen (Phase 3.5 Part 2) to render without attempting a
 * mutation just to check eligibility.
 *
 * Scoped to `{ orderNumber, customerId }` in the same query, exactly like
 * `getOrderForAuthenticatedCustomer` (Phase 3.4 Part 2) — an order that
 * exists but belongs to a different customer returns `null`, structurally
 * identical to a nonexistent order number. `customerId` must come from an
 * already-authorized caller (see createReturnRequest's own doc comment).
 */
export async function getReturnableItemsForOrder(
  orderNumber: string,
  customerId: string,
): Promise<ReturnableItem[] | null> {
  const order = await db.order.findFirst({
    where: { orderNumber, customerId },
    include: { items: true },
  });
  if (!order) return null;

  // Order-level gate (delivered + within window) applies identically to
  // every item on the order — checked once here rather than once per
  // item, then combined with each item's own remaining-quantity figure.
  const orderEligible = getOrderReturnEligibility({
    orderStatus: order.status,
    deliveredAt: order.deliveredAt,
    now: new Date(),
  }).eligible;

  return order.items.map((item) => {
    const returnableQuantity = Math.max(0, item.quantity - item.returnClaimedQuantity);
    return {
      orderItemId: item.id,
      productName: item.productName,
      size: item.size,
      purchasedQuantity: item.quantity,
      claimedQuantity: item.returnClaimedQuantity,
      returnableQuantity,
      eligible: orderEligible && returnableQuantity > 0,
    };
  });
}

/**
 * Every ReturnRequest (RETURN or EXCHANGE — Phase 3.5 Part 2 "Return
 * history"/"Exchange history") already created against this order,
 * newest first, with enough of each affected OrderItem's snapshot to
 * display "what was this request about" without a second lookup. Scoped
 * to `{ orderNumber, customerId }` exactly like `getReturnableItemsForOrder`
 * above — the same IDOR-safe shape, `null` for a nonexistent OR
 * not-owned order, indistinguishable either way.
 *
 * Phase 3.5 Part 5 addition: each item's `replacementVariant` (EXCHANGE
 * only, set once received) so a COMPLETED exchange can tell the customer
 * what they're actually getting instead — see docs/PHASE_3_5_REPORT.md
 * Part 5 "Customer history". Deliberately does NOT include
 * `replacementUnitPriceInPaiseSnapshot` in what's rendered — price
 * difference display stays admin-only in this phase (see that same
 * report section for why).
 */
export async function getReturnRequestsForOrder(orderNumber: string, customerId: string) {
  const order = await db.order.findFirst({ where: { orderNumber, customerId }, select: { id: true } });
  if (!order) return null;

  return db.returnRequest.findMany({
    where: { orderId: order.id },
    include: {
      items: {
        include: {
          orderItem: true,
          replacementVariant: { include: { product: { select: { name: true } } } },
        },
      },
    },
    orderBy: { createdAt: "desc" },
  });
}
