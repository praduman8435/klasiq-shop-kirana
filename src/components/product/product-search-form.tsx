import Link from "next/link";
import { Search, X } from "lucide-react";

/**
 * Phase 3.7 Part 2 — a plain HTML GET form, not a Client Component: no
 * JavaScript is required for search to work at all. Submitting navigates
 * to `action?q=<value>`, which Next.js server-renders — this IS the
 * "prefer URL-driven search state" requirement, not an approximation of
 * it. Refresh, back/forward, and sharing the URL all reproduce the exact
 * same result for free, with zero client state to keep in sync.
 *
 * Reused identically by the standalone /search page (`action="/search"`)
 * and every /[categorySlug] page (`action="/{slug}"`, scoping the same
 * search to just that category) — one component, not two near-identical
 * forms.
 */
export function ProductSearchForm({
  action,
  query,
  placeholder = "Search products...",
}: {
  action: string;
  query?: string;
  placeholder?: string;
}) {
  return (
    <form action={action} role="search" className="flex items-center gap-2">
      <label htmlFor="product-search-input" className="sr-only">
        Search products
      </label>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <input
          id="product-search-input"
          type="search"
          name="q"
          defaultValue={query}
          placeholder={placeholder}
          autoComplete="off"
          className="h-11 w-full rounded-sm border border-foreground bg-card pl-10 pr-4 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring"
        />
      </div>
      <button
        type="submit"
        aria-label="Search"
        className="flex size-11 shrink-0 items-center justify-center rounded-sm bg-primary text-primary-foreground transition-colors hover:bg-primary/85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
      >
        <Search className="size-4" aria-hidden />
      </button>
      {query && (
        <Link
          href={action}
          aria-label="Clear search"
          className="flex size-11 shrink-0 items-center justify-center rounded-sm border border-foreground text-foreground transition-colors hover:bg-muted"
        >
          <X className="size-4" aria-hidden />
        </Link>
      )}
    </form>
  );
}
