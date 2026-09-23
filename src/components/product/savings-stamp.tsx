import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * How much below the printed MRP the shop sells, as the violet inkjet
 * batch stamp packs carry — boxed, condensed caps, a touch off-square.
 * Renders nothing unless the price is genuinely under MRP.
 */
export function SavingsStamp({
  priceInPaise,
  mrpInPaise,
  className,
}: {
  priceInPaise: number;
  mrpInPaise: number | null;
  className?: string;
}) {
  if (mrpInPaise === null || mrpInPaise <= priceInPaise) return null;

  return (
    <span
      className={cn(
        "decl-label inline-block -rotate-2 border border-stamp px-1.5 py-1 tabular-nums text-stamp",
        className,
      )}
    >
      Save {formatPaise(mrpInPaise - priceInPaise)}
    </span>
  );
}
