import Link from "next/link";
import { ShoppingBag } from "lucide-react";
import { getBasket, basketItemCount } from "@/lib/basket";
import { cn } from "@/lib/utils";

export async function BagLink({ className }: { className?: string }) {
  const basket = await getBasket();
  const count = basketItemCount(basket);

  return (
    <Link
      href="/bag"
      className={cn(
        "relative inline-flex h-10 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-3 text-sm font-medium transition-colors hover:bg-muted",
        className,
      )}
      aria-label={
        count > 0 ? `Bag, ${count} item${count === 1 ? "" : "s"}` : "Bag, empty"
      }
    >
      <ShoppingBag className="size-4" aria-hidden />
      <span className="hidden sm:inline">Bag</span>
      {count > 0 && (
        <span
          aria-hidden
          className="flex size-5 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground"
        >
          {count > 9 ? "9+" : count}
        </span>
      )}
    </Link>
  );
}
