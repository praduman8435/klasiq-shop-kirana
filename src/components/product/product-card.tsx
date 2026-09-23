"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { formatPaise } from "@/lib/money";
import { STOCK_STATUS_LABEL, isOrderable } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { addToBasket } from "@/server/actions/basket";
import type { ProductWithVariants } from "@/types/catalog";

const STOCK_BADGE_CLASS: Record<string, string> = {
  IN_STOCK: "text-emerald-600 dark:text-emerald-400",
  LOW_STOCK: "text-amber-600 dark:text-amber-400",
  OUT_OF_STOCK: "text-muted-foreground line-through",
};

/**
 * Premium retail pass — the previous version leaned on bold weight
 * everywhere (700-weight price, a bordered quantity-stepper-shaped size
 * select, an icon-only Add button) to establish structure, which read as
 * "admin panel" rather than storefront. Hierarchy now comes from size,
 * spacing and color rather than uniform boldness: a medium-weight serif
 * name, a same-row price/size pairing, and one full-width text CTA at the
 * card's own weight class (never louder than the product name above it).
 * Same shared component behind every category page, /search, AND the
 * homepage's "Shop the essentials" rail — one card design system, not a
 * bigger homepage variant and a smaller category one.
 */
export function ProductCard({ product }: { product: ProductWithVariants }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [justAdded, setJustAdded] = useState(false);
  const sortedVariants = useMemo(
    () => [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder),
    [product.variants],
  );
  const defaultVariant =
    sortedVariants.find((v) => isOrderable(v.stockStatus)) ?? sortedVariants[0];

  const [selectedVariantId, setSelectedVariantId] = useState(defaultVariant?.id);
  const selectedVariant = sortedVariants.find((v) => v.id === selectedVariantId);
  const canOrder = selectedVariant ? isOrderable(selectedVariant.stockStatus) : false;
  const hasSizeChoice = sortedVariants.length > 1;

  function addToBag() {
    if (!selectedVariant || !canOrder) return;
    startTransition(async () => {
      const result = await addToBasket({
        productVariantId: selectedVariant.id,
        quantity: 1,
      });
      if (result.success) {
        toast.success(`Added ${product.name} (Size ${selectedVariant.size}) to your bag.`);
        setJustAdded(true);
        // `router.refresh()` re-fetches this route's Server Component tree
        // (needed so the header's bag-count badge — itself a Server
        // Component — picks up the new count). Firing it immediately raced
        // the "Added" visual state: the refresh could remount this card
        // before the customer ever saw it, so the CTA appeared to do
        // nothing. Delaying it until after the "Added" window closes lets
        // the feedback actually be seen first.
        window.setTimeout(() => {
          setJustAdded(false);
          router.refresh();
        }, 1400);
      } else {
        toast.error(result.message ?? "Could not add to bag.");
      }
    });
  }

  if (sortedVariants.length === 0) {
    return null;
  }

  const ctaLabel = !canOrder ? "Out of Stock" : justAdded ? "Added" : isPending ? "Adding..." : "Add to Bag";

  return (
    <div className="group flex flex-col overflow-hidden rounded-xl border border-border/70 bg-card transition-colors hover:border-foreground/15">
      {/* This image link duplicates the product-name link just below,
          which already has a proper accessible name. Rather than give
          both an identical name (a screen reader would announce
          "Product X" twice in a row for one card), this one is hidden
          from assistive tech entirely — sighted mouse/touch users can
          still click the image, keyboard/AT users reach the same
          destination via the named text link. */}
      <Link
        href={`/product/${product.slug}`}
        aria-hidden="true"
        tabIndex={-1}
        className="block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        {/* `bg-card` (not the default `bg-muted`) keeps the image slot on
            the exact same surface as the content below it — the previous
            visible seam between a darker image panel and a lighter
            content panel read as two stacked UI regions rather than one
            considered object. */}
        <ProductThumbnail
          imageUrl={product.imageUrl}
          alt={product.name}
          categorySlug={product.category.slug}
          className="aspect-square w-full rounded-none bg-card transition-transform duration-300 group-hover:scale-[1.03]"
        />
      </Link>

      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <h3 className="line-clamp-1 font-heading text-sm font-medium leading-snug">
          <Link href={`/product/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
        </h3>

        {selectedVariant && (
          <div className="flex items-center justify-between gap-2">
            <span className="text-sm font-medium tabular-nums text-foreground">
              {formatPaise(selectedVariant.priceInPaise)}
            </span>
            {hasSizeChoice && (
              <Select value={selectedVariantId} onValueChange={(id) => setSelectedVariantId(id as string)}>
                <SelectTrigger
                  size="sm"
                  aria-label={`Select size for ${product.name}`}
                  className="h-7 min-w-0 shrink-0 gap-0.5 rounded-md border-0 bg-transparent px-1.5 text-xs font-medium text-foreground shadow-none hover:bg-muted dark:bg-transparent dark:hover:bg-muted/50"
                >
                  <SelectValue>{selectedVariant.size}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  {sortedVariants.map((variant) => {
                    const orderable = isOrderable(variant.stockStatus);
                    return (
                      <SelectItem key={variant.id} value={variant.id} disabled={!orderable}>
                        {variant.size}
                        {!orderable && " — Out of stock"}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            )}
          </div>
        )}

        {selectedVariant && (
          <p className={cn("text-xs font-medium leading-none", STOCK_BADGE_CLASS[selectedVariant.stockStatus])}>
            {STOCK_STATUS_LABEL[selectedVariant.stockStatus]}
          </p>
        )}

        <button
          type="button"
          aria-label={
            selectedVariant ? `Add ${product.name} (Size ${selectedVariant.size}) to bag` : `Add ${product.name} to bag`
          }
          disabled={!canOrder || isPending}
          onClick={addToBag}
          className={cn(
            "mt-1.5 flex h-9 w-full items-center justify-center gap-1.5 rounded-lg text-sm font-medium transition-all active:scale-[0.98] disabled:pointer-events-none",
            !canOrder
              ? "bg-muted text-muted-foreground"
              : justAdded
                ? "bg-emerald-600 text-white"
                : "bg-primary text-primary-foreground hover:bg-primary/90",
          )}
        >
          {justAdded && <Check className="size-3.5" aria-hidden />}
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
