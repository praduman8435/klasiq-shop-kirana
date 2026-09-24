"use client";

import { forwardRef } from "react";
import { cn } from "@/lib/utils";

/** One-tap choice buttons (payment method, paid now?), the same pressed
 * style as the banner editor's colour/picture choices. */
export function ChoiceChips<T extends string>({
  label,
  options,
  value,
  onChange,
  columns,
}: {
  label: string;
  options: { value: T; label: string; hint?: string }[];
  value: T;
  onChange: (value: T) => void;
  /** Lay the chips out as equal columns instead of wrapping. */
  columns?: number;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-sm font-medium">{label}</legend>
      <div
        className={cn(columns ? "grid gap-2" : "flex flex-wrap gap-2")}
        style={columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined}
      >
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={value === option.value}
            onClick={() => onChange(option.value)}
            className={cn(
              "flex min-h-11 flex-col items-center justify-center rounded-lg border px-3 py-1.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              value === option.value
                ? "border-primary bg-primary/15 font-medium text-foreground"
                : "border-border text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            {option.label}
            {option.hint && <span className="text-xs font-normal text-muted-foreground">{option.hint}</span>}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

/** A large rupee amount field — the one number every quick form is about. */
export const AmountInput = forwardRef<
  HTMLInputElement,
  { id: string; value: string; onChange: (value: string) => void; autoFocus?: boolean; invalid?: boolean }
>(function AmountInput({ id, value, onChange, autoFocus, invalid }, ref) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-2xl text-muted-foreground">
        ₹
      </span>
      <input
        ref={ref}
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        autoFocus={autoFocus}
        placeholder="0"
        value={value}
        aria-invalid={invalid || undefined}
        onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, "").replace(/(\..*)\./g, "$1"))}
        className="h-14 w-full rounded-lg border border-border bg-background pr-3 pl-9 text-2xl font-semibold tabular-nums outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
      />
    </div>
  );
});

/** Today in the shopkeeper's own time zone, as the value a date input wants. */
export function todayInputValue(): string {
  return new Date().toLocaleDateString("en-CA");
}

export const PAYMENT_METHOD_OPTIONS = [
  { value: "CASH" as const, label: "Cash" },
  { value: "UPI" as const, label: "UPI" },
  { value: "BANK_TRANSFER" as const, label: "Bank" },
  { value: "CHEQUE" as const, label: "Cheque" },
];
export type QuickPaymentMethod = (typeof PAYMENT_METHOD_OPTIONS)[number]["value"];
