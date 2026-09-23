/**
 * Phase 3.7 Part 7 (PDP redesign) — kept in lockstep with
 * `product-detail.tsx`'s actual container/grid classes so there's no
 * layout jump when the real page mounts (the same lesson learned from
 * the homepage critique's loading-skeleton drift). No more single
 * bordered card wrapping price/size/quantity/actions — the real page
 * doesn't have one either.
 */
export default function ProductDetailLoading() {
  return (
    <div
      className="mx-auto max-w-6xl px-4 pt-6 sm:px-6 sm:py-10 lg:py-12"
      role="status"
      aria-label="Loading product"
    >
      <span className="sr-only">Loading product…</span>
      <div className="h-4 w-40 animate-pulse rounded bg-muted" />

      <div className="mt-6 grid gap-10 sm:grid-cols-2 lg:gap-16">
        <div className="aspect-square w-full animate-pulse rounded-2xl border bg-muted" />
        <div>
          <div className="h-8 w-3/4 animate-pulse rounded bg-muted" />
          <div className="mt-3 h-4 w-full animate-pulse rounded bg-muted" />
          <div className="mt-2 h-4 w-2/3 animate-pulse rounded bg-muted" />
          <div className="mt-5 h-9 w-28 animate-pulse rounded bg-muted" />
          <div className="mt-6 h-px bg-border" />
          <div className="mt-6 h-4 w-10 animate-pulse rounded bg-muted" />
          <div className="mt-3 flex gap-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="size-11 animate-pulse rounded-full bg-muted" />
            ))}
          </div>
          <div className="mt-6 h-11 w-full animate-pulse rounded-full bg-muted" />
          <div className="mt-2.5 h-11 w-full animate-pulse rounded-full bg-muted" />
        </div>
      </div>
    </div>
  );
}
