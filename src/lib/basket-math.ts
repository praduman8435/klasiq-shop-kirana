/**
 * Pure basket/stock decision logic, kept free of DB/cookie IO so it can be
 * unit tested directly. This is where "never trust client stock/price"
 * actually gets enforced — server actions call these with numbers freshly
 * read from the database, never from the request body.
 */
import { isOrderable } from "@/lib/stock";

export type OrderableVariant = {
  id: string;
  sortOrder: number;
  stockQuantity: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
};

/**
 * Computes the new line quantity when adding `requestedQuantity` more of an
 * item to a basket that may already contain `existingQuantity` of it.
 * Always clamped to what's actually in stock and to the per-line cap —
 * never allowed to exceed either, regardless of what was requested.
 */
export function clampAddQuantity(params: {
  existingQuantity: number;
  requestedQuantity: number;
  stockQuantity: number;
  maxPerLine: number;
}): number {
  const { existingQuantity, requestedQuantity, stockQuantity, maxPerLine } = params;
  return Math.max(
    0,
    Math.min(existingQuantity + requestedQuantity, stockQuantity, maxPerLine),
  );
}

/**
 * Clamps a directly-set quantity (e.g. from a basket page stepper) to what's
 * in stock and the per-line cap.
 */
export function clampSetQuantity(params: {
  requestedQuantity: number;
  stockQuantity: number;
  maxPerLine: number;
}): number {
  const { requestedQuantity, stockQuantity, maxPerLine } = params;
  return Math.max(0, Math.min(requestedQuantity, stockQuantity, maxPerLine));
}

/**
 * Picks which variant a "complete set" item should default to when added in
 * bulk — the lowest-sortOrder variant that's actually orderable. Returns
 * undefined if every size is out of stock, so the caller can skip it and
 * tell the parent instead of silently adding something unbuyable.
 */
export function pickDefaultOrderableVariant<T extends OrderableVariant>(
  variants: readonly T[],
): T | undefined {
  return [...variants]
    .sort((a, b) => a.sortOrder - b.sortOrder)
    .find((variant) => variant.stockStatus !== "OUT_OF_STOCK");
}

export type CheckoutBlockingLine = {
  id: string;
  quantity: number;
  productVariant: {
    isActive: boolean;
    stockQuantity: number;
    stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
    size: string;
    product: { name: string; isActive: boolean };
  };
};

export type CheckoutBlockingIssue = {
  id: string;
  label: string;
  reason: string;
};

/**
 * Phase 3.7 Part 5 — the ONE shared definition of "why can't this basket
 * line go to checkout," reused by the Checkout page's blocking view. Part 4
 * already surfaces the same conditions inline in the Bag (see
 * `basket-line-item.tsx`'s `isUnavailable`/`exceedsStock`), but never gated
 * Checkout itself on them — a customer could reach Checkout with such a
 * line and only discover it reactively, from a post-submit STOCK_ISSUE
 * error. This mirrors `isVariantOrderable` (deactivated product/variant,
 * out of stock) plus the quantity-exceeds-stock check, so the checkout page
 * and the Bag page never disagree about what counts as a problem.
 */
export function computeCheckoutBlockingIssues(
  items: readonly CheckoutBlockingLine[],
): CheckoutBlockingIssue[] {
  return items.flatMap((item) => {
    const { productVariant: variant } = item;
    const label = `${variant.product.name} (size ${variant.size})`;

    if (!variant.isActive || !variant.product.isActive || !isOrderable(variant.stockStatus)) {
      return [{ id: item.id, label, reason: "no longer available" }];
    }
    if (item.quantity > variant.stockQuantity) {
      return [
        {
          id: item.id,
          label,
          reason: `only ${variant.stockQuantity} left in stock, but ${item.quantity} ${
            item.quantity === 1 ? "is" : "are"
          } in your bag`,
        },
      ];
    }
    return [];
  });
}
