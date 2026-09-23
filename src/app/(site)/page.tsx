import Link from "next/link";
import type { Metadata } from "next";
import { SchoolSearch } from "@/components/site/school-search";
import { ProductCard } from "@/components/product/product-card";
import { getCategoryIcon } from "@/lib/category-icons";
import { BRAND } from "@/lib/constants";
import { cn } from "@/lib/utils";
import {
  getFeaturedGenericProducts,
  getHeaderCategories,
  pickBrowseFallbackCategory,
} from "@/server/queries/categories";

export const metadata: Metadata = {
  description: BRAND.description,
};

/**
 * Phase 3.7 Part 7 (homepage redesign) — dark-first, compact, editorial.
 * Replaces the light cream hero + 5 huge category cards + no product
 * discovery with: a dark cinematic hero (restrained red glow, one rare
 * gold badge, a compact school-search that no longer eats the whole
 * viewport), a horizontally-scrolling category rail (compact chips, not
 * dashboard cards), and one small real-product teaser section. The whole
 * page — header and footer included, via `RouteThemeScope` — wears the
 * `.dark` token scope defined in globals.css; every other route is
 * completely unaffected. Still the same "One Red Rule"/"Gold Is Rare
 * Rule" discipline as before: one signature category tile in red, one
 * gold badge in the hero, nothing else competing for either color.
 */
export default async function HomePage() {
  const [categories, featuredProducts] = await Promise.all([
    getHeaderCategories(),
    getFeaturedGenericProducts(5),
  ]);
  const signatureCategory = pickBrowseFallbackCategory(categories);

  return (
    <div className="flex flex-col">
      {/* Final mobile polish — `py-10` read as noticeably more generous
          than every other section on this page (`py-6`), pushing "Shop
          by category" past 450px down the viewport on narrow phones
          before this measurably helped the hero feel any more premium.
          `py-8` still reads as a deliberately more spacious hero than
          the plain content sections below it, just not doubly so. */}
      <section className="relative px-4 py-8 sm:px-6 sm:py-14">
        {/* Critique fix — the previous two-blob (red + gold) glow read as
            a generic dark-SaaS-landing-page decoration and stacked a
            second, non-CTA red instance on top of the signature chip
            below. One soft gold glow, centered behind the badge, is
            enough "cinematic" atmosphere without borrowing the trope or
            spending red decoratively. Final-polish pass — a very slow
            (10s) drift/pulse gives the page a quiet sense of life on
            load without reading as an animated decoration; collapses to
            static under prefers-reduced-motion via the global rule.
            Search-overlay fix — `overflow-hidden` used to live on the
            section itself, which also clipped the school-search
            dropdown the moment it grew past the hero's own bottom edge.
            Scoping `overflow-hidden` to just this glow's own wrapper
            (sized to the section, but not an ancestor of the search box
            below) keeps the glow contained. The dropdown itself no
            longer lives in this subtree at all — `SchoolSearch` now
            portals it to `document.body` (see that component's own doc
            comment), which is what actually resolved the remaining
            "Shop by category" overlap; a same-tree CSS/z-index fix here
            couldn't win against that rail's independently-composited
            `overflow-x-auto` scroll layer. */}
        <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
          <div className="absolute left-1/2 top-0 size-80 rounded-full bg-accent/10 blur-3xl [animation:hero-glow-drift_10s_ease-in-out_infinite] sm:size-96" />
        </div>

        {/* Final refinement pass — the hero previously carried a full
            explanatory paragraph ("Uniforms, footwear, bags, kurtis...")
            plus a duplicate "Shop by school" / "Find your school's
            essentials" heading pair directly above the search input that
            already speaks for itself. That's four lines of reading before
            a shopper could act, on top of the eyebrow and headline. Less
            explanation, more shopping: the search box is the CTA, its own
            placeholder is the label. Nothing replaces the removed copy —
            adding a new subtitle would recreate the exact verbosity this
            pass exists to remove. */}
        <div className="relative mx-auto flex max-w-xl flex-col items-center gap-3 text-center [animation:hero-entrance_0.7s_ease-out]">
          <span className="rounded-full bg-accent px-3 py-1 text-xs font-semibold uppercase tracking-wider text-accent-foreground">
            Trusted local retail
          </span>
          <h1 className="text-balance font-heading text-2xl font-semibold tracking-tight sm:text-3xl md:text-4xl">
            {BRAND.heroHeadline}
          </h1>

          <div className="w-full max-w-sm transition-transform duration-300 focus-within:scale-[1.015]">
            <SchoolSearch size="hero" />
          </div>
        </div>
      </section>

      {/* Final polish pass — this section and the one below it each
          carried their own independent `py-6`, so the boundary between
          them silently doubled to a 48px gap (24px bottom + 24px top) —
          nearly twice this page's own established rhythm step. Dropping
          this section's bottom padding lets the next section's own
          top padding own that one shared gap instead. */}
      {categories.length > 0 && (
        <section className="px-4 pt-6 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="font-heading text-base font-semibold sm:text-lg">
              Shop by category
            </h2>
            {/* Final QA pass — the "there's more to scroll" cue this rail
                relies on (a chip visibly straddling the row's own right
                edge) turned out to depend on accidental pixel alignment:
                a width-by-width sweep found it missing at exactly 375px
                (a common real device width) even though it held at every
                other tested width. A static trailing fade makes the cue
                reliable regardless of how the chips happen to land. */}
            <div className="relative mt-3">
              <div
                className={cn(
                  "flex gap-2 overflow-x-auto pb-1",
                  "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
                )}
              >
                {categories.map((category) => {
                  const Icon = getCategoryIcon(category.slug || category.name);
                  const isSignature = category.slug === signatureCategory?.slug;
                  return (
                    <Link
                      key={category.slug}
                      href={`/${category.slug}`}
                      className={cn(
                        "group flex shrink-0 items-center gap-2 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-150 active:scale-95",
                        isSignature
                          ? // Critique fix — a translucent red tint with red
                            // text measured 3.63:1 against the dark
                            // background, failing AA for normal-size text.
                            // Solid fill + primary-foreground matches the
                            // system's own established "active state" recipe
                            // (the checkout fulfillment tabs) and passes AA.
                            "border-transparent bg-primary text-primary-foreground hover:bg-primary/90"
                          : "border-border bg-card text-foreground hover:border-primary/25 hover:bg-muted",
                      )}
                    >
                      <Icon className="size-4 shrink-0" aria-hidden />
                      {category.name}
                    </Link>
                  );
                })}
              </div>
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
              />
            </div>
          </div>
        </section>
      )}

      {featuredProducts.length > 0 && (
        <section className="px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <div className="flex items-end justify-between gap-3">
              <h2 className="font-heading text-base font-semibold sm:text-lg">
                Shop the essentials
              </h2>
              <Link
                href="/search"
                className="text-sm font-medium text-muted-foreground underline-offset-2 hover:text-foreground hover:underline"
              >
                Shop all
              </Link>
            </div>
            {/* Same grid rhythm as `CategoryProductGrid` — the homepage
                teaser and every category page render the identical
                `ProductCard` at the identical column counts, so this rail
                never reads as a separate, oversized "homepage card"
                design. See category-product-grid.tsx. */}
            <div className="mt-4 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {featuredProducts.map((product) => (
                <ProductCard key={product.id} product={product} />
              ))}
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
