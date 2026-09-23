import Link from "next/link";
import { getHeaderCategories } from "@/server/queries/categories";
import { CategoryNavLink } from "@/components/site/category-nav-link";
import { SiteSearch } from "@/components/site/site-search";
import { MobileNav } from "@/components/site/mobile-nav";
import { BagLink } from "@/components/site/bag-link";
import { TrackOrdersLink } from "@/components/site/track-orders-link";
import { BRAND } from "@/lib/constants";

/**
 * An async Server Component reading the header's categories live from the
 * DB on every render. `MobileNav` (a Client Component, so it cannot fetch
 * itself) receives the same, already-fetched list as a prop — one query,
 * two renderers.
 *
 * Pack-panel world: a white board ruled off from the page by one black
 * line, the wordmark set in the condensed heavy cut a pack's brand lockup
 * uses, and the aisles as small declaration-label caps.
 */
export async function SiteHeader({ storeName }: { storeName: string }) {
  const categories = await getHeaderCategories();

  return (
    <header className="sticky top-0 z-30 border-b border-foreground bg-card">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-3 px-4 sm:px-6">
        <MobileNav categories={categories} />

        <Link
          href="/"
          aria-label={`${storeName} home`}
          className="font-condensed shrink-0 text-xl font-extrabold leading-none tracking-[0.02em] sm:text-2xl"
        >
          {BRAND.wordmark}
        </Link>

        <div className="relative hidden min-w-0 md:block">
          <nav aria-label="Categories" className="flex items-center gap-0.5 overflow-x-auto">
            {categories.map((category) => (
              <CategoryNavLink
                key={category.slug}
                slug={category.slug}
                name={category.name}
                className="decl-label shrink-0 whitespace-nowrap rounded-sm px-2 py-2 text-foreground/75 transition-colors hover:bg-muted hover:text-foreground"
                activeClassName="bg-foreground text-background hover:bg-foreground hover:text-background"
              />
            ))}
          </nav>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-card to-transparent"
          />
        </div>

        <div className="hidden min-w-40 flex-1 justify-end md:flex">
          <SiteSearch size="compact" className="max-w-xs" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <TrackOrdersLink
            className="hidden h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm border border-foreground px-3 text-sm font-semibold transition-colors hover:bg-muted sm:inline-flex"
            activeClassName="bg-foreground text-background hover:bg-foreground"
          >
            <span className="hidden lg:inline">Track Orders</span>
          </TrackOrdersLink>
          <BagLink />
        </div>
      </div>
    </header>
  );
}
