import Link from "next/link";
import { getHeaderCategories } from "@/server/queries/categories";
import { CategoryNavLink } from "@/components/site/category-nav-link";
import { HeaderSearchRow } from "@/components/site/header-search-row";
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
 * The brand band: solid declaration black carrying the white wordmark,
 * with the bag as a white tab wearing the red count sticker. On phones a
 * second row keeps search one tap away on every page but the homepage
 * (see `HeaderSearchRow`).
 */
export async function SiteHeader({ storeName }: { storeName: string }) {
  const categories = await getHeaderCategories();

  return (
    <header className="sticky top-0 z-30 bg-foreground text-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center gap-2 px-2 sm:gap-3 sm:px-6">
        <MobileNav categories={categories} />

        <Link
          href="/"
          aria-label={`${storeName} home`}
          className="font-condensed shrink-0 px-1 text-2xl font-extrabold leading-none tracking-[0.02em] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          {BRAND.wordmark}
          <span aria-hidden className="text-sticker">.</span>
        </Link>

        <div className="relative hidden min-w-0 md:block">
          <nav aria-label="Categories" className="flex items-center gap-0.5 overflow-x-auto">
            {categories.map((category) => (
              <CategoryNavLink
                key={category.slug}
                slug={category.slug}
                name={category.name}
                className="decl-label shrink-0 whitespace-nowrap px-2 py-2.5 text-background/70 transition-colors hover:text-background"
                activeClassName="bg-background text-foreground hover:text-foreground"
              />
            ))}
          </nav>
          <div
            aria-hidden
            className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-foreground to-transparent"
          />
        </div>

        <div className="hidden min-w-40 flex-1 justify-end md:flex">
          <SiteSearch size="compact" className="max-w-xs" />
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-2 md:ml-0">
          <TrackOrdersLink
            className="hidden h-10 shrink-0 items-center gap-1.5 whitespace-nowrap border border-background/40 px-3 text-sm font-semibold transition-colors hover:border-background sm:inline-flex"
            activeClassName="border-background bg-background text-foreground"
          >
            <span className="hidden lg:inline">Track Orders</span>
          </TrackOrdersLink>
          <BagLink />
        </div>
      </div>

      <HeaderSearchRow>
        <SiteSearch size="compact" />
      </HeaderSearchRow>
    </header>
  );
}
