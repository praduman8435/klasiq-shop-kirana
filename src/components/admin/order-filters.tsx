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
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-lifecycle";
import {
  ORDER_SOURCE_VALUES,
  ORDER_STATUS_VALUES,
  PAYMENT_STATUS_VALUES,
} from "@/lib/validation/admin-orders";
import { cn } from "@/lib/utils";

const ORDER_SOURCE_FILTER_LABEL: Record<(typeof ORDER_SOURCE_VALUES)[number], string> = {
  ONLINE: "Online",
  COUNTER: "Counter Sale",
};

const FILTER_KEYS = ["status", "paymentStatus", "fulfillmentType", "source", "dateFrom", "dateTo"] as const;

const SELECT_CLASS =
  "h-9 rounded-md border border-border bg-background px-2.5 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Same query-param-driven filtering as before (`updateParam` still just
 * pushes `/admin/orders?...`) — only the presentation changed. Desktop
 * renders every control inline in one compact row; below `sm` the same
 * controls move into a bottom Sheet behind a single "Filters" button, so
 * five selects never fight for space on a narrow screen. Both surfaces
 * share the same handlers, so there is exactly one filtering
 * implementation, rendered twice.
 */
export function OrderFilters() {
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
    router.push(`/admin/orders?${params.toString()}`);
  }

  const activeFilterCount = FILTER_KEYS.filter((key) => Boolean(searchParams.get(key))).length;

  const statusSelect = (
    <select
      aria-label="Filter by order status"
      value={searchParams.get("status") ?? ""}
      onChange={(e) => updateParam("status", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">All statuses</option>
      {ORDER_STATUS_VALUES.map((status) => (
        <option key={status} value={status}>
          {ORDER_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );

  const paymentSelect = (
    <select
      aria-label="Filter by payment status"
      value={searchParams.get("paymentStatus") ?? ""}
      onChange={(e) => updateParam("paymentStatus", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">All payment statuses</option>
      {PAYMENT_STATUS_VALUES.map((status) => (
        <option key={status} value={status}>
          {PAYMENT_STATUS_LABEL[status]}
        </option>
      ))}
    </select>
  );

  const fulfillmentSelect = (
    <select
      aria-label="Filter by fulfillment method"
      value={searchParams.get("fulfillmentType") ?? ""}
      onChange={(e) => updateParam("fulfillmentType", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">All fulfillment methods</option>
      <option value="STORE_PICKUP">Store Pickup</option>
      <option value="LOCAL_DELIVERY">Local Delivery</option>
      <option value="COUNTER_HANDOVER">Counter Sale</option>
    </select>
  );

  const sourceSelect = (
    <select
      aria-label="Filter by order source"
      value={searchParams.get("source") ?? ""}
      onChange={(e) => updateParam("source", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">All sources</option>
      {ORDER_SOURCE_VALUES.map((source) => (
        <option key={source} value={source}>
          {ORDER_SOURCE_FILTER_LABEL[source]}
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
          placeholder="Search order #, name or mobile"
          defaultValue={searchParams.get("q") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") updateParam("q", e.currentTarget.value);
          }}
          onBlur={(e) => updateParam("q", e.currentTarget.value)}
          className="h-9 flex-1 sm:max-w-xs"
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
              <SheetTitle>Filter orders</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 p-4 pt-0">
              <div className="flex flex-col gap-1.5">{statusSelect}</div>
              <div className="flex flex-col gap-1.5">{paymentSelect}</div>
              <div className="flex flex-col gap-1.5">{fulfillmentSelect}</div>
              <div className="flex flex-col gap-1.5">{sourceSelect}</div>
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
        {paymentSelect}
        {fulfillmentSelect}
        {sourceSelect}
        {dateRange}
      </div>
    </div>
  );
}
