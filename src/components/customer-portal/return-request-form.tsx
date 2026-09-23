"use client";

import { useId, useState, useTransition } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Minus, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { RETURN_REASON_LABEL } from "@/lib/return-lifecycle";
import { cn } from "@/lib/utils";
import { createReturnRequestAction } from "@/server/actions/customer-portal/returns";
import type { ReturnableItem } from "@/server/queries/customer-portal/returns";
import type { ReturnReason } from "@prisma/client";

const REASON_OPTIONS: ReturnReason[] = [
  "WRONG_SIZE",
  "DEFECTIVE",
  "DAMAGED",
  "WRONG_PRODUCT",
  "QUALITY_ISSUE",
  "CHANGED_MIND",
  "OTHER",
];

type ItemSelection = { quantity: number; reason: ReturnReason };

export function ReturnRequestForm({
  orderNumber,
  items,
  orderIneligibleReason,
}: {
  orderNumber: string;
  items: ReturnableItem[];
  orderIneligibleReason: string | null;
}) {
  const [isPending, startTransition] = useTransition();
  const typeId = useId();
  const noteId = useId();

  const [type, setType] = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [selections, setSelections] = useState<Record<string, ItemSelection>>({});
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState<{ returnNumber: string } | null>(null);

  const anyEligible = items.some((item) => item.eligible);
  const hasOtherReason = Object.values(selections).some((s) => s.reason === "OTHER");
  const selectedCount = Object.keys(selections).length;

  function toggleItem(item: ReturnableItem, checked: boolean) {
    setSelections((prev) => {
      const next = { ...prev };
      if (checked) {
        next[item.orderItemId] = { quantity: 1, reason: "WRONG_SIZE" };
      } else {
        delete next[item.orderItemId];
      }
      return next;
    });
  }

  function updateQuantity(orderItemId: string, delta: number, max: number) {
    setSelections((prev) => {
      const current = prev[orderItemId];
      if (!current) return prev;
      const next = Math.min(max, Math.max(1, current.quantity + delta));
      return { ...prev, [orderItemId]: { ...current, quantity: next } };
    });
  }

  function updateReason(orderItemId: string, reason: ReturnReason) {
    setSelections((prev) => {
      const current = prev[orderItemId];
      if (!current) return prev;
      return { ...prev, [orderItemId]: { ...current, reason } };
    });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending || selectedCount === 0) return;
    setFormError(null);

    startTransition(async () => {
      const result = await createReturnRequestAction({
        orderNumber,
        type,
        note: hasOtherReason && note.trim() ? note.trim() : undefined,
        items: Object.entries(selections).map(([orderItemId, { quantity, reason }]) => ({
          orderItemId,
          quantity,
          reason,
        })),
      });

      if (result.success) {
        setSuccess({ returnNumber: result.returnNumber });
        return;
      }
      setFormError(result.error.message);
    });
  }

  if (success) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-center">
        <CheckCircle2 className="mx-auto size-10 text-primary" aria-hidden />
        <h2 className="mt-3 font-heading text-lg font-semibold">Request Submitted</h2>
        <p className="mt-1 font-mono text-sm text-muted-foreground">{success.returnNumber}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Your {type === "EXCHANGE" ? "exchange" : "return"} request was submitted successfully.
        </p>
        <p className="mt-1 text-sm">
          Current status: <span className="font-medium">Requested</span>
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Klasiq will review this request. We can&apos;t promise it will be approved, but you can
          check its status here anytime.
        </p>
        <Link
          href={`/track/orders/${orderNumber}`}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium hover:bg-muted"
        >
          Back to Order
        </Link>
      </div>
    );
  }

  if (!anyEligible) {
    return (
      <div className="rounded-2xl border bg-card p-6 text-sm text-muted-foreground">
        <p>
          {orderIneligibleReason ??
            "None of the items on this order are currently eligible for return or exchange."}
        </p>
        <Link
          href={`/track/orders/${orderNumber}`}
          className="mt-4 inline-flex h-11 items-center justify-center rounded-lg border px-4 text-sm font-medium text-foreground hover:bg-muted"
        >
          Back to Order
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5" noValidate>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <p>{formError}</p>
        </div>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">What would you like to do?</legend>
        <p id={`${typeId}-hint`} className="text-xs text-muted-foreground">
          This applies to every item you select below.
        </p>
        <div
          role="tablist"
          aria-label="Request type"
          aria-describedby={`${typeId}-hint`}
          className="inline-flex w-fit rounded-full border bg-muted p-1"
        >
          {(["RETURN", "EXCHANGE"] as const).map((option) => (
            <button
              key={option}
              type="button"
              role="tab"
              aria-selected={type === option}
              onClick={() => setType(option)}
              className={cn(
                "rounded-full px-5 py-2 text-sm font-medium transition-colors",
                type === option
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {option === "RETURN" ? "Return" : "Exchange"}
            </button>
          ))}
        </div>
      </fieldset>

      <div className="flex flex-col gap-3">
        <p className="text-sm font-medium">Select items</p>
        {items.map((item) => {
          const selection = selections[item.orderItemId];
          const isSelected = Boolean(selection);
          return (
            <div
              key={item.orderItemId}
              className={cn("rounded-xl border bg-card p-3", !item.eligible && "opacity-60")}
            >
              <label className="flex items-start gap-3">
                <Checkbox
                  checked={isSelected}
                  disabled={!item.eligible}
                  onCheckedChange={(checked) => toggleItem(item, checked === true)}
                  className="mt-0.5"
                />
                <div className="flex-1">
                  <p className="text-sm font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.size} &middot; Purchased {item.purchasedQuantity}
                  </p>
                  {item.claimedQuantity > 0 && (
                    <p className="text-xs text-muted-foreground">
                      Already requested: {item.claimedQuantity}
                    </p>
                  )}
                  {!item.eligible && (
                    <p className="mt-1 text-xs text-destructive">
                      {item.returnableQuantity === 0 && item.claimedQuantity > 0
                        ? "Already fully requested for return/exchange."
                        : "Not eligible for return."}
                    </p>
                  )}
                </div>
              </label>

              {isSelected && selection && (
                <div className="mt-3 flex flex-col gap-3 pl-8">
                  <div className="flex items-center gap-3">
                    <Label className="text-xs text-muted-foreground">Quantity</Label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.orderItemId, -1, item.returnableQuantity)}
                        disabled={selection.quantity <= 1}
                        aria-label={`Decrease quantity for ${item.productName}`}
                        className="flex size-9 items-center justify-center rounded-lg border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Minus className="size-4" aria-hidden />
                      </button>
                      <span className="w-8 text-center text-sm font-medium" aria-live="polite">
                        {selection.quantity}
                      </span>
                      <button
                        type="button"
                        onClick={() => updateQuantity(item.orderItemId, 1, item.returnableQuantity)}
                        disabled={selection.quantity >= item.returnableQuantity}
                        aria-label={`Increase quantity for ${item.productName}`}
                        className="flex size-9 items-center justify-center rounded-lg border hover:bg-muted disabled:cursor-not-allowed disabled:opacity-40"
                      >
                        <Plus className="size-4" aria-hidden />
                      </button>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      of {item.returnableQuantity} eligible
                    </span>
                  </div>

                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor={`reason-${item.orderItemId}`} className="text-xs text-muted-foreground">
                      Reason
                    </Label>
                    <select
                      id={`reason-${item.orderItemId}`}
                      value={selection.reason}
                      onChange={(e) => updateReason(item.orderItemId, e.target.value as ReturnReason)}
                      className="h-10 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      {REASON_OPTIONS.map((reason) => (
                        <option key={reason} value={reason}>
                          {RETURN_REASON_LABEL[reason]}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {hasOtherReason && (
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={noteId}>Note (optional)</Label>
          <textarea
            id={noteId}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            maxLength={500}
            rows={3}
            placeholder="Tell us a bit more..."
            className="rounded-lg border border-input bg-transparent p-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
          />
        </div>
      )}

      <Button
        type="submit"
        size="lg"
        className="h-12 w-full text-base"
        disabled={isPending || selectedCount === 0}
      >
        {isPending ? "Submitting..." : `Submit ${type === "EXCHANGE" ? "Exchange" : "Return"} Request`}
      </Button>
    </form>
  );
}
