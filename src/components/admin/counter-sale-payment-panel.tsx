"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

export type PaymentFormMode = "FULL" | "PARTIAL";

export type PaymentFormState = {
  mode: PaymentFormMode;
  /** Rupees, as typed — converted to paise only at submit time (never
   * stored/sent as a float). */
  amountReceivedRupees: string;
};

export function initialPaymentFormState(): PaymentFormState {
  return { mode: "FULL", amountReceivedRupees: "" };
}

/**
 * Phase 3.6.5 Part 3 section 9 — "Full Payment / Partial Payment," shown
 * simple: a two-way toggle mirroring `CounterSaleDiscountPanel`'s own
 * button style, with an Amount Received input and a live Outstanding
 * preview appearing only once Partial is chosen. No payment math happens
 * here — the parent (`CounterSaleForm`) computes the preview via the SAME
 * `computePaymentOutcome` the server uses, this component only renders
 * whatever it's given.
 */
export function CounterSalePaymentPanel({
  state,
  onChange,
  partialDisabled,
  previewOutstandingInPaise,
  previewError,
}: {
  state: PaymentFormState;
  onChange: (next: PaymentFormState) => void;
  /** Section 2 — "Partial payment should only be meaningful when a
   * Customer is attached." Guest sales disable the Partial button
   * entirely rather than silently downgrading it to Full. */
  partialDisabled: boolean;
  /** Null when mode is FULL or the current input doesn't yet resolve to a
   * valid amount — never shown as a misleading "Outstanding: ₹0". */
  previewOutstandingInPaise: number | null;
  previewError: string | null;
}) {
  const amountId = useId();
  const amountErrorId = useId();

  function setMode(mode: PaymentFormMode) {
    onChange({ ...state, mode });
  }

  return (
    <div>
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          aria-pressed={state.mode === "FULL"}
          onClick={() => setMode("FULL")}
          className={cn(
            "h-10 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            state.mode === "FULL"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Full Payment
        </button>
        <button
          type="button"
          aria-pressed={state.mode === "PARTIAL"}
          disabled={partialDisabled}
          title={partialDisabled ? "Select a customer to enable partial payment." : undefined}
          onClick={() => setMode("PARTIAL")}
          className={cn(
            "h-10 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-40",
            state.mode === "PARTIAL"
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          Partial Payment
        </button>
      </div>

      {state.mode === "PARTIAL" && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={amountId}>Amount received (₹)</Label>
            <Input
              id={amountId}
              type="number"
              inputMode="decimal"
              min={0}
              step="1"
              value={state.amountReceivedRupees}
              onChange={(e) => onChange({ ...state, amountReceivedRupees: e.target.value })}
              placeholder="0"
              className="h-11 text-base"
              autoFocus
              aria-invalid={Boolean(previewError)}
              aria-describedby={previewError ? amountErrorId : undefined}
            />
          </div>
          <p id={amountErrorId} className="flex-1 text-sm">
            {previewError ? (
              <span className="text-destructive">{previewError}</span>
            ) : previewOutstandingInPaise !== null ? (
              <span className="text-muted-foreground">
                Outstanding:{" "}
                <span className="font-medium text-foreground">{formatPaise(previewOutstandingInPaise)}</span>
              </span>
            ) : (
              <span className="text-muted-foreground">Enter the amount received.</span>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
