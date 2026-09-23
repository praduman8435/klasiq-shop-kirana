"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Minus, Plus, Trash2 } from "lucide-react";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { formatPaise } from "@/lib/money";
import { STOCK_STATUS_LABEL } from "@/lib/stock";
import {
  addToBasket,
  removeBasketItem,
  setBasketItemQuantity,
} from "@/server/actions/basket";

export type BasketLineItemData = {
  id: string;
  quantity: number;
  priceInPaiseAtAdd: number;
  productVariant: {
    id: string;
    size: string;
    priceInPaise: number;
    stockQuantity: number;
    stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
    isActive: boolean;
    product: {
      name: string;
      imageUrl: string | null;
      categorySlugForPlaceholder: string;
      isActive: boolean;
      // Only ever set for a school-exclusive product (`getBasket()`
      // already queries it) — never fabricated for a generic item, and
      // never a class/gender guess: a `BasketItem` has no class/gender
      // field of its own (a product can be assigned to several classes
      // and both genders), so there's no single correct value to show
      // for either here.
      school: { name: string } | null;
    };
  };
};

export function BasketLineItem({ item }: { item: BasketLineItemData }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const { productVariant, quantity } = item;
  // Phase 3.7 Part 4 — Scenarios C/D: a variant or product deactivated
  // AFTER this line was added previously showed nothing more alarming
  // than a generic "Out of Stock" label (or, if stockStatus itself
  // hadn't changed, no indication at all — stockStatus and isActive are
  // independent fields). This is the one place the Bag tells the
  // customer WHY something changed, matching section 12's explicit
  // "do not silently change a customer's order."
  const isUnavailable =
    !productVariant.isActive || !productVariant.product.isActive || productVariant.stockStatus === "OUT_OF_STOCK";
  // Scenario A: stock dropped below what's already in this line (e.g.
  // added 3, now only 1 left) — distinct from full unavailability, and
  // distinct from the generic LOW_STOCK label, which says nothing about
  // whether THIS quantity specifically still fits.
  const exceedsStock = !isUnavailable && quantity > productVariant.stockQuantity;
  const priceChanged = !isUnavailable && productVariant.priceInPaise !== item.priceInPaiseAtAdd;

  function updateQuantity(nextQuantity: number) {
    startTransition(async () => {
      const result = await setBasketItemQuantity({
        basketItemId: item.id,
        quantity: nextQuantity,
      });
      if (!result.success) {
        toast.error(result.message ?? "Could not update quantity.");
      } else if (result.message) {
        toast.info(result.message);
      }
      router.refresh();
    });
  }

  function remove() {
    startTransition(async () => {
      const result = await removeBasketItem({ basketItemId: item.id });
      if (!result.success) {
        toast.error(result.message ?? "Could not remove item.");
        router.refresh();
        return;
      }
      router.refresh();
      // A single-tap, icon-only destructive action deserves the same
      // recoverability every other line-item state on this component
      // already gets (unavailable/exceeds-stock/price-changed messaging)
      // — re-adding via the same `addToBasket` action a customer already
      // used to put it there re-validates price/stock fresh, exactly as
      // it would for a brand-new add.
      toast(`Removed ${productVariant.product.name} (Size ${productVariant.size}).`, {
        action: {
          label: "Undo",
          onClick: () => {
            startTransition(async () => {
              const undoResult = await addToBasket({
                productVariantId: productVariant.id,
                quantity,
              });
              if (!undoResult.success) {
                toast.error(undoResult.message ?? "Could not restore item.");
              }
              router.refresh();
            });
          },
        },
      });
    });
  }

  return (
    // Major redesign — this row previously read as an oversized card
    // component (80px image, 44px controls, `py-4` rhythm) rather than a
    // dense commerce cart line. Every dimension below is now sized to
    // the brief's own compact-consumer-app spec (64px image, 36px
    // stepper, 32px remove button, `py-3` rhythm), not the site's
    // generic "everything gets comfortable 44px+ touch targets" default
    // — touch comfort here comes from generous hit-padding on small
    // visible controls, not from making the controls themselves large.
    <li className="flex gap-3 py-3">
      <ProductThumbnail
        imageUrl={productVariant.product.imageUrl}
        alt={productVariant.product.name}
        categorySlug={productVariant.product.categorySlugForPlaceholder}
        className="size-16 shrink-0"
      />

      {/* `min-w-0` — the same flex `min-width: auto` default that caused
          the PDP's size selector and product-card Add button to overflow
          their containers (see those components' own comments): without
          it, this column refuses to shrink below its content's natural
          width, spilling ~1px past the viewport at the narrowest tested
          width (272px). */}
      <div className="flex min-w-0 flex-1 flex-col justify-between">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="font-medium leading-tight">
              {productVariant.product.name}
            </p>
            {productVariant.product.school && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {productVariant.product.school.name}
              </p>
            )}
            <p className="text-sm text-muted-foreground">
              Size {productVariant.size}
            </p>
            {isUnavailable ? (
              <p className="mt-0.5 text-xs font-medium text-destructive">
                This item is no longer available. Please remove it from your bag.
              </p>
            ) : exceedsStock ? (
              <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                Only {productVariant.stockQuantity} available — please reduce the quantity.
              </p>
            ) : (
              productVariant.stockStatus !== "IN_STOCK" && (
                <p className="text-xs font-medium text-amber-700 dark:text-amber-400">
                  {STOCK_STATUS_LABEL[productVariant.stockStatus]}
                </p>
              )
            )}
            {priceChanged && (
              <p className="mt-0.5 text-xs font-medium text-amber-700 dark:text-amber-400">
                Price updated from {formatPaise(item.priceInPaiseAtAdd)} to{" "}
                {formatPaise(productVariant.priceInPaise)}.
              </p>
            )}
          </div>
          <button
            type="button"
            aria-label={`Remove ${productVariant.product.name}, size ${productVariant.size}, from bag`}
            disabled={isPending}
            onClick={remove}
            className="flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-destructive focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-40"
          >
            <Trash2 className="size-3.5" aria-hidden />
          </button>
        </div>

        {/* Compact stepper — `h-9`/`w-8` (36px tall, ~90px total width),
            not the 44px+ footprint used on the Product Detail page. A
            cart line with 2-5 rows needs a denser control than a single
            full-attention PDP purchase decision does; the stepper still
            keeps its own comfortable internal hit area via `flex
            items-center justify-center` filling the full button box, it
            just doesn't need to be 44px to stay genuinely tappable at
            this size. */}
        <div className="mt-1.5 flex items-center justify-between">
          <div className="flex h-9 items-center rounded-full border">
            <button
              type="button"
              aria-label="Decrease quantity"
              disabled={isPending || isUnavailable}
              onClick={() => updateQuantity(quantity - 1)}
              className="flex h-full w-8 items-center justify-center rounded-l-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
            >
              <Minus className="size-3" aria-hidden />
            </button>
            <span aria-live="polite" className="w-5 text-center text-xs font-medium tabular-nums">
              {quantity}
            </span>
            <button
              type="button"
              aria-label="Increase quantity"
              disabled={isPending || isUnavailable || quantity >= Math.min(productVariant.stockQuantity, 20)}
              onClick={() => updateQuantity(quantity + 1)}
              className="flex h-full w-8 items-center justify-center rounded-r-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:z-10 focus-visible:ring-3 focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-40"
            >
              <Plus className="size-3" aria-hidden />
            </button>
          </div>

          <p className="text-sm font-medium">
            {formatPaise(productVariant.priceInPaise * quantity)}
          </p>
        </div>
      </div>
    </li>
  );
}
