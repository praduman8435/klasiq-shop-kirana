import Link from "next/link";
import { getHeaderCategories } from "@/server/queries/categories";
import { CategoryNavLink } from "@/components/site/category-nav-link";
import { SiteSearch } from "@/components/site/site-search";
import { MobileNav } from "@/components/site/mobile-nav";
import { BagLink } from "@/components/site/bag-link";
import { TrackOrdersLink } from "@/components/site/track-orders-link";

/**
 * Phase 3.6.7 Part 1 — an async Server Component (this file has never
 * had "use client") reading the header's categories live from the DB on
 * every render, rather than a hardcoded constant. `MobileNav` (a Client
 * Component, so it cannot fetch itself) receives the same, already-
 * fetched list as a prop — one query, two renderers, never duplicated.
 *
 * Phase 3.7 Part 7 (homepage redesign) — the dark-first theme on "/" is
 * applied once, at the `(site)` layout level (`RouteThemeScope` there),
 * so this component just uses semantic tokens as always and inherits
 * whichever theme is active. Compacted from h-16 to h-14 and every
 * control tightened, per the redesign brief's "premium ecommerce
 * density, not landing-page density."
 */
export async function SiteHeader({ storeName }: { storeName: string }) {
  const categories = await getHeaderCategories();

  return (
    <header className="sticky top-0 z-30 border-b bg-background/95 backdrop-blur supports-backdrop-filter:bg-background/80">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <MobileNav categories={categories} />

        <Link
          href="/"
          className="shrink-0 font-heading text-base font-semibold tracking-tight sm:text-lg"
        >
          {storeName}
        </Link>

        {/* Final QA pass — this nav silently clipped category links
            mid-word between `md` (768px) and ~850px with zero indication
            it was scrollable (confirmed: 331px of content in as little as
            255px of visible box at 768px). A trailing edge-fade gives the
            same "there's more to scroll" cue the homepage's own category
            rail already relies on, harmless when the nav isn't actually
            overflowing (nothing sits under it in that case). */}
        <div className="relative hidden min-w-0 md:block">
          <nav
            aria-label="Categories"
            className="flex items-center gap-1 overflow-x-auto"
          >
            {categories.map((category) => (
              <CategoryNavLink
                key={category.slug}
                slug={category.slug}
                name={category.name}
                className="shrink-0 rounded-full px-2.5 py-1.5 text-sm font-medium text-foreground/80 transition-colors hover:bg-muted hover:text-foreground"
                activeClassName="bg-muted text-foreground"
              />
            ))}
          </nav>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
          />
        </div>

        <div className="hidden min-w-40 flex-1 justify-center px-4 md:flex">
          <SiteSearch size="compact" className="max-w-xs" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <TrackOrdersLink
            className="hidden h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors hover:bg-muted sm:inline-flex"
            activeClassName="border-transparent bg-muted"
          >
            <span className="hidden md:inline">Track Orders</span>
          </TrackOrdersLink>
          <BagLink />
        </div>
      </div>
    </header>
  );
}
