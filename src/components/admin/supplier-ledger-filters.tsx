"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import type { LedgerDatePreset } from "@/lib/supplier-ledger-date-range";

const DATE_PRESET_OPTIONS: Array<{ value: LedgerDatePreset; label: string }> = [
  { value: "ALL", label: "All Time" },
  { value: "TODAY", label: "Today" },
  { value: "THIS_WEEK", label: "This Week" },
  { value: "THIS_MONTH", label: "This Month" },
  { value: "CUSTOM", label: "Custom" },
];

const TYPE_OPTIONS = [
  { value: "", label: "All" },
  { value: "PURCHASE", label: "Purchases" },
  { value: "PAYMENT", label: "Payments" },
  { value: "CREDIT", label: "Credits" },
  { value: "REFUND", label: "Refunds" },
] as const;

const INPUT_CLASS = "h-9 rounded-md border border-input bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50";

/**
 * Section 9/10 — date preset + type filter share the exact
 * Sheet-on-mobile pattern `InventoryFilters`/`OrderFilters` already
 * establish (src/components/admin/inventory-filters.tsx): desktop
 * renders everything inline, narrow widths collapse date+type behind
 * one "Filters" button so search never competes for space. Any filter
 * change drops `ledgerPage` — never carrying a stale page number
 * forward onto a now-different result set.
 */
export function SupplierLedgerFilters({ basePath }: { basePath: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);
  const [query, setQuery] = useState(searchParams.get("q") ?? "");

  const datePreset = (searchParams.get("datePreset") as LedgerDatePreset | null) ?? "ALL";
  const activeType = searchParams.get("types") ?? "";
  const from = searchParams.get("from") ?? "";
  const to = searchParams.get("to") ?? "";
  const rangeInvalid = datePreset === "CUSTOM" && from && to && from > to;

  function updateParams(patch: Record<string, string | undefined>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(patch)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    params.delete("ledgerPage");
    router.push(`${basePath}?${params.toString()}`);
  }

  function handleSearchSubmit(event: React.FormEvent) {
    event.preventDefault();
    updateParams({ q: query || undefined });
  }

  const activeFilterCount = (datePreset !== "ALL" ? 1 : 0) + (activeType ? 1 : 0);

  const datePresetControl = (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by date range">
      {DATE_PRESET_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={datePreset === option.value}
          onClick={() => updateParams({ datePreset: option.value === "ALL" ? undefined : option.value })}
          className={cn(
            "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
            datePreset === option.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  const customRangeControl = datePreset === "CUSTOM" && (
    <div className="flex flex-wrap items-center gap-2">
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        From
        <input
          type="date"
          aria-label="From date"
          value={from}
          onChange={(e) => updateParams({ from: e.target.value || undefined })}
          className={cn(INPUT_CLASS, "px-2")}
        />
      </label>
      <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
        To
        <input
          type="date"
          aria-label="To date"
          value={to}
          onChange={(e) => updateParams({ to: e.target.value || undefined })}
          className={cn(INPUT_CLASS, "px-2")}
        />
      </label>
      {rangeInvalid && <span className="text-xs text-destructive">From date must be before to date.</span>}
    </div>
  );

  const typeControl = (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by event type">
      {TYPE_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={activeType === option.value}
          onClick={() => updateParams({ types: option.value || undefined })}
          className={cn(
            "h-8 shrink-0 rounded-full border px-3 text-xs font-medium transition-colors",
            activeType === option.value
              ? "border-primary bg-primary text-primary-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <form onSubmit={handleSearchSubmit} className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <Input
            aria-label="Search ledger by reference or number"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by reference or number"
            className="h-9 pl-9 text-sm"
          />
        </form>
        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            aria-label="Filters"
            className="relative flex h-9 shrink-0 items-center gap-1.5 rounded-md border border-border px-3 text-sm text-muted-foreground hover:text-foreground sm:hidden"
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </button>
          <SheetContent side="bottom" className="dark max-h-[85vh] overflow-y-auto border-border bg-background">
            <SheetHeader>
              <SheetTitle className="text-foreground">Filter ledger</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-4 px-4 pb-6">
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Date range</span>
                {datePresetControl}
                {customRangeControl}
              </div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Event type</span>
                {typeControl}
              </div>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden flex-wrap items-center gap-3 sm:flex">
        {datePresetControl}
        {customRangeControl}
        <div className="h-5 w-px bg-border" />
        {typeControl}
      </div>
      <div className="sm:hidden">{customRangeControl}</div>
    </div>
  );
}
