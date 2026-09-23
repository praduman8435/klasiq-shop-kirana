export const LEDGER_DATE_PRESET_VALUES = ["ALL", "TODAY", "THIS_WEEK", "THIS_MONTH", "CUSTOM"] as const;
export type LedgerDatePreset = (typeof LEDGER_DATE_PRESET_VALUES)[number];

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * Section 8/9 — pure date-math, no DB/query concerns, so the exact
 * boundary rules for each preset are independently testable. "This
 * week" starts Monday (the convention already established elsewhere in
 * this codebase's date-range filters — see order-filters.tsx's own
 * `dateFrom`/`dateTo` inputs for the sibling "plain <input type=date>,
 * inclusive range" pattern this mirrors). `to` is always the END of that
 * calendar day (23:59:59.999) so a same-day event is never excluded by
 * an exact-midnight boundary.
 */
export function resolveLedgerDateRange(
  preset: LedgerDatePreset,
  custom: { from?: string; to?: string },
  now: Date,
): { from?: Date; to?: Date } {
  if (preset === "ALL") return {};

  if (preset === "TODAY") {
    const from = startOfDay(now);
    const to = new Date(from.getTime() + 24 * 60 * 60 * 1000 - 1);
    return { from, to };
  }

  if (preset === "THIS_WEEK") {
    const today = startOfDay(now);
    const isoDayOfWeek = (today.getDay() + 6) % 7; // Monday = 0
    const from = new Date(today.getTime() - isoDayOfWeek * 24 * 60 * 60 * 1000);
    const to = new Date(from.getTime() + 7 * 24 * 60 * 60 * 1000 - 1);
    return { from, to };
  }

  if (preset === "THIS_MONTH") {
    const from = new Date(now.getFullYear(), now.getMonth(), 1);
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    to.setMilliseconds(-1);
    return { from, to };
  }

  // CUSTOM
  const from = custom.from ? startOfDay(new Date(`${custom.from}T00:00:00`)) : undefined;
  const to = custom.to ? new Date(new Date(`${custom.to}T00:00:00`).getTime() + 24 * 60 * 60 * 1000 - 1) : undefined;
  return { from, to };
}

export function isValidLedgerCustomRange(from?: string, to?: string): boolean {
  if (!from || !to) return true;
  return new Date(`${from}T00:00:00`).getTime() <= new Date(`${to}T00:00:00`).getTime();
}
