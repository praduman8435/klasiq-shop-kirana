import type { Metadata } from "next";
import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { BasketLineItem } from "@/components/basket/basket-line-item";
import { Button } from "@/components/ui/button";
import { basketTotalInPaise, getBasket } from "@/lib/basket";
import { formatPaise } from "@/lib/money";

export const metadata: Metadata = {
  title: "Your Bag",
  robots: { index: false },
};

export default async function BagPage() {
  const basket = await getBasket();
  const items = basket?.items ?? [];
  const total = basketTotalInPaise(basket);

  if (items.length === 0) {
    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center sm:px-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShoppingBag className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 font-heading text-xl font-semibold">
          Your Bag is empty
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Items you add will appear here.
        </p>
        <Button render={<Link href="/" />} nativeButton={false} className="mt-5 h-11">
          Continue Shopping
        </Button>
      </div>
    );
  }

  const itemCountLabel = `${items.length} ${items.length === 1 ? "item" : "items"}`;

  return (
    // Dark-cart redesign — matches the Product Detail page's own "let the
    // page breathe" precedent: no card-in-card. A single hairline divider
    // separates the item list from the order summary instead of wrapping
    // each in its own bordered `bg-card` box, so the Bag reads as one
    // continuous shopping surface rather than two stacked panels.
    //
    // Bottom padding + the mobile sticky bar below: measured, not
    // guessed — even a 2-item cart pushed "Proceed to Checkout" below the
    // fold at a 294x584 viewport (a very ordinary phone/cart size, not an
    // edge case), so a persistent mobile checkout affordance is genuinely
    // warranted here. Critique-driven fix: the in-content "Proceed to
    // Checkout" button is hidden below `sm` (the same precedent as the
    // Product Detail page's own mobile sticky bar) — a live scroll sweep
    // found the in-content button and the sticky bar simultaneously
    // visible (briefly overlapping) across roughly 85% of the page's
    // scrollable range when both were shown at once. "Continue shopping"
    // stays visible everywhere; it's not a duplicate of anything in the
    // sticky bar. `pb-28` accounts for the bar's own measured height
    // (~90px, tightened from an earlier ~101px pass per this round's
    // "80-90px total" target) plus a margin.
    <div className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:px-6 sm:pb-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
        Your Bag
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        {itemCountLabel}
      </p>

      <div className="mt-3 h-px bg-border" aria-hidden />

      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
        <ul className="flex-1 divide-y divide-border lg:max-w-xl">
          {items.map((item) => (
            <BasketLineItem
              key={item.id}
              item={{
                id: item.id,
                quantity: item.quantity,
                priceInPaiseAtAdd: item.priceInPaiseAtAdd,
                productVariant: {
                  id: item.productVariant.id,
                  size: item.productVariant.size,
                  priceInPaise: item.productVariant.priceInPaise,
                  stockQuantity: item.productVariant.stockQuantity,
                  stockStatus: item.productVariant.stockStatus,
                  isActive: item.productVariant.isActive,
                  product: {
                    name: item.productVariant.product.name,
                    imageUrl: item.productVariant.product.imageUrl,
                    categorySlugForPlaceholder: item.productVariant.product.category.slug,
                    isActive: item.productVariant.product.isActive,
                    brand: item.productVariant.product.brand,
                  },
                },
              }}
            />
          ))}
        </ul>

        {/* A top border on mobile (stacked below the item list) becomes a
            left border on desktop (side-by-side column) — the same
            "subtle tonal separation, not a second card" treatment either
            way. Major redesign — this panel previously had its own
            oversized vertical rhythm (`mt-4`/`mt-5` steps, a 56px CTA)
            independent of the rest of the page; tightened to the same
            dense rhythm as the item rows above it, and the standalone
            "Delivery/pickup and payment are chosen at checkout" sentence
            replaced with a plain summary row — the fact itself, not a
            sentence explaining it. */}
        <div className="border-t pt-4 lg:sticky lg:top-24 lg:w-[340px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <h2 className="font-heading text-base font-semibold">Order summary</h2>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPaise(total)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Delivery</span>
            <span className="text-muted-foreground">Calculated at checkout</span>
          </div>
          {/* Matches Checkout's own Subtotal/Delivery/Total summary
              convention exactly (see checkout-form.tsx) — delivery isn't
              known yet at this stage, so Total is the same computed
              `total` as Subtotal, not a separate calculation. */}
          <div className="mt-2 flex items-center justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{formatPaise(total)}</span>
          </div>

          <Button
            render={<Link href="/checkout" />}
            nativeButton={false}
            className="mt-4 hidden h-12 w-full sm:flex"
          >
            Proceed to Checkout
          </Button>

          <Button
            render={<Link href="/" />}
            nativeButton={false}
            variant="ghost"
            className="mt-2 h-10 w-full text-muted-foreground"
          >
            Continue shopping
          </Button>
        </div>
      </div>

      {/* Mobile-only sticky checkout bar — the SOLE checkout mechanism
          below `sm` (see the hidden in-content button above). Final
          polish — the side-by-side Subtotal/Checkout layout measured too
          horizontally cramped at 294px; stacking Subtotal on its own row
          above a genuinely full-width button gives the primary action
          real weight instead of competing with the price for the same
          row's width. The button now says "Proceed to Checkout" — a
          critique flagged the previous shorter "Checkout" label as an
          inconsistency with the desktop in-content button; since the bar
          is no longer sharing a row with the subtotal, there's no longer
          a horizontal-space reason to abbreviate it. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 pt-2 backdrop-blur supports-backdrop-filter:bg-card/80 sm:hidden">
        <div className="pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-heading font-semibold tabular-nums">{formatPaise(total)}</span>
          </div>
          <Button render={<Link href="/checkout" />} nativeButton={false} className="mt-1.5 h-12 w-full">
            Proceed to Checkout
          </Button>
        </div>
      </div>
    </div>
  );
}
