"use client";

import { useId } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { KhataBookDirectoryFilter } from "@/server/queries/admin/khatabook";

const FILTER_TABS: { value: KhataBookDirectoryFilter; label: string }[] = [
  { value: "ALL", label: "All customers" },
  { value: "RECENTLY_ACTIVE", label: "Recently active" },
  { value: "OUTSTANDING", label: "Outstanding balance" },
];

/**
 * KhataBook's directory controls — search (section 3, one unified `q`
 * param, same "push a new URL on Enter/blur" convention `OrderFilters`/
 * `ReturnFilters` use) plus the three directory filters section 6/7
 * asks for. Changing EITHER one resets `page` back to 1 (section 19 —
 * "when search/filter changes, reset to page 1"), by simply never
 * carrying the old `page` param forward into the new URL.
 */
export function KhataBookSearch({ activeFilter }: { activeFilter: KhataBookDirectoryFilter }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputId = useId();

  function navigate(next: { q?: string; filter?: KhataBookDirectoryFilter }) {
    const params = new URLSearchParams();
    const q = next.q ?? searchParams.get("q") ?? "";
    const filter = next.filter ?? activeFilter;
    if (q.trim()) params.set("q", q.trim());
    if (filter !== "ALL") params.set("filter", filter);
    // Deliberately no `page` here — any search or filter change always
    // lands back on page 1 of the new result set.
    router.push(`/admin/khatabook?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor={inputId} className="sr-only">
          Search customers by name, mobile number, or Customer ID
        </label>
        <Input
          id={inputId}
          type="search"
          placeholder="Search by name, mobile number, or Customer ID"
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
