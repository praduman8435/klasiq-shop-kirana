"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Check, CircleSlash, Loader2, RotateCcw } from "lucide-react";
import { CustomerSheet } from "@/components/customer-portal/customer-sheet";
import { cn } from "@/lib/utils";
import { reorderAction } from "@/server/actions/customer-portal/orders";
import type { ReorderLine, SkippedLine } from "@/server/customer-portal/reorder";

type Done = { added: ReorderLine[]; skipped: SkippedLine[]; priceChanged: boolean };

/**
 * "Order again" — puts this order's items back in the bag at today's
 * prices, then shows exactly what went in and what couldn't, with the
 * bag one tap away.
 */
export function ReorderButton({
  orderNumber,
  variant = "outline",
  className,
}: {
  orderNumber: string;
  variant?: "primary" | "outline";
  className?: string;
}) {
  const [isPending, startTransition] = useTransition();
  const [result, setResult] = useState<Done | null>(null);

  function reorder() {
    startTransition(async () => {
      const response = await reorderAction({ orderNumber });
      if (!response.success) {
        toast.error(response.message);
        return;
      }
      setResult({ added: response.added, skipped: response.skipped, priceChanged: response.priceChanged });
    });
  }

  const addedCount = result?.added.length ?? 0;
  const outOfStock = result?.skipped.filter((s) => !s.reason.startsWith("Only")) ?? [];
  const reduced = result?.skipped.filter((s) => s.reason.startsWith("Only")) ?? [];

  return (
    <>
      <button
        type="button"
        onClick={reorder}
        disabled={isPending}
        aria-busy={isPending}
        className={cn(
          "inline-flex h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition-[background-color,transform] active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-70",
          variant === "primary"
            ? "bg-primary text-primary-foreground shadow-[0_2px_8px_oklch(0.54_0.21_27/28%)] hover:bg-brand-deep"
            : "border border-primary/40 bg-card text-primary hover:bg-accent",
          className,
        )}
      >
        {isPending ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <RotateCcw className="size-4" aria-hidden />}
        {isPending ? "Adding to bag…" : "Order again"}
      </button>

      <CustomerSheet
        open={result !== null}
        onOpenChange={(open) => !open && setResult(null)}
        title={
          addedCount === 0
            ? "None of these are available right now"
            : `${addedCount} item${addedCount === 1 ? "" : "s"} added to your bag`
        }
        description={
          addedCount === 0
            ? "Everything from this order is out of stock or no longer sold."
            : result?.priceChanged
              ? "At today's prices. Some prices have changed since this order."
              : "At today's prices. Change quantities in your bag."
        }
      >
        {addedCount > 0 && (
          <ul className="flex flex-col divide-y divide-border rounded-2xl border border-border">
            {result!.added.map((line) => (
              <li key={`${line.name}-${line.size}`} className="flex items-center gap-3 px-3.5 py-2.5 text-sm">
                <Check className="size-4 shrink-0 text-emerald-700" aria-hidden />
                <span className="min-w-0 flex-1 truncate font-semibold">
                  {line.name} <span className="font-normal text-muted-foreground">· {line.size}</span>
                </span>
                <span className="shrink-0 font-bold tabular-nums">×{line.quantity}</span>
              </li>
            ))}
          </ul>
        )}
        {(outOfStock.length > 0 || reduced.length > 0) && (
          <div className="mt-4">
            <p className="text-sm font-bold text-foreground">Couldn&apos;t add</p>
            <ul className="mt-2 flex flex-col gap-2">
              {[...outOfStock, ...reduced].map((line) => (
                <li key={`${line.name}-${line.size}-${line.reason}`} className="flex items-center gap-3 text-sm">
                  <CircleSlash className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  <span className="min-w-0 flex-1 truncate">
                    {line.name} <span className="text-muted-foreground">· {line.size}</span>
                  </span>
                  <span className="shrink-0 text-xs font-semibold text-amber-700">{line.reason}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
        <div className="mt-5 grid gap-2">
          {addedCount > 0 && (
            <Link
              href="/bag"
              className="inline-flex h-12 items-center justify-center rounded-xl bg-primary text-base font-extrabold text-primary-foreground shadow-[0_2px_8px_oklch(0.54_0.21_27/28%)] transition-colors hover:bg-brand-deep focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              Go to bag
            </Link>
          )}
          <button
            type="button"
            onClick={() => setResult(null)}
            className="h-11 rounded-xl text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            {addedCount > 0 ? "Keep shopping here" : "Close"}
          </button>
        </div>
      </CustomerSheet>
    </>
  );
}
