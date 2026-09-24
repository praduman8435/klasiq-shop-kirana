"use client";

import { useId } from "react";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";

/** Notes a customer usually hands over, above the bill amount. */
function suggestedNotes(totalInPaise: number): number[] {
  const total = totalInPaise / 100;
  const roundUp = (step: number) => Math.ceil(total / step) * step;
  const options = [roundUp(10), roundUp(50), roundUp(100), 500, 2000].filter((n) => n > total);
  return [...new Set(options)].sort((a, b) => a - b).slice(0, 4);
}

/**
 * "Cash received → return change" for a cash sale: type or tap what the
 * customer handed over and see the change to give back. Only a helper on
 * screen — nothing here is saved.
 */
export function CounterSaleCashChange({
  totalInPaise,
  value,
  onChange,
}: {
  totalInPaise: number;
  value: string;
  onChange: (value: string) => void;
}) {
  const inputId = useId();
  if (totalInPaise <= 0) return null;
  const givenInPaise = Math.round((Number(value) || 0) * 100);
  const changeInPaise = givenInPaise - totalInPaise;

  return (
    <div className="rounded-lg border border-border p-3">
      <label htmlFor={inputId} className="text-xs font-medium text-muted-foreground">
        Cash received (optional)
      </label>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <div className="relative min-w-24 flex-1">
          <span className="pointer-events-none absolute top-1/2 left-2.5 -translate-y-1/2 text-sm text-muted-foreground">₹</span>
          <input
            id={inputId}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            value={value}
            onChange={(e) => onChange(e.target.value.replace(/[^\d.]/g, ""))}
            placeholder="0"
            className="h-10 w-full rounded-md border border-border bg-background pr-2 pl-6 text-sm tabular-nums outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/50"
          />
        </div>
        {suggestedNotes(totalInPaise).map((note) => (
          <button
            key={note}
            type="button"
            onClick={() => onChange(String(note))}
            className="h-10 shrink-0 rounded-md border border-border px-2.5 text-sm text-muted-foreground tabular-nums hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            ₹{note}
          </button>
        ))}
      </div>
      {givenInPaise > 0 && (
        <p className={cn("mt-2 text-sm font-semibold tabular-nums", changeInPaise >= 0 ? "text-emerald-400" : "text-destructive")}>
          {changeInPaise >= 0 ? `Return ${formatPaise(changeInPaise)}` : `${formatPaise(-changeInPaise)} short`}
        </p>
      )}
    </div>
  );
}
