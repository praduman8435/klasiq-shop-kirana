import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

/**
 * The printed MRP, struck through, shown beside the selling price — only
 * when it's genuinely higher. An MRP equal to the price (or none at all,
 * for loose goods) renders nothing: there's no discount to signal, and a
 * struck-through number identical to the price would read as a mistake.
 */
export function MrpPrice({
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
    <span className={cn("text-xs tabular-nums text-muted-foreground", className)}>
      MRP <s>{formatPaise(mrpInPaise)}</s>
    </span>
  );
}
