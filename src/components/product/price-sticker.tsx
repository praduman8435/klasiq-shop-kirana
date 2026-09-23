import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The shop's own price, as the fluorescent sticker a kirana owner's price
 * gun puts on a pack — the one sticker-yellow mark per product. The
 * printed MRP lives separately in the declaration table; this is what the
 * customer actually pays. Sold out, the sticker goes blank-white with the
 * status instead of a price, the way an empty shelf tag reads.
 */
export function PriceSticker({
  priceInPaise,
  soldOut = false,
  size = "default",
  className,
}: {
  priceInPaise: number;
  soldOut?: boolean;
  size?: "default" | "large";
  className?: string;
}) {
  if (soldOut) {
    return (
      <span
        className={cn(
          "price-sticker border border-foreground bg-card px-2 py-1.5 text-xs uppercase tracking-wide",
          className,
        )}
      >
        Sold out
      </span>
    );
  }

  return (
    <span
      className={cn(
        "price-sticker",
        size === "large" ? "px-3 py-2 text-3xl sm:text-4xl" : "px-2 py-1.5 text-lg",
        className,
      )}
    >
      <span className="sr-only">Price </span>
      {formatPaise(priceInPaise)}
    </span>
  );
}
