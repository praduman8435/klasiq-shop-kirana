import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProductFilters } from "@/components/admin/product-filters";
import { adminProductFiltersSchema } from "@/lib/validation/admin-products";
import { getAdminProducts } from "@/server/queries/admin/products";
import { getAllCategories } from "@/server/queries/admin/categories";

export const metadata: Metadata = { title: "Products" };

type PageProps = { searchParams: Promise<{ q?: string; categorySlug?: string }> };

export default async function AdminProductsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const parsed = adminProductFiltersSchema.safeParse({
    query: query.q,
    categorySlug: query.categorySlug,
  });
  const filters = parsed.success ? parsed.data : {};
  // `Object.keys` alone over-counts here: zod's parsed output keeps
  // every optional key even when its value is `undefined` (confirmed via
  // a quick node repl check), so it would report "active" on a
  // completely filter-free page load.
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const [products, categories] = await Promise.all([
    getAdminProducts(filters),
    getAllCategories(),
  ]);

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Products</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {products.length} product{products.length === 1 ? "" : "s"}
          </p>
        </div>
        <Button render={<Link href="/admin/products/new" />} nativeButton={false} className="h-9">
          <Plus className="size-4" aria-hidden />
          Add Product
        </Button>
      </div>

      <ProductFilters categories={categories} />

      {products.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {hasActiveFilters ? "No products match your search" : "No products yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try a different search term or clear the category filter."
              : "Add your first product to start building the catalogue."}
          </p>
          {!hasActiveFilters && (
            <Button render={<Link href="/admin/products/new" />} nativeButton={false} className="mt-4 h-9">
              <Plus className="size-4" aria-hidden />
              Add Product
            </Button>
          )}
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {products.map((product) => (
              <li key={product.id}>
                <Link
                  href={`/admin/products/${product.id}`}
                  className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{product.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {product.category.name}
                      {product.brand && ` · ${product.brand}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {!product.isActive && (
                      <Badge variant="outline" className="border-border text-muted-foreground">
                        Inactive
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">
                      {product._count.variants} pack size{product._count.variants === 1 ? "" : "s"}
                    </span>
                    <ChevronRight
                      className="hidden size-4 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
