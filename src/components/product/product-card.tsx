"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { AddStepper } from "@/components/basket/add-stepper";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { formatPaise } from "@/lib/money";
import { isOrderable } from "@/lib/stock";
import { cn } from "@/lib/utils";
import type { ProductWithVariants } from "@/types/catalog";

/**
 * The quick-commerce product tile: image with a discount badge and the
 * ADD / − n + stepper riding its bottom edge, then pack size, name, and
 * price with the MRP struck through. One component behind the homepage
 * shelves, every category page and /search — in a grid it fills its cell;
 * on a shelf the shelf sets its width.
 */
export function ProductCard({
  product,
  className,
}: {
  product: ProductWithVariants;
  className?: string;
}) {
  const sortedVariants = useMemo(
    () => [...product.variants].sort((a, b) => a.sortOrder - b.sortOrder),
    [product.variants],
  );
  const defaultVariant =
    sortedVariants.find((v) => isOrderable(v.stockStatus)) ?? sortedVariants[0];
  const [selectedVariantId, setSelectedVariantId] = useState(
    defaultVariant?.id,
  );
  const selectedVariant = sortedVariants.find(
    (v) => v.id === selectedVariantId,
  );

  if (!selectedVariant) return null;

  const canOrder = isOrderable(selectedVariant.stockStatus);
  const hasSizeChoice = sortedVariants.length > 1;
  const savingInPaise =
    selectedVariant.mrpInPaise !== null &&
    selectedVariant.mrpInPaise > selectedVariant.priceInPaise
      ? selectedVariant.mrpInPaise - selectedVariant.priceInPaise
      : 0;

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl border border-border bg-card p-2.5 sm:p-3",
        className,
      )}
    >
      <div className="relative">
        {/* Duplicates the name link below (which carries the accessible
            name), so it's hidden from assistive tech. */}
        <Link
          href={`/product/${product.slug}`}
          aria-hidden="true"
          tabIndex={-1}
          className="block overflow-hidden rounded-xl"
        >
          <ProductThumbnail
            imageUrl={product.imageUrl}
            alt={product.name}
            categorySlug={product.category.slug}
            className={cn(
              "aspect-square w-full rounded-xl",
              !canOrder && "opacity-50 grayscale",
            )}
          />
        </Link>
        {savingInPaise > 0 && (
          <span className="absolute left-0 top-0 rounded-br-lg rounded-tl-xl bg-foreground px-1.5 py-1 text-[0.6875rem] font-extrabold leading-none text-background tabular-nums">
            {formatPaise(savingInPaise)} OFF
          </span>
        )}
        <div className="absolute -bottom-3 right-1.5">
          <AddStepper
            productVariantId={selectedVariant.id}
            stockQuantity={selectedVariant.stockQuantity}
            disabled={!canOrder}
            label={`${product.name}, ${selectedVariant.size}`}
          />
        </div>
      </div>

      <div className="relative mt-5 flex min-h-7 items-center">
        {hasSizeChoice ? (
          <>
            <Select
              value={selectedVariantId}
              onValueChange={(id) => setSelectedVariantId(id as string)}
            >
              <SelectTrigger
                size="sm"
                aria-label={`Pack size for ${product.name}`}
                className="h-7 max-w-full cursor-pointer gap-0.5 rounded-md border border-primary/35 bg-brand-soft pl-2 pr-1.5 text-xs font-bold text-foreground shadow-none transition-[border-color,transform] hover:border-primary active:scale-[0.97] data-[popup-open]:border-primary [&>svg]:size-3.5 [&>svg]:text-primary"
              >
                <SelectValue>{selectedVariant.size}</SelectValue>
              </SelectTrigger>
              <SelectContent className="store-theme" alignItemWithTrigger={false} align="start">
                {sortedVariants.map((variant) => {
                  const orderable = isOrderable(variant.stockStatus);
                  return (
                    <SelectItem
                      key={variant.id}
                      value={variant.id}
                      disabled={!orderable}
                    >
                      {variant.size} · {formatPaise(variant.priceInPaise)}
                      {!orderable && " — Out of stock"}
                    </SelectItem>
                  );
                })}
              </SelectContent>
            </Select>
            <span
              className="ml-1.5 truncate text-[0.6875rem] font-medium text-muted-foreground"
              aria-hidden
            >
              {sortedVariants.length} sizes
            </span>
          </>
        ) : (
          <span className="text-xs font-semibold text-muted-foreground">
            {selectedVariant.size}
          </span>
        )}
      </div>

      <h3 className="mt-1 line-clamp-2 text-sm font-semibold leading-5">
        <Link href={`/product/${product.slug}`} className="hover:underline">
          {product.name}
        </Link>
      </h3>
      {product.brand && (
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {product.brand}
        </p>
      )}

      <div className="mt-auto flex items-baseline gap-1.5 pt-2">
        <span className="text-base font-extrabold tabular-nums">
          {formatPaise(selectedVariant.priceInPaise)}
        </span>
        {savingInPaise > 0 && (
          <span className="text-xs text-muted-foreground line-through tabular-nums">
            <span className="sr-only">MRP </span>
            {formatPaise(selectedVariant.mrpInPaise!)}
          </span>
        )}
        {!canOrder && (
          <span className="ml-auto text-xs font-semibold text-destructive">
            Out of stock
          </span>
        )}
      </div>
    </div>
  );
}
