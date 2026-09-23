"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronRight, ShoppingBag } from "lucide-react";
import { formatPaise } from "@/lib/money";

/** Pages that already own the bottom of a phone screen (their own sticky
 * purchase/checkout bar) or where "view bag" makes no sense. */
function hidesBagBar(pathname: string): boolean {
  return (
    pathname === "/bag" ||
    pathname === "/checkout" ||
    pathname.startsWith("/product/") ||
    pathname.startsWith("/order/") ||
    pathname === "/track" ||
    pathname.startsWith("/track/")
  );
}

/**
 * Phones only: once the bag has something in it, browsing pages carry the
 * quick-commerce cart bar pinned in the thumb zone — a red bar with the
 * item count and running total on the left and "View bag" on the right.
 * The count and total are server-computed (`getBasket()` in the `(site)`
 * layout) and every basket action revalidates them. An in-flow spacer of
 * the bar's own height keeps page content (and the footer) clear of it.
 */
export function MobileBagBar({ itemCount, totalInPaise }: { itemCount: number; totalInPaise: number }) {
  const pathname = usePathname();
  if (itemCount === 0 || hidesBagBar(pathname)) return null;

  return (
    <>
      <div aria-hidden className="h-[calc(4.75rem+env(safe-area-inset-bottom))] md:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
        <Link
          href="/bag"
          className="flex h-14 items-center gap-3 rounded-2xl bg-primary pl-3 pr-4 text-primary-foreground shadow-[0_8px_24px_-8px_oklch(0.54_0.21_27/70%)] transition-transform active:scale-[0.99] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-black/15">
            <ShoppingBag className="size-5" strokeWidth={2.25} aria-hidden />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span key={itemCount} className="animate-cart-pop block origin-left text-xs font-semibold text-primary-foreground/85">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="block text-base font-extrabold tabular-nums">{formatPaise(totalInPaise)}</span>
          </span>
          <span className="flex items-center gap-1 text-base font-extrabold">
            View bag
            <ChevronRight className="size-5" strokeWidth={2.5} aria-hidden />
          </span>
        </Link>
      </div>
    </>
  );
}
