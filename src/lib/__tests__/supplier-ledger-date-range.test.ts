import { describe, expect, it } from "vitest";
import { isValidLedgerCustomRange, resolveLedgerDateRange } from "@/lib/supplier-ledger-date-range";

// The function under test deliberately works in LOCAL wall-clock time
// (matching how every other date filter in this codebase already
// treats `<input type="date">` values — see order-filters.tsx's own
// dateFrom/dateTo). `.toISOString()` converts to UTC first, which
// shifts the printed date by a day whenever the test runner's local
// timezone isn't UTC — comparing local date COMPONENTS instead is the
// correct, timezone-independent way to assert on these boundaries.
function localDateString(date: Date): string {
  const yyyy = date.getFullYear().toString().padStart(4, "0");
  const mm = (date.getMonth() + 1).toString().padStart(2, "0");
  const dd = date.getDate().toString().padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

describe("resolveLedgerDateRange", () => {
  it("ALL returns no bounds at all", () => {
    const result = resolveLedgerDateRange("ALL", {}, new Date("2026-08-16T12:00:00"));
    expect(result.from).toBeUndefined();
    expect(result.to).toBeUndefined();
  });

  it("TODAY returns the exact calendar-day bounds of `now`", () => {
    const now = new Date("2026-08-16T15:30:00");
    const result = resolveLedgerDateRange("TODAY", {}, now);
    expect(result.from && localDateString(result.from)).toBe("2026-08-16");
    expect(result.to && localDateString(result.to)).toBe("2026-08-16");
    // A same-day event captured at any time of day must fall within bounds.
    const sameDayEvent = new Date("2026-08-16T23:59:00");
    expect(sameDayEvent.getTime()).toBeGreaterThanOrEqual(result.from!.getTime());
    expect(sameDayEvent.getTime()).toBeLessThanOrEqual(result.to!.getTime());
  });

  it("THIS_WEEK starts Monday and ends Sunday, inclusive of `now`", () => {
    // 2026-08-16 is a Sunday.
    const now = new Date("2026-08-16T12:00:00");
    const result = resolveLedgerDateRange("THIS_WEEK", {}, now);
    expect(result.from && localDateString(result.from)).toBe("2026-08-10"); // Monday
    expect(result.to && localDateString(result.to)).toBe("2026-08-16"); // Sunday
  });

  it("THIS_MONTH spans the full calendar month containing `now`", () => {
    const now = new Date("2026-08-16T12:00:00");
    const result = resolveLedgerDateRange("THIS_MONTH", {}, now);
    expect(result.from && localDateString(result.from)).toBe("2026-08-01");
    expect(result.to && localDateString(result.to)).toBe("2026-08-31");
  });

  it("CUSTOM uses the exact from/to strings given, ignoring `now`", () => {
    const result = resolveLedgerDateRange("CUSTOM", { from: "2026-08-01", to: "2026-08-10" }, new Date("2026-08-16T12:00:00"));
    expect(result.from && localDateString(result.from)).toBe("2026-08-01");
    expect(result.to && localDateString(result.to)).toBe("2026-08-10");
  });

  it("CUSTOM with only `from` leaves `to` open-ended", () => {
    const result = resolveLedgerDateRange("CUSTOM", { from: "2026-08-01" }, new Date("2026-08-16T12:00:00"));
    expect(result.from).toBeDefined();
    expect(result.to).toBeUndefined();
  });
});

describe("isValidLedgerCustomRange", () => {
  it("accepts from <= to", () => {
    expect(isValidLedgerCustomRange("2026-08-01", "2026-08-10")).toBe(true);
    expect(isValidLedgerCustomRange("2026-08-10", "2026-08-10")).toBe(true);
  });

  it("rejects from > to", () => {
    expect(isValidLedgerCustomRange("2026-08-10", "2026-08-01")).toBe(false);
  });

  it("is valid when either bound is missing (nothing to compare)", () => {
    expect(isValidLedgerCustomRange(undefined, "2026-08-10")).toBe(true);
    expect(isValidLedgerCustomRange("2026-08-10", undefined)).toBe(true);
  });
});
