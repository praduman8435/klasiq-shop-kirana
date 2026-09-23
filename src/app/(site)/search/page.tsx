import type { Metadata } from "next";
import Link from "next/link";
import { CategoryProductGrid } from "@/components/product/category-product-grid";
import { ProductSearchForm } from "@/components/product/product-search-form";
import { productSearchQuerySchema } from "@/lib/validation/product-search";
import { searchProducts } from "@/server/queries/categories";

type PageProps = { searchParams: Promise<{ q?: string }> };

export async function generateMetadata({ searchParams }: PageProps): Promise<Metadata> {
  const { q } = await searchParams;
  const parsed = productSearchQuerySchema.safeParse({ q });
  const query = parsed.success ? parsed.data.q : undefined;

  return {
    title: query ? `Search: ${query}` : "Search",
    // Search-result pages are thin/duplicate content by nature (the same
    // catalog, sliced by an arbitrary query string) — never indexed,
    // mirroring the same choice already made for /bag and /checkout.
    robots: { index: false },
  };
}

/**
 * Phase 3.7 Part 2 — the standalone, cross-category product search page
 * (`/search?q=...`). Deliberately does NOT query the database at all
 * when `q` is absent/empty after validation — there is no "browse
 * everything" mode hiding behind an empty search box; an empty query is
 * its own honest state; the "not-found" bookkeeping. See
 * `searchProducts` (src/server/queries/categories.ts) for the
 * shared, parameterized query this delegates to — identical to what
 * `/[categorySlug]?q=` uses, just without a category constraint.
 */
export default async function SearchPage({ searchParams }: PageProps) {
  const { q } = await searchParams;
  const parsed = productSearchQuerySchema.safeParse({ q });
  const query = parsed.success ? parsed.data.q : undefined;

  const products = query ? await searchProducts(query) : [];

  return (
    <CategoryProductGrid
      title="Search"
      description={query ? `Results for "${query}"` : "Search our catalog by product name."}
      products={products}
      headerExtra={<ProductSearchForm action="/search" query={query} />}
      emptyState={
        query ? (
          <>
            No products found for &quot;{query}&quot;. Try a different search, or{" "}
            <Link href="/" className="underline underline-offset-2">
              browse categories
            </Link>
            .
          </>
        ) : (
          <>Type a product name above to search — e.g. &quot;shirt&quot;, &quot;shoes&quot;, &quot;bag&quot;.</>
        )
      }
    />
  );
}
