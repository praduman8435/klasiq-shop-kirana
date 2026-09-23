import { getCategoryIcon } from "@/lib/category-icons";
import { cn } from "@/lib/utils";

/**
 * A product with no photo — an expected, permanent state for much of the
 * catalogue, so it is designed, never a broken image. Small slots get a
 * quiet category icon on shelf grey. The Product Detail image passes
 * `packFront` and gets the pack's own front panel instead: category mark, brand in label caps and the product name
 * in condensed declaration print — recognisably "that pack", never
 * mistaken for a real photo.
 */
export function ProductPlaceholderImage({
  categorySlug,
  className,
  compact = false,
  large = false,
  packFront,
}: {
  categorySlug: string;
  packFront?: { netQty: string | null };
  className?: string;
  /** Use for small thumbnails (e.g. checkout order summary rows) where a
   * large icon doesn't fit cleanly. */
  compact?: boolean;
  /** Use for the Product Detail page's own much bigger image slot
   * (roughly 450-480px square at desktop) — the default icon size was
   * tuned for compact card contexts and reads as sparse/lost in a panel
   * that much larger; caught during the homepage final-polish critique. */
  large?: boolean;
}) {
  const Icon = getCategoryIcon(categorySlug);

  if (packFront && !compact) {
    return (
      <div className={cn("relative flex flex-col overflow-hidden bg-muted p-6 sm:p-8", className)}>
        <div className="flex flex-1 items-center justify-center">
          {/* eslint-disable-next-line react-hooks/static-components */}
          <Icon aria-hidden className="size-28 text-foreground/80 sm:size-36" strokeWidth={1} />
        </div>
        {packFront.netQty && (
          <div aria-hidden className="self-start border border-foreground bg-card px-3 py-2">
            <p className="decl-label">Net qty</p>
            <p className="font-condensed mt-1 text-3xl font-extrabold leading-none">{packFront.netQty}</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "relative flex items-center justify-center overflow-hidden bg-muted",
        className,
      )}
    >
      {/* `Icon` is one of a fixed set of already-stable, module-level
          lucide-react components (see getCategoryIcon) selected by
          category, never a newly-defined component type — this rule's
          "created during render" concern doesn't apply. Opacity fixed at
          75% (not the originally-shipped 60%) after live contrast
          measurement showed the composited icon pixel fell under the 3:1
          WCAG non-text-contrast guideline, worst on light surfaces
          (2.65:1) — 75% clears 3:1 on both the light and dark palette. */}
      {/* eslint-disable-next-line react-hooks/static-components */}
      <Icon
        aria-hidden
        className={cn(
          "text-muted-foreground/75",
          compact ? "size-5" : large ? "size-16 sm:size-20" : "size-10 sm:size-12",
        )}
        strokeWidth={1.25}
      />
    </div>
  );
}
