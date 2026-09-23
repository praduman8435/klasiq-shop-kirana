"use client";

import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

/**
 * Phase 3.7 Part 7 — Klasiq's dark-first redesign is rolling out one
 * surface at a time (homepage, Product Detail, Bag, and now Checkout are
 * done); every route NOT listed here keeps the existing light system
 * unchanged. Header and Footer are rendered once by the shared `(site)`
 * layout and appear on every route, so they need to know which theme to
 * wear on a per-navigation basis — this is the one client boundary that
 * makes that possible without turning either component into a Client
 * Component (they stay async Server Components; only this thin wrapper
 * needs `usePathname`).
 *
 * Add a route here only once that surface has actually been redesigned
 * dark-first — this list is the single source of truth for "which
 * routes are done," not a place to opt in speculatively. The full
 * customer journey (Home → Category → Product → Bag → Checkout →
 * Order confirmation → Track Order → School storefront) is now one
 * continuous dark surface.
 */
/**
 * Every top-level static segment under `(site)` — these always win route
 * precedence over the dynamic `/[categorySlug]` sibling, so any single
 * path segment NOT in this set is necessarily a category page (see
 * `src/app/(site)/[categorySlug]/page.tsx`). Matching category pages this
 * way (instead of listing slugs) means a newly-added admin category is
 * dark-first automatically, with no code change here.
 */
const RESERVED_TOP_LEVEL_SEGMENTS = new Set([
  "bag",
  "checkout",
  "order",
  "product",
  "school",
  "search",
  "track",
]);

/**
 * Exported so any client component that portals content outside this
 * scope (e.g. a `Sheet`/`Dialog` mounted at `document.body` by default)
 * can still match the current route's theme without duplicating this
 * list — see `MobileNav`.
 */
export function isDarkRoute(pathname: string): boolean {
  if (pathname === "/") return true;
  if (pathname.startsWith("/product/")) return true;
  if (pathname === "/bag") return true;
  if (pathname === "/checkout") return true;
  if (pathname === "/search") return true;
  if (pathname === "/track" || pathname.startsWith("/track/")) return true;
  if (pathname.startsWith("/order/")) return true;
  if (pathname.startsWith("/school/")) return true;

  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 1 && !RESERVED_TOP_LEVEL_SEGMENTS.has(segments[0])) {
    return true;
  }

  return false;
}

export function RouteThemeScope({
  as: Component = "div",
  className,
  children,
}: {
  as?: "header" | "footer" | "div";
  className?: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  return (
    <Component className={cn(isDarkRoute(pathname) && "dark", className)}>
      {children}
    </Component>
  );
}
