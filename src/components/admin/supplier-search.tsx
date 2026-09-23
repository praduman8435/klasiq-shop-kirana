"use client";

import { useId } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { SupplierDirectoryFilter } from "@/server/queries/admin/suppliers";

const FILTER_TABS: { value: SupplierDirectoryFilter; label: string }[] = [
  { value: "ALL", label: "All" },
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
];

/**
 * Same search + filter-tabs pattern as `KhataBookSearch`
 * (src/components/admin/khatabook-search.tsx): one unified `q` param,
 * three directory filter tabs, and changing either resets `page` back to
 * 1 by simply never carrying the old `page` param forward.
 */
export function SupplierSearch({ activeFilter }: { activeFilter: SupplierDirectoryFilter }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputId = useId();

  function navigate(next: { q?: string; filter?: SupplierDirectoryFilter }) {
    const params = new URLSearchParams();
    const q = next.q ?? searchParams.get("q") ?? "";
    const filter = next.filter ?? activeFilter;
    if (q.trim()) params.set("q", q.trim());
    if (filter !== "ALL") params.set("filter", filter);
    router.push(`/admin/suppliers?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor={inputId} className="sr-only">
          Search suppliers by name, business name, or mobile number
        </label>
        <Input
          id={inputId}
          type="search"
          placeholder="Search suppliers"
          defaultValue={searchParams.get("q") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate({ q: e.currentTarget.value });
          }}
          onBlur={(e) => navigate({ q: e.currentTarget.value })}
          className="h-9 pl-9"
        />
      </div>

      <div className="flex flex-wrap gap-1.5">
        {FILTER_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={activeFilter === tab.value}
            onClick={() => navigate({ filter: tab.value })}
            className={cn(
              "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeFilter === tab.value
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
