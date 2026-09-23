/**
 * Phase 3.7 Part 7 critique fix — kept in lockstep with
 * `category-product-grid.tsx`'s actual column counts and ProductCard's
 * compact card shape (see the sibling fix in `[categorySlug]/loading.tsx`
 * for the same drift, once diagnosed as a real, measurable layout-shift
 * bug rather than cosmetic).
 */
export default function SearchLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" role="status" aria-label="Searching">
      <span className="sr-only">Searching…</span>
      <div className="h-9 w-32 animate-pulse rounded-lg bg-muted sm:h-10" />
      <div className="mt-6 h-11 max-w-md animate-pulse rounded-full bg-muted" />

      <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-4 xl:grid-cols-5">
        {Array.from({ length: 10 }).map((_, i) => (
          <div key={i} className="flex flex-col overflow-hidden rounded-xl border bg-card">
            <div className="aspect-square w-full animate-pulse bg-muted" />
            <div className="flex flex-col gap-2 p-2.5">
              <div className="h-4 w-3/4 animate-pulse rounded bg-muted" />
              <div className="h-3 w-1/2 animate-pulse rounded bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-full bg-muted" />
              <div className="h-9 w-full animate-pulse rounded-lg bg-muted" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
