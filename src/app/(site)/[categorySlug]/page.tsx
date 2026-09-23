import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CategoryProductGrid } from "@/components/product/category-product-grid";
import { ProductSearchForm } from "@/components/product/product-search-form";
import { productSearchQuerySchema } from "@/lib/validation/product-search";
import { getCategoryBySlug, getCategoryProducts } from "@/server/queries/categories";

type PageProps = {
  params: Promise<{ categorySlug: string }>;
  searchParams: Promise<{ q?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { categorySlug } = await params;
  const category = await getCategoryBySlug(categorySlug);
  if (!category) return {};

  return {
    title: category.name,
    description: category.description ?? `Browse ${category.name}.`,
    alternates: { canonical: `/${category.slug}` },
  };
}

/**
 * Phase 3.6.7 Part 1 (sections 2, 6, 7, 8) — THE single category browse
 * page, for every category, generic and brand-new alike. Replaces the
 * four individually-hardcoded pages that used to live at this same site
 * root (`/uniforms`, `/shoes`, `/socks`, `/school-bags` — each its own
 * `page.tsx` repeating an identical title/description/`CategoryProductGrid`
 * call with a literal slug baked in). A brand-new category created in
 * Admin with "Display in Header" on (section 7's own example,
 * "Stationery") gets a genuinely working page here immediately — no new
 * route file, no code change, no redeploy.
 *
 * A literal, same-segment-level static folder (e.g. `bag/`, `checkout/`,
 * `school/`, `track/`) always wins Next.js's routing precedence over
 * this dynamic sibling for its own exact path — this page only ever
 * handles a slug that ISN'T one of those, category or not. An unknown
 * slug (typo, or a genuinely nonexistent category) 404s via `notFound()`,
 * identical to Next's own default 404 for any other unmatched path.
 *
 * Phase 3.7 Part 2 — an optional `?q=` searches WITHIN this category
 * only (`/uniforms?q=shirt`): the same `getCategoryProducts` this
 * page already called, now also given the query, so category and search
 * are the same `AND`-combined database query, never a client-side
 * post-filter that could let a search "leak" a different category's
 * product in.
 */
export default async function CategoryPage({ params, searchParams }: PageProps) {
  const { categorySlug } = await params;
  const { q } = await searchParams;
  const category = await getCategoryBySlug(categorySlug);
  if (!category) notFound();

  const parsedQuery = productSearchQuerySchema.safeParse({ q });
  const query = parsedQuery.success ? parsedQuery.data.q : undefined;

  const products = await getCategoryProducts(category.slug, query);

  return (
    <CategoryProductGrid
      title={category.name}
      description={category.description ?? undefined}
      products={products}
      headerExtra={<ProductSearchForm action={`/${category.slug}`} query={query} />}
      emptyState={
        query ? (
          <>
            No products in {category.name} match &quot;{query}&quot;. Try a different
            search, or{" "}
            <Link href={`/${category.slug}`} className="underline underline-offset-2">
              clear the search
            </Link>
            .
          </>
        ) : (
          "No products are available in this category yet. Please check back soon."
        )
      }
    />
  );
}
