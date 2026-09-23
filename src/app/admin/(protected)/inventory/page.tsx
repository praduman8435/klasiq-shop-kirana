import type { Metadata } from "next";
import { DashboardMetricGroup } from "@/components/admin/stat-card";
import { InventoryFilters } from "@/components/admin/inventory-filters";
import { InventoryRow } from "@/components/admin/inventory-row";
import { adminInventoryFiltersSchema } from "@/lib/validation/admin-inventory";
import { getAdminInventory } from "@/server/queries/admin/inventory";
import { getAllCategories } from "@/server/queries/admin/categories";

export const metadata: Metadata = { title: "Inventory" };

type PageProps = {
  searchParams: Promise<{ q?: string; categorySlug?: string; stock?: string }>;
};

export default async function AdminInventoryPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const parsed = adminInventoryFiltersSchema.safeParse({
    query: query.q,
    categorySlug: query.categorySlug,
    stock: query.stock,
  });
  const filters = parsed.success ? parsed.data : {};
  // `Object.keys` alone over-counts here: zod's parsed output keeps
  // every optional key even when its value is `undefined`, so it would
  // report "active" on a completely filter-free page load.
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const [items, categories] = await Promise.all([
    getAdminInventory(filters),
    getAllCategories(),
  ]);

  // Derived from the already-fetched `items` — no extra query. Only
  // meaningful unfiltered (it's a summary of what's on screen, not a
  // separate always-global count), so it's hidden once any filter narrows
  // the list to avoid implying it still reflects the whole catalogue.
  const lowStockCount = items.filter((i) => i.stockStatus === "LOW_STOCK").length;
  const outOfStockCount = items.filter((i) => i.stockStatus === "OUT_OF_STOCK").length;

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Inventory</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {items.length} pack size{items.length === 1 ? "" : "s"} · stepper for quick corrections,
          Receive stock for new arrivals, Set exact after a physical count
        </p>
      </div>

      {!hasActiveFilters && items.length > 0 && (
        <div className="mb-4">
          <DashboardMetricGroup
            wideCols={3}
            metrics={[
              { label: "Total tracked pack sizes", value: items.length },
              { label: "Low stock", value: lowStockCount, tone: lowStockCount > 0 ? "warning" : "default" },
              { label: "Out of stock", value: outOfStockCount, tone: outOfStockCount > 0 ? "danger" : "default" },
            ]}
          />
        </div>
      )}

      <InventoryFilters categories={categories} />

      {items.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {hasActiveFilters ? "No inventory matches your search" : "No pack sizes are currently tracked"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try a different search term or clear the category/stock filters."
              : "Pack sizes appear here once a product has at least one active pack size."}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border">
          <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
            <span className="flex-1">Product</span>
            <span className="w-20 shrink-0 text-right">Price</span>
            <span className="w-28 shrink-0 text-right">Stock</span>
            <span className="w-[320px] shrink-0" />
          </div>
          <ul className="divide-y divide-border">
            {items.map((item) => (
              <InventoryRow
                key={item.id}
                item={{
                  id: item.id,
                  productName: item.product.name,
                  categoryName: item.product.category.name,
                  size: item.size,
                  sku: item.sku,
                  priceInPaise: item.priceInPaise,
                  stockQuantity: item.stockQuantity,
                  stockStatus: item.stockStatus,
                }}
              />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
