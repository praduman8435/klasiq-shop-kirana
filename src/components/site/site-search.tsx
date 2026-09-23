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
 *
 * Drawn as a pack's boxed field: black 1px rule, square corners. The hero
 * size carries an explicit black Search button — on a phone the keyboard's
 * own submit key is easy to miss.
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
  const isHero = size === "hero";

  return (
    <form action="/search" role="search" className={cn("flex w-full items-stretch", className)}>
      <div className="relative min-w-0 flex-1">
        <Search
          aria-hidden
          className={cn(
            "pointer-events-none absolute top-1/2 -translate-y-1/2 text-muted-foreground",
            isHero ? "left-3.5 size-5" : "left-3 size-4",
          )}
        />
        <input
          type="search"
          name="q"
          aria-label="Search products"
          placeholder={placeholder}
          autoComplete="off"
          className={cn(
            "w-full border border-foreground bg-card text-foreground outline-none placeholder:text-muted-foreground focus-visible:ring-3 focus-visible:ring-ring",
            isHero
              ? "h-13 rounded-l-sm border-r-0 pl-11 pr-3 text-base"
              : "h-10 rounded-sm pl-9 pr-3 text-sm",
          )}
        />
      </div>
      {isHero && (
        <button
          type="submit"
          className="h-13 shrink-0 rounded-r-sm bg-foreground px-5 text-base font-bold text-background transition-colors hover:bg-foreground/85 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          Search
        </button>
      )}
    </form>
  );
}
