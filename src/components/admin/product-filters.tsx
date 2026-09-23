"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

/**
 * Same query-param-driven filtering as the Orders/Inventory filter bars
 * (`updateParam` pushes `/admin/products?...`) — replaces the old plain
 * GET `<form>`, which reloaded the whole page on every filter change and
 * had no live "Enter to search" affordance. The underlying filter
 * (`getAdminProducts`'s `query`/`categorySlug`) is unchanged.
 */
export function ProductFilters({
  categories,
}: {
  categories: Array<{ slug: string; name: string }>;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function updateParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) {
      params.set(key, value);
    } else {
      params.delete(key);
    }
    router.push(`/admin/products?${params.toString()}`);
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
      <Input
        placeholder="Search products"
        defaultValue={searchParams.get("q") ?? ""}
        onKeyDown={(e) => {
          if (e.key === "Enter") updateParam("q", e.currentTarget.value);
        }}
        onBlur={(e) => updateParam("q", e.currentTarget.value)}
        className="h-9 sm:max-w-xs"
      />
      <select
        aria-label="Filter by category"
        value={searchParams.get("categorySlug") ?? ""}
        onChange={(e) => updateParam("categorySlug", e.target.value)}
        className="h-9 rounded-md border border-border bg-background px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <option value="">All categories</option>
        {categories.map((category) => (
          <option key={category.slug} value={category.slug}>
            {category.name}
          </option>
        ))}
      </select>
    </div>
  );
}
