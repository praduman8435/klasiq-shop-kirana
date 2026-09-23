import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { getBasket, basketItemCount } from "@/lib/basket";
import { cn } from "@/lib/utils";

/**
 * The header bag: a white tab on the red band with a black count badge.
 * `key={count}` remounts the badge whenever the count changes, replaying
 * the cart-pop (globals.css) exactly when an item lands in the bag.
 */
export async function BagLink({ className }: { className?: string }) {
  const basket = await getBasket();
  const count = basketItemCount(basket);

  return (
    <Link
      href="/bag"
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-xl bg-card px-3 text-sm font-bold text-foreground shadow-[0_1px_3px_oklch(0.2_0.006_270/15%)] transition-colors hover:bg-card/90 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60",
        className,
      )}
      aria-label={count > 0 ? `Bag, ${count} item${count === 1 ? "" : "s"}` : "Bag, empty"}
    >
      <ShoppingBag className="size-[1.125rem]" strokeWidth={2.25} aria-hidden />
      <span className="hidden sm:inline">Bag</span>
      {count > 0 && (
        <span
          key={count}
          aria-hidden
          className="animate-cart-pop -mr-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-foreground px-1.5 text-xs font-extrabold text-background tabular-nums"
        >
          {count > 99 ? "99+" : count}
        </span>
      )}
    </Link>
  );
}
