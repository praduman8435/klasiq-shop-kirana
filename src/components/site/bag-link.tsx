import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { getBasket, basketItemCount } from "@/lib/basket";
import { cn } from "@/lib/utils";

/**
 * The bag count is a price sticker: the one piece of header chrome in
 * sticker yellow. `key={count}` remounts the sticker whenever the count
 * changes, which replays the price-gun stamp (globals.css) — the world's
 * single authored motion, fired exactly when an item lands in the bag.
 */
export async function BagLink({ className }: { className?: string }) {
  const basket = await getBasket();
  const count = basketItemCount(basket);

  return (
    <Link
      href="/bag"
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm bg-foreground px-3 text-sm font-semibold text-background transition-colors hover:bg-foreground/85",
        className,
      )}
      aria-label={count > 0 ? `Bag, ${count} item${count === 1 ? "" : "s"}` : "Bag, empty"}
    >
      <ShoppingBag className="size-4" aria-hidden />
      <span className="hidden sm:inline">Bag</span>
      {count > 0 && (
        <span
          key={count}
          aria-hidden
          className="price-sticker animate-price-gun -mr-1 min-w-6 justify-center px-1.5 py-1 text-xs"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
