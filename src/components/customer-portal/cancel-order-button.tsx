"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { CustomerSheet } from "@/components/customer-portal/customer-sheet";
import { CUSTOMER_CANCEL_REASONS } from "@/lib/order-lifecycle";
import { cn } from "@/lib/utils";
import { cancelMyOrderAction } from "@/server/actions/customer-portal/orders";

type Reason = (typeof CUSTOMER_CANCEL_REASONS)[number];

/**
 * Cancel from Track Orders: a quiet link that opens a sheet asking why
 * (one tap), with "keep my order" as the easy way out. Nothing is
 * cancelled until the red button is pressed.
 */
export function CancelOrderButton({ orderNumber, summary }: { orderNumber: string; summary: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<Reason | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function cancel() {
    if (!reason) return;
    setError(null);
    startTransition(async () => {
      const result = await cancelMyOrderAction({ orderNumber, reason });
      if (!result.success) {
        setError(result.message);
        router.refresh();
        return;
      }
      setOpen(false);
      toast.success("Order cancelled");
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setReason(null);
          setError(null);
          setOpen(true);
        }}
        className="h-11 w-full rounded-xl text-sm font-bold text-muted-foreground underline-offset-4 hover:bg-muted hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        Cancel order
      </button>

      <CustomerSheet open={open} onOpenChange={(next) => !isPending && setOpen(next)} title="Cancel this order?" description={summary}>
        <fieldset>
          <legend className="text-sm font-bold text-foreground">Why are you cancelling?</legend>
          <div className="mt-2.5 flex flex-wrap gap-2">
            {CUSTOMER_CANCEL_REASONS.map((r) => (
              <label
                key={r}
                className={cn(
                  "inline-flex h-10 cursor-pointer items-center rounded-full border px-4 text-sm font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                  reason === r ? "border-foreground bg-foreground text-background" : "border-border bg-card text-foreground hover:bg-muted",
                )}
              >
                <input type="radio" name="cancel-reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="sr-only" />
                {r}
              </label>
            ))}
          </div>
        </fieldset>

        {error && (
          <p role="alert" className="mt-4 rounded-xl bg-accent px-3.5 py-2.5 text-sm font-semibold text-accent-foreground">
            {error}
          </p>
        )}

        <div className="mt-6 grid gap-2">
          <button
            type="button"
            onClick={cancel}
            disabled={!reason || isPending}
            className="inline-flex h-12 items-center justify-center gap-2 rounded-xl bg-destructive text-base font-extrabold text-white transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
          >
            {isPending && <Loader2 className="size-4 animate-spin" aria-hidden />}
            {isPending ? "Cancelling…" : reason ? "Yes, cancel order" : "Pick a reason to cancel"}
          </button>
          <button
            type="button"
            onClick={() => setOpen(false)}
            disabled={isPending}
            className="h-12 rounded-xl border border-border text-base font-bold text-foreground hover:bg-muted"
          >
            No, keep my order
          </button>
        </div>
      </CustomerSheet>
    </>
  );
}
