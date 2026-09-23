"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight } from "lucide-react";
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
 * Phones only: once the bag has something in it, browsing pages carry a
 * black bar pinned in the thumb zone — item count, the running total on a
 * red price sticker, and one tap to the bag. The count and total are
 * server-computed (`getBasket()` in the `(site)` layout) and arrive as
 * props; `router.refresh()` after every add re-renders them. An in-flow
 * spacer of the bar's own height keeps page content (and the footer)
 * clear of it.
 */
export function MobileBagBar({ itemCount, totalInPaise }: { itemCount: number; totalInPaise: number }) {
  const pathname = usePathname();
  if (itemCount === 0 || hidesBagBar(pathname)) return null;

  return (
    <>
      <div aria-hidden className="h-[calc(4.5rem+env(safe-area-inset-bottom))] md:hidden" />
      <div className="fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] md:hidden">
        <Link
          href="/bag"
          className="flex h-14 items-center gap-3 bg-foreground pl-4 pr-3 text-background shadow-[0_6px_20px_-6px_oklch(0.19_0.004_270/55%)] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          <span className="min-w-0 flex-1">
            <span className="decl-label block text-background/70">
              {itemCount} {itemCount === 1 ? "item" : "items"}
            </span>
            <span className="mt-0.5 block text-base font-bold leading-tight">View bag</span>
          </span>
          <span key={itemCount} className="price-sticker animate-price-gun px-2 py-1.5 text-lg">
            <span className="sr-only">Total </span>
            {formatPaise(totalInPaise)}
          </span>
          <ArrowRight className="size-5 shrink-0" aria-hidden />
        </Link>
      </div>
    </>
  );
}
