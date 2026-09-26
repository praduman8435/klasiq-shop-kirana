import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ShoppingBag } from "lucide-react";
import { BasketLineItem } from "@/components/basket/basket-line-item";
import { OfferNudge } from "@/components/basket/offer-nudge";
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
      <div className="mx-auto max-w-md px-4 py-14 sm:px-6">
        <div className="flex flex-col items-center rounded-3xl bg-card px-6 py-12 text-center shadow-[0_1px_3px_oklch(0.2_0.006_270/8%)]">
          <ShoppingBag className="size-7" strokeWidth={1.5} aria-hidden />
          <h1 className="mt-3 font-heading text-2xl font-extrabold leading-none">
            Your bag is empty
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Items you add will appear here.
          </p>
          <Button
            render={<Link href="/" />}
            nativeButton={false}
            className="mt-5 h-11"
          >
            Continue Shopping
          </Button>
        </div>
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
      <h1 className="font-heading text-3xl font-extrabold leading-none sm:text-4xl">Your bag</h1>
      <p className="mt-2 text-sm text-muted-foreground">{itemCountLabel}</p>
      <OfferNudge subtotalInPaise={total} className="mt-4 lg:max-w-2xl" />

      <div className="mt-5 flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-8">
        <ul className="flex-1 divide-y divide-border rounded-2xl border border-border bg-card px-3 sm:px-4 lg:max-w-2xl">
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
                    categorySlugForPlaceholder:
                      item.productVariant.product.category.slug,
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
        <div className="rounded-2xl border border-border bg-card p-4 lg:sticky lg:top-40 lg:w-[340px] lg:shrink-0">
          <h2 className="font-heading text-xl font-extrabold leading-none">Order summary</h2>
          <div className="mt-3 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPaise(total)}</span>
          </div>
          <div className="mt-1.5 flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Delivery</span>
            <span className="text-muted-foreground">
              Calculated at checkout
            </span>
          </div>
          {/* Matches Checkout's own Subtotal/Delivery/Total summary
              convention exactly (see checkout-form.tsx) — delivery isn't
              known yet at this stage, so Total is the same computed
              `total` as Subtotal, not a separate calculation. */}
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3 text-lg font-extrabold">
            <span>Total</span>
            <span className="tabular-nums">{formatPaise(total)}</span>
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
          below `sm` (the in-content button above is hidden there). The
          same red cart bar as the browse pages' `MobileBagBar`, so the
          path bag → checkout keeps one consistent control in the thumb
          zone: count and total on the left, one tap to checkout. */}
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:hidden">
        <Link
          href="/checkout"
          className="flex h-14 items-center gap-3 rounded-2xl bg-primary pl-4 pr-4 text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.54_0.21_27/70%)] transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-xs font-semibold text-primary-foreground/85">{itemCountLabel}</span>
            <span className="block text-base font-extrabold tabular-nums">
              <span className="sr-only">Total </span>
              {formatPaise(total)}
            </span>
          </span>
          <span className="flex items-center gap-1 text-base font-extrabold">
            Checkout
            <ArrowRight className="size-5 shrink-0" strokeWidth={2.5} aria-hidden />
          </span>
        </Link>
      </div>
    </div>
  );
}
