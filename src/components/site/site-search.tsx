import { Search } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * The storefront-wide product search box (header, mobile menu, homepage
 * hero, footer, 404). A plain HTML GET form to `/search?q=`, not a Client
 * Component — the same no-JavaScript, URL-driven approach as
 * `ProductSearchForm` (src/components/product/product-search-form.tsx),
 * which stays the in-page search on /search and /[categorySlug]. Labelled
 * via `aria-label` rather than a `<label htmlFor>` because several of
 * these can render on one page (header + footer) and a fixed `id` would
 * collide.
 */
export function SiteSearch({
  size = "hero",
  placeholder = "Search atta, dal, soap, brands...",
  className,
}: {
  size?: "hero" | "compact";
  placeholder?: string;
  className?: string;
}) {
  return (
    <form action="/search" role="search" className={cn("relative w-full", className)}>
      <Search
        aria-hidden
        className={cn(
          "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
          size === "hero" ? "left-3.5 size-4.5" : "left-3 size-4",
        )}
      />
      <input
        type="search"
        name="q"
        aria-label="Search products"
        placeholder={placeholder}
        autoComplete="off"
        className={cn(
          "w-full rounded-xl border bg-card outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          size === "hero" ? "h-11 pl-10 pr-4 text-sm sm:h-12 sm:text-base" : "h-9 pl-9 pr-3 text-sm",
        )}
      />
    </form>
  );
}
