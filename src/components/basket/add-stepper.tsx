"use client";

import { useOptimistic, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { useBasketQuantity } from "@/components/basket/basket-quantities";
import { MAX_QUANTITY_PER_LINE } from "@/lib/validation/basket";
import { cn } from "@/lib/utils";
import { setVariantQuantity } from "@/server/actions/basket";

/**
 * The quick-commerce ADD control: an outlined ADD button that, once the
 * item is in the bag, becomes a solid red − n + stepper in the same spot.
 * Taps are optimistic (`useOptimistic`) so the count moves instantly; the
 * Server Action revalidates the layout, which re-supplies the real
 * quantity from `getBasket()` — the server stays the source of truth for
 * stock and limits, and any correction it makes is what the card shows.
 */
export function AddStepper({
  productVariantId,
  stockQuantity,
  disabled = false,
  label,
  size = "default",
  className,
}: {
  productVariantId: string;
  stockQuantity: number;
  disabled?: boolean;
  /** Product + pack size, for screen-reader names ("Aloo Bhujia, 200 g"). */
  label: string;
  size?: "default" | "large";
  className?: string;
}) {
  const serverQuantity = useBasketQuantity(productVariantId);
  const [quantity, setOptimisticQuantity] = useOptimistic(serverQuantity);
  const [isPending, startTransition] = useTransition();
  const max = Math.min(stockQuantity, MAX_QUANTITY_PER_LINE);

  function change(next: number) {
    startTransition(async () => {
      setOptimisticQuantity(next);
      const result = await setVariantQuantity({ productVariantId, quantity: next });
      if (!result.success) toast.error(result.message ?? "Could not update your bag.");
      else if (result.message) toast(result.message);
    });
  }

  const height = size === "large" ? "h-12" : "h-9";

  if (quantity === 0) {
    return (
      <button
        type="button"
        onClick={() => change(1)}
        disabled={disabled || isPending}
        aria-label={`Add ${label} to bag`}
        className={cn(
          height,
          "min-w-[4.5rem] rounded-lg border border-primary bg-card px-4 text-sm font-extrabold uppercase tracking-wide text-primary shadow-[0_1px_2px_oklch(0.2_0.006_270/8%)] transition-colors hover:bg-accent active:scale-[0.97] focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring disabled:border-border disabled:bg-muted disabled:text-muted-foreground disabled:shadow-none",
          size === "large" && "px-8 text-base",
          className,
        )}
      >
        {disabled ? "Sold out" : "Add"}
      </button>
    );
  }

  return (
    <div
      className={cn(
        height,
        "flex min-w-[4.5rem] items-center justify-between rounded-lg bg-primary text-primary-foreground shadow-[0_2px_6px_-1px_oklch(0.54_0.21_27/45%)]",
        size === "large" && "min-w-40",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => change(quantity - 1)}
        aria-label={`Remove one ${label}`}
        className="flex h-full w-8 items-center justify-center rounded-l-lg transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/70"
      >
        <Minus className="size-3.5" strokeWidth={3} aria-hidden />
      </button>
      <span aria-live="polite" className="min-w-5 text-center text-sm font-extrabold tabular-nums">
        <span className="sr-only">{label}: </span>
        {quantity}
        <span className="sr-only"> in bag</span>
      </span>
      <button
        type="button"
        onClick={() => change(quantity + 1)}
        disabled={quantity >= max}
        aria-label={`Add one more ${label}`}
        className="flex h-full w-8 items-center justify-center rounded-r-lg transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-inset focus-visible:ring-white/70 disabled:opacity-40"
      >
        <Plus className="size-3.5" strokeWidth={3} aria-hidden />
      </button>
    </div>
  );
}
