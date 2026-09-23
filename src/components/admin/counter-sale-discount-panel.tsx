"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { DISCOUNT_TYPE_VALUES } from "@/lib/validation/admin-counter-sale";

export type DiscountMode = "NONE" | (typeof DISCOUNT_TYPE_VALUES)[number];

/** Section 4's own example list, plus the two "no reason" / free-text
 * escape hatches. A preset dropdown rather than a bare free-text field —
 * "simple UX" (section 3) — with "Other" revealing a text input only when
 * genuinely needed. */
const REASON_PRESETS = ["Negotiation", "Festival", "Damaged Box", "Owner Approval", "Other"] as const;

export type DiscountFormState = {
  mode: DiscountMode;
  /** Rupees, as typed — converted to paise only at submit time (never
   * stored/sent as a float). */
  flatAmountRupees: string;
  /** A whole percent, as typed. */
  percentValue: string;
  reasonPreset: (typeof REASON_PRESETS)[number] | "";
  reasonOther: string;
};

export function initialDiscountFormState(): DiscountFormState {
  return { mode: "NONE", flatAmountRupees: "", percentValue: "", reasonPreset: "", reasonOther: "" };
}

/** Resolves the free-text reason actually meant for submission — "Other"
 * uses the typed custom text; any other preset uses its own label
 * verbatim; no preset selected means no reason at all. Pure, so both the
 * live preview and the real submit payload derive it identically. */
export function resolveDiscountReason(state: DiscountFormState): string | undefined {
  if (!state.reasonPreset) return undefined;
  if (state.reasonPreset === "Other") return state.reasonOther.trim() || undefined;
  return state.reasonPreset;
}

/**
 * Section 3's "Simple UX. No complicated pricing screen." — three large
 * buttons (mirroring the Payment Method group's own exact style further
 * down this form) choosing No Discount / Flat / Percentage, one number
 * input for whichever is chosen, and an optional preset reason. No
 * discount math happens in this component — the live preview total is
 * computed by the parent (`CounterSaleForm`) via the SAME
 * `computeDiscountInPaise` the server uses, this component only renders
 * whatever it's given.
 */
export function CounterSaleDiscountPanel({
  state,
  onChange,
  previewDiscountInPaise,
  previewError,
}: {
  state: DiscountFormState;
  onChange: (next: DiscountFormState) => void;
  /** Null when mode is NONE or the current input doesn't yet resolve to a
   * valid discount — never shown as a misleading "₹0 off". */
  previewDiscountInPaise: number | null;
  /** The validation message for the CURRENT input, if any — shown inline
   * so the cashier sees why a discount isn't applying before they even
   * try to submit. */
  previewError: string | null;
}) {
  const flatId = useId();
  const percentId = useId();
  const reasonOtherId = useId();
  const discountErrorId = useId();

  function setMode(mode: DiscountMode) {
    onChange({ ...state, mode });
  }

  return (
    <div>
      <div className="grid grid-cols-3 gap-2">
        {(["NONE", ...DISCOUNT_TYPE_VALUES] as const).map((mode) => (
          <button
            key={mode}
            type="button"
            aria-pressed={state.mode === mode}
            onClick={() => setMode(mode)}
            className={cn(
              "h-10 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state.mode === mode
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {mode === "NONE" ? "No Discount" : mode === "FLAT" ? "Flat ₹" : "Percentage %"}
          </button>
        ))}
      </div>

      {state.mode !== "NONE" && (
        <div className="mt-3 flex flex-col gap-3 sm:flex-row">
          <div className="flex flex-1 flex-col gap-1.5">
            {state.mode === "FLAT" ? (
              <>
                <Label htmlFor={flatId}>Discount amount (₹)</Label>
                <Input
                  id={flatId}
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="1"
                  value={state.flatAmountRupees}
                  onChange={(e) => onChange({ ...state, flatAmountRupees: e.target.value })}
                  placeholder="150"
                  className="h-11 text-base"
                  autoFocus
                  aria-invalid={Boolean(previewError)}
                  aria-describedby={previewError ? discountErrorId : undefined}
                />
              </>
            ) : (
              <>
                <Label htmlFor={percentId}>Discount percentage (%)</Label>
                <Input
                  id={percentId}
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={100}
                  step="1"
                  value={state.percentValue}
                  onChange={(e) => onChange({ ...state, percentValue: e.target.value })}
                  placeholder="10"
                  className="h-11 text-base"
                  autoFocus
                  aria-invalid={Boolean(previewError)}
                  aria-describedby={previewError ? discountErrorId : undefined}
                />
              </>
            )}
          </div>
          <div className="flex flex-1 flex-col gap-1.5">
            <Label htmlFor={reasonOtherId}>Reason (optional)</Label>
            <select
              id={reasonOtherId}
              aria-label="Discount reason"
              value={state.reasonPreset}
              onChange={(e) => onChange({ ...state, reasonPreset: e.target.value as DiscountFormState["reasonPreset"] })}
              className="h-11 w-full rounded-lg border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <option value="">No reason</option>
              {REASON_PRESETS.map((preset) => (
                <option key={preset} value={preset}>
                  {preset}
                </option>
              ))}
            </select>
            {state.reasonPreset === "Other" && (
              <Input
                aria-label="Custom discount reason"
                value={state.reasonOther}
                onChange={(e) => onChange({ ...state, reasonOther: e.target.value })}
                placeholder="Describe the reason"
                className="mt-1.5 h-11 text-base"
              />
            )}
          </div>
        </div>
      )}

      {state.mode !== "NONE" && (
        <p id={discountErrorId} className="mt-2 text-sm">
          {previewError ? (
            <span className="text-destructive">{previewError}</span>
          ) : previewDiscountInPaise !== null ? (
            <span className="text-muted-foreground">
              Discount: <span className="font-medium text-foreground">-{formatPaise(previewDiscountInPaise)}</span>
            </span>
          ) : (
            <span className="text-muted-foreground">Enter a discount value.</span>
          )}
        </p>
      )}
    </div>
  );
}
