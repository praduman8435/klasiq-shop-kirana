"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { RETURN_REQUEST_STATUS_LABEL } from "@/lib/return-lifecycle";
import { RETURN_REQUEST_STATUS_VALUES, RETURN_REQUEST_TYPE_VALUES } from "@/lib/validation/admin-returns";
import { cn } from "@/lib/utils";

const RETURN_REQUEST_TYPE_FILTER_LABEL: Record<(typeof RETURN_REQUEST_TYPE_VALUES)[number], string> = {
  RETURN: "Return",
  EXCHANGE: "Exchange",
};

const FILTER_KEYS = ["status", "type", "dateFrom", "dateTo"] as const;

const SELECT_CLASS =
  "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Same query-param-driven filtering as before (`updateParam` still just
 * pushes `/admin/returns?...`) — only the presentation changed, mirroring
 * `OrderFilters`' identical desktop-row / mobile-Sheet split
 * (src/components/admin/order-filters.tsx) so four controls never
 * compete for space on a narrow screen.
 */
export function ReturnFilters() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [sheetOpen, setSheetOpen] = useState(false);

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/admin/returns?${params.toString()}`);
  }

  const activeFilterCount = FILTER_KEYS.filter((key) => Boolean(searchParams.get(key))).length;

  const statusSelect = (
    <select
      aria-label="Filter by status"
      value={searchParams.get("status") ?? ""}
      onChange={(e) => updateParam("status", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">All statuses</option>
      {RETURN_REQUEST_STATUS_VALUES.map((status) => (
        <option key={status} value={status}>
          {RETURN_REQUEST_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );

  const typeSelect = (
    <select
      aria-label="Filter by request type"
      value={searchParams.get("type") ?? ""}
      onChange={(e) => updateParam("type", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">Return &amp; Exchange</option>
      {RETURN_REQUEST_TYPE_VALUES.map((type) => (
        <option key={type} value={type}>
          {RETURN_REQUEST_TYPE_FILTER_LABEL[type]}
        </option>
      ))}
    </select>
  );

  const dateRange = (
    <div className="flex items-center gap-1.5">
      <input
        type="date"
        aria-label="From date"
        value={searchParams.get("dateFrom") ?? ""}
        onChange={(e) => updateParam("dateFrom", e.target.value)}
        className={cn(SELECT_CLASS, "px-2")}
      />
      <span className="text-xs text-muted-foreground">to</span>
      <input
        type="date"
        aria-label="To date"
        value={searchParams.get("dateTo") ?? ""}
        onChange={(e) => updateParam("dateTo", e.target.value)}
        className={cn(SELECT_CLASS, "px-2")}
      />
    </div>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search return #, order #, customer or phone"
          defaultValue={searchParams.get("q") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParam("q", e.currentTarget.value);
          }}
          onBlur={(e) => updateParam("q", e.currentTarget.value)}
          className="h-9 flex-1 sm:max-w-sm"
        />

        <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
          <Button
            type="button"
            variant="outline"
            className="h-9 gap-1.5 px-3 sm:hidden"
            onClick={() => setSheetOpen(true)}
          >
            <SlidersHorizontal className="size-4" aria-hidden />
            Filters
            {activeFilterCount > 0 && (
              <span className="flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground">
                {activeFilterCount}
              </span>
            )}
          </Button>
          <SheetContent side="bottom" className="dark max-h-[85vh] overflow-y-auto">
            <SheetHeader>
              <SheetTitle>Filter returns</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 p-4 pt-0">
              <div className="flex flex-col gap-1.5">{statusSelect}</div>
              <div className="flex flex-col gap-1.5">{typeSelect}</div>
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-medium text-muted-foreground">Date range</span>
                {dateRange}
              </div>
              <Button type="button" className="mt-1 h-10" onClick={() => setSheetOpen(false)}>
                Done
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {statusSelect}
        {typeSelect}
        {dateRange}
      </div>
    </div>
  );
}
