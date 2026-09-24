"use client";

import { Plus } from "lucide-react";
import { formatPaise } from "@/lib/money";
import type { VariantSearchResult } from "@/components/admin/counter-sale-product-search";

/**
 * One-tap buttons for what the counter sells most (last 30 days, in stock),
 * so the everyday items never need typing. A pick already at its stock
 * limit in the cart is disabled.
 */
export function CounterSaleQuickPicks({
  picks,
  quantityInCart,
  onAdd,
}: {
  picks: VariantSearchResult[];
  quantityInCart: (variantId: string) => number;
  onAdd: (variant: VariantSearchResult) => void;
}) {
  if (picks.length === 0) return null;
  return (
    <div className="mt-3">
      <p className="mb-1.5 text-xs font-medium text-muted-foreground">Quick add · most sold</p>
      <ul className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 sm:flex-wrap sm:overflow-visible">
        {picks.map((pick) => {
          const inCart = quantityInCart(pick.variantId);
          const atLimit = inCart >= pick.stockQuantity;
          return (
            <li key={pick.variantId} className="shrink-0">
              <button
                type="button"
                disabled={atLimit}
                onClick={() => onAdd(pick)}
                className="flex h-11 items-center gap-2 rounded-lg border border-border bg-card px-3 text-left text-sm transition-colors hover:border-primary/60 hover:bg-secondary/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring active:scale-[0.98] disabled:opacity-40"
              >
                <Plus className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="max-w-40 truncate">
                  {pick.productName} <span className="text-muted-foreground">{pick.size}</span>
                </span>
                <span className="shrink-0 font-medium tabular-nums">{formatPaise(pick.priceInPaise)}</span>
                {inCart > 0 && (
                  <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1 text-xs font-semibold text-primary-foreground tabular-nums">
                    {inCart}
                  </span>
                )}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
