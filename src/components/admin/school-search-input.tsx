"use client";

import { useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";

/**
 * Replaces the old plain GET `<form>` — same underlying filter
 * (`getAdminSchools`'s `query`, matched against name only, see that
 * query's own implementation) — with a client-driven search matching
 * the Enter-to-search / on-blur pattern used across Orders/Products/
 * Inventory/Returns, plus a clear button once there's text to clear.
 */
export function SchoolSearchInput() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(searchParams.get("q") ?? "");
  const inputRef = useRef<HTMLInputElement>(null);

  function runSearch(next: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (next) {
      params.set("q", next);
    } else {
      params.delete("q");
    }
    router.push(`/admin/schools?${params.toString()}`);
  }

  return (
    <div className="relative max-w-xs">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <Input
        ref={inputRef}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") runSearch(value);
        }}
        onBlur={() => runSearch(value)}
        placeholder="Search schools by name"
        aria-label="Search schools by name"
        className="h-9 pl-9 pr-9"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => {
            setValue("");
            runSearch("");
            inputRef.current?.focus();
          }}
          className="absolute top-1/2 right-2 flex size-6 -translate-y-1/2 items-center justify-center rounded text-muted-foreground hover:text-foreground"
        >
          <X className="size-3.5" aria-hidden />
        </button>
      )}
    </div>
  );
}
