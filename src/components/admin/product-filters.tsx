"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

type Counts = { out: number; low: number; hidden: number; all: number };

/**
 * Products toolbar: search as you type (name, brand or code), a row of
 * category chips, and quick views for what needs attention — out of
 * stock, running low, hidden from the website. Everything lives in the
 * URL, so a filtered list can be bookmarked or shared.
 */
export function ProductFilters({
  categories,
  counts,
}: {
  categories: Array<{ slug: string; name: string }>;
  counts: Counts;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();
  const [query, setQuery] = useState(searchParams.get("q") ?? "");
  const lastPushed = useRef(query);

  function push(next: Record<string, string | null>) {
    const params = new URLSearchParams(searchParams.toString());
    for (const [key, value] of Object.entries(next)) {
      if (value) params.set(key, value);
      else params.delete(key);
    }
    const qs = params.toString();
    startTransition(() => router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false }));
  }

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed === lastPushed.current) return;
    const timer = window.setTimeout(() => {
      lastPushed.current = trimmed;
      push({ q: trimmed || null });
    }, 300);
    return () => window.clearTimeout(timer);
    // push reads the latest searchParams on each run; query is the trigger.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  const category = searchParams.get("categorySlug") ?? "";
  const stock = searchParams.get("stock") ?? "";
  const views = [
    { key: "", label: "All", count: counts.all },
    { key: "out", label: "Out of stock", count: counts.out, tone: "text-destructive" },
    { key: "low", label: "Running low", count: counts.low, tone: "text-amber-400" },
    { key: "hidden", label: "Hidden", count: counts.hidden },
  ];

  const chip = (active: boolean) =>
    cn(
      "inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
      active ? "border-primary bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:bg-secondary hover:text-foreground",
    );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search name, brand or code"
            aria-label="Search products"
            className="h-10 w-full rounded-lg border border-border bg-background pr-9 pl-9 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:hidden"
          />
          {isPending ? (
            <Loader2 className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />
          ) : (
            query && (
              <button
                type="button"
                onClick={() => setQuery("")}
                aria-label="Clear search"
                className="absolute top-1/2 right-1.5 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:bg-secondary hover:text-foreground"
              >
                <X className="size-4" aria-hidden />
              </button>
            )
          )}
        </div>

        <div role="group" aria-label="Show" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0 lg:pb-0">
          {views.map((v) => (
            <button key={v.key || "all"} type="button" aria-pressed={stock === v.key} onClick={() => push({ stock: v.key || null })} className={chip(stock === v.key)}>
              {v.label}
              <span className={cn("tabular-nums", stock === v.key ? "text-primary-foreground/80" : v.count > 0 && v.tone ? v.tone : "")}>{v.count}</span>
            </button>
          ))}
        </div>
      </div>

      <div role="group" aria-label="Category" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:px-0">
        <button type="button" aria-pressed={!category} onClick={() => push({ categorySlug: null })} className={chip(!category)}>
          All categories
        </button>
        {categories.map((c) => (
          <button
            key={c.slug}
            type="button"
            aria-pressed={category === c.slug}
            onClick={() => push({ categorySlug: category === c.slug ? null : c.slug })}
            className={chip(category === c.slug)}
          >
            {c.name}
          </button>
        ))}
      </div>
    </div>
  );
}
