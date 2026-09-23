import Link from "next/link";
import { getHeaderCategories } from "@/server/queries/categories";
import { AisleRailScroller } from "@/components/site/aisle-rail-scroller";
import { getCategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

/**
 * A swipeable row of aisle chips across the top of every category page, so a shopper
 * moves between aisles with a thumb instead of reopening the menu. The
 * current aisle is the red chip; the trailing fade is the "there's more
 * to swipe" cue.
 */
export async function AisleRail({ currentSlug }: { currentSlug: string }) {
  const categories = await getHeaderCategories();
  if (categories.length < 2) return null;

  return (
    <nav aria-label="Aisles" className="relative -mx-4">
      <AisleRailScroller>
        {categories.map((category) => {
          const Icon = getCategoryIcon(category.slug || category.name);
          const isCurrent = category.slug === currentSlug;
          return (
            <li key={category.slug} className="shrink-0">
              <Link
                href={`/${category.slug}`}
                aria-current={isCurrent ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-2 whitespace-nowrap rounded-full border px-3.5 text-sm font-semibold transition-colors focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring",
                  isCurrent
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-card text-foreground active:bg-muted",
                )}
              >
                <Icon className="size-4 shrink-0" strokeWidth={1.75} aria-hidden />
                {category.name}
              </Link>
            </li>
          );
        })}
      </AisleRailScroller>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-y-0 right-0 w-8 bg-gradient-to-l from-background to-transparent"
      />
    </nav>
  );
}
