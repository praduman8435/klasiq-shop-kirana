"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { SlidersHorizontal } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";

const FILTER_KEYS = ["categorySlug", "stock"] as const;

const SELECT_CLASS =
  "h-9 rounded-md border border-border bg-background px-3 text-sm text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * Same query-param-driven filtering as before — only the presentation
 * changed. Desktop renders both selects inline; below `sm` they move
 * into a bottom Sheet behind a single "Filters" button, mirroring
 * `OrderFilters`' identical pattern (src/components/admin/order-filters.tsx)
 * so search never has to compete with two selects for space on a narrow
 * screen.
 */
export function InventoryFilters({
  categories,
}: {
  categories: Array<{ slug: string; name: string }>;
}) {
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
    router.push(`/admin/inventory?${params.toString()}`);
  }

  const activeFilterCount = FILTER_KEYS.filter((key) => Boolean(searchParams.get(key))).length;

  const categorySelect = (
    <select
      aria-label="Filter by category"
      value={searchParams.get("categorySlug") ?? ""}
      onChange={(e) => updateParam("categorySlug", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">All categories</option>
      {categories.map((category) => (
        <option key={category.slug} value={category.slug}>
          {category.name}
        </option>
      ))}
    </select>
  );

  const stockSelect = (
    <select
      aria-label="Filter by stock status"
      value={searchParams.get("stock") ?? ""}
      onChange={(e) => updateParam("stock", e.target.value)}
      className={SELECT_CLASS}
    >
      <option value="">All stock levels</option>
      <option value="IN_STOCK">In Stock</option>
      <option value="LOW_STOCK">Low Stock</option>
      <option value="OUT_OF_STOCK">Out of Stock</option>
    </select>
  );

  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search product name or SKU"
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
              <SheetTitle>Filter inventory</SheetTitle>
            </SheetHeader>
            <div className="flex flex-col gap-3 p-4 pt-0">
              <div className="flex flex-col gap-1.5">{categorySelect}</div>
              <div className="flex flex-col gap-1.5">{stockSelect}</div>
              <Button type="button" className="mt-1 h-10" onClick={() => setSheetOpen(false)}>
                Done
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>

      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        {categorySelect}
        {stockSelect}
      </div>
    </div>
  );
}
