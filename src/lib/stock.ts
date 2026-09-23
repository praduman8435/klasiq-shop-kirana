import type { StockStatus } from "@prisma/client";

/**
 * Derives the correct stock status for a given quantity/threshold pair.
 * Used whenever stock quantity changes, so `stockStatus` never drifts out
 * of sync with `stockQuantity`. Staff can still be given a way to force
 * OUT_OF_STOCK ahead of quantity hitting zero (e.g. discontinued item) —
 * that override happens by writing stockStatus directly and is not
 * something this function needs to account for.
 */
export function deriveStockStatus(
  quantity: number,
  lowStockThreshold: number,
): StockStatus {
  if (quantity <= 0) return "OUT_OF_STOCK";
  if (quantity <= lowStockThreshold) return "LOW_STOCK";
  return "IN_STOCK";
}

export function isOrderable(stockStatus: StockStatus): boolean {
  return stockStatus !== "OUT_OF_STOCK";
}

/**
 * Phase 3.7 Part 4 — the ONE shared definition of "can this variant
 * actually be bought right now," reused everywhere that question is
 * asked server-side: `resolveAndDecrementOrderLines`
 * (src/server/commerce/order-core.ts, the checkout-time authority this
 * mirrors exactly) and, since this part, `addToBasket`/
 * `setBasketItemQuantity` (src/server/actions/basket.ts). Before this
 * part, the basket actions only ever checked `isOrderable(stockStatus)`
 * — never `isActive`/`product.isActive` — meaning a variant or product
 * deactivated AFTER being added to a basket (or targeted directly via a
 * tampered Server Action call, bypassing the storefront UI that would
 * normally never expose it) could still have its quantity adjusted as
 * if nothing had changed. `stockStatus` and `isActive` are independent
 * fields (deactivating a variant does not itself flip its stockStatus),
 * so checking stockStatus alone was never sufficient.
 */
export function isVariantOrderable(params: {
  isActive: boolean;
  stockStatus: StockStatus;
  productIsActive: boolean;
}): boolean {
  return params.isActive && params.productIsActive && isOrderable(params.stockStatus);
}

export const STOCK_STATUS_LABEL: Record<StockStatus, string> = {
  IN_STOCK: "In Stock",
  LOW_STOCK: "Low Stock",
  OUT_OF_STOCK: "Out of Stock",
};

/** Shared text-color classes for stock status, used anywhere it's shown
 * inline (inventory rows, counter-sale search results) so the same status
 * always reads the same color. */
export const STOCK_STATUS_TEXT_CLASS: Record<StockStatus, string> = {
  IN_STOCK: "text-emerald-700 dark:text-emerald-400",
  LOW_STOCK: "text-amber-700 dark:text-amber-400",
  OUT_OF_STOCK: "text-destructive",
};
