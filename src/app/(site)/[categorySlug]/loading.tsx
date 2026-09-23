/**
 * Phase 3.7 Part 1 — matches CategoryProductGrid's own container/grid
 * shape so there's no layout jump when the real product grid replaces
 * this skeleton (same `max-w-6xl`, same responsive column counts).
 *
 * Phase 3.7 Part 7 critique fix — the column counts and card shape below
 * had drifted from CategoryProductGrid's actual, ProductCard-era markup
 * (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`, a compact
 * `rounded-xl`/`aspect-square` card) since this comment was written,
 * silently reintroducing the exact layout jump it claims to prevent.
 * Kept in lockstep with `category-product-grid.tsx` — if that grid's
 * classes change, update these to match.
 */
export default function CategoryLoading() {
  return (
    <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6" role="status" aria-label="Loading products">
      <span className="sr-only">Loading products…</span>
      <div className="h-9 w-48 animate-pulse rounded-lg bg-muted sm:h-10 sm:w-64" />

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
