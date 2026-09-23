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
import { PriceSticker } from "@/components/product/price-sticker";
import { SavingsStamp } from "@/components/product/savings-stamp";
import { STOCK_STATUS_LABEL, STOCK_STATUS_TEXT_CLASS, isOrderable } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { addToBasket } from "@/server/actions/basket";
import type { ProductWithVariants } from "@/types/catalog";


/**
 * The product as its own pack's declaration panel: brand in label caps,
 * the product name, then a ruled NET QTY | MRP table exactly as printed on
 * the back of the pack — with the shop's yellow price sticker slapped on
 * the image. Same shared component behind every category page, /search,
 * and the homepage shelf.
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
        toast.success(`Added ${product.name} (${selectedVariant.size}) to your bag.`);
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
    <div className="group relative flex flex-col bg-card">
      {/* This image link duplicates the product-name link just below,
          which already has a proper accessible name — hidden from
          assistive tech so a screen reader doesn't announce the product
          twice; keyboard/AT users reach it via the named text link. */}
      <Link
        href={`/product/${product.slug}`}
        aria-hidden="true"
        tabIndex={-1}
        className="relative block focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      >
        <ProductThumbnail
          imageUrl={product.imageUrl}
          alt={product.name}
          categorySlug={product.category.slug}
          className="aspect-[5/4] w-full rounded-none"
        />
        {selectedVariant && (
          <PriceSticker
            priceInPaise={selectedVariant.priceInPaise}
            soldOut={!canOrder}
            className="absolute bottom-2 right-2"
          />
        )}
      </Link>

      <div className="flex flex-1 flex-col px-2.5 pb-2.5 pt-2 sm:px-3 sm:pb-3">
        {product.brand && (
          <p className="decl-label truncate text-muted-foreground">{product.brand}</p>
        )}
        <h3 className="mb-2 mt-1 line-clamp-2 text-sm font-semibold leading-snug">
          <Link href={`/product/${product.slug}`} className="hover:underline">
            {product.name}
          </Link>
        </h3>

        {selectedVariant && (
          <dl className="mt-auto grid grid-cols-[3fr_2fr] border border-foreground [&>div]:min-w-0 [&>div]:px-1.5 [&>div]:py-1.5 [&>div+div]:border-l [&>div+div]:border-foreground">
            <div>
              <dt className="decl-label">Net qty</dt>
              <dd className="mt-0.5">
                {hasSizeChoice ? (
                  <Select value={selectedVariantId} onValueChange={(id) => setSelectedVariantId(id as string)}>
                    <SelectTrigger
                      size="sm"
                      aria-label={`Select pack size for ${product.name}`}
                      className="-ml-1 h-6 w-full min-w-0 gap-0.5 rounded-sm border-0 bg-transparent px-1 text-sm font-semibold text-foreground shadow-none hover:bg-muted"
                    >
                      <SelectValue>{selectedVariant.size}</SelectValue>
                    </SelectTrigger>
                    <SelectContent className="store-theme rounded-sm ring-foreground">
                      {sortedVariants.map((variant) => {
                        const orderable = isOrderable(variant.stockStatus);
                        return (
                          <SelectItem key={variant.id} value={variant.id} disabled={!orderable}>
                            {variant.size} · {formatPaise(variant.priceInPaise)}
                            {!orderable && " — Out of stock"}
                          </SelectItem>
                        );
                      })}
                    </SelectContent>
                  </Select>
                ) : (
                  <span className="block text-sm font-semibold leading-tight [overflow-wrap:anywhere] py-0.5">{selectedVariant.size}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="decl-label">MRP</dt>
              <dd className="mt-0.5 truncate text-sm font-semibold tabular-nums leading-6">
                {selectedVariant.mrpInPaise === null ? (
                  <span className="text-muted-foreground">—</span>
                ) : (
                  formatPaise(selectedVariant.mrpInPaise)
                )}
              </dd>
            </div>
          </dl>
        )}

        {selectedVariant && (
          <p className="mt-2 flex min-h-5 flex-wrap items-center justify-between gap-x-2 gap-y-1 text-xs font-semibold leading-4">
            <span className={STOCK_STATUS_TEXT_CLASS[selectedVariant.stockStatus]}>
              {STOCK_STATUS_LABEL[selectedVariant.stockStatus]}
            </span>
            <SavingsStamp priceInPaise={selectedVariant.priceInPaise} mrpInPaise={selectedVariant.mrpInPaise} />
          </p>
        )}

        <button
          type="button"
          aria-label={
            selectedVariant ? `Add ${product.name} (${selectedVariant.size}) to bag` : `Add ${product.name} to bag`
          }
          disabled={!canOrder || isPending}
          onClick={addToBag}
          className={cn(
            "mt-2 flex h-10 w-full items-center justify-center gap-1.5 rounded-sm text-sm font-bold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring active:translate-y-px disabled:pointer-events-none",
            !canOrder
              ? "border border-dashed border-foreground/40 text-muted-foreground"
              : justAdded
                ? "bg-sticker text-sticker-foreground"
                : "bg-primary text-primary-foreground hover:bg-primary/85",
          )}
        >
          {justAdded && <Check className="size-4" aria-hidden />}
          {ctaLabel}
        </button>
      </div>
    </div>
  );
}
