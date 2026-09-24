"use client";

import { useId } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { KhataListTab } from "@/server/queries/admin/khata-list";

const TABS: { value: KhataListTab; label: string }[] = [
  { value: "DUE", label: "Lena hai" },
  { value: "COLLECT", label: "Collect today" },
  { value: "ALL", label: "All customers" },
];

/** KhataBook search + tabs. Changing either goes back to page 1. */
export function KhataBookSearch({ activeTab }: { activeTab: KhataListTab }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const inputId = useId();

  function navigate(next: { q?: string; tab?: KhataListTab }) {
    const params = new URLSearchParams();
    const q = next.q ?? searchParams.get("q") ?? "";
    const tab = next.tab ?? activeTab;
    if (q.trim()) params.set("q", q.trim());
    if (tab !== "DUE") params.set("tab", tab);
    router.push(`/admin/khatabook?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex gap-1.5 overflow-x-auto">
        {TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            aria-pressed={activeTab === tab.value}
            onClick={() => navigate({ tab: tab.value })}
            className={cn(
              "h-9 shrink-0 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              activeTab === tab.value
                ? "border-transparent bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>
      <div className="relative max-w-md lg:w-80">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <label htmlFor={inputId} className="sr-only">
          Search customers by name or mobile number
        </label>
        <Input
          id={inputId}
          type="search"
          placeholder="Search name or mobile"
          defaultValue={searchParams.get("q") ?? ""}
          onKeyDown={(e) => {
            if (e.key === "Enter") navigate({ q: e.currentTarget.value });
          }}
          onBlur={(e) => navigate({ q: e.currentTarget.value })}
          className="h-10 pl-9"
        />
      </div>
    </div>
  );
}
