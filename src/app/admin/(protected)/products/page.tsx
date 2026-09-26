import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, EyeOff, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ProductFilters } from "@/components/admin/product-filters";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { adminProductFiltersSchema } from "@/lib/validation/admin-products";
import { getAllCategories } from "@/server/queries/admin/categories";
import { getAdminProducts, getProductStockCounts } from "@/server/queries/admin/products";

export const metadata: Metadata = { title: "Products" };

type PageProps = { searchParams: Promise<{ q?: string; categorySlug?: string; stock?: string }> };

type Pack = Awaited<ReturnType<typeof getAdminProducts>>[number]["variants"][number];

/** One line that says whether this product needs stock, in words. */
function stockSummary(packs: Pack[]): { text: string; tone: "danger" | "warn" | "ok" | "none" } {
  const live = packs.filter((p) => p.isActive);
  if (live.length === 0) return { text: packs.length ? "All sizes hidden" : "No pack sizes yet", tone: "none" };
  const out = live.filter((p) => p.stockStatus === "OUT_OF_STOCK");
  const low = live.filter((p) => p.stockStatus === "LOW_STOCK");
  if (out.length === live.length) return { text: "Out of stock", tone: "danger" };
  if (out.length > 0) return { text: `${out.map((p) => p.size).join(", ")} out of stock`, tone: "danger" };
  if (low.length > 0) return { text: low.map((p) => `${p.size}: ${p.stockQuantity} left`).join(" · "), tone: "warn" };
  const total = live.reduce((s, p) => s + p.stockQuantity, 0);
  return { text: `${total} in stock`, tone: "ok" };
}

const TONE = {
  danger: "text-destructive",
  warn: "text-amber-400",
  ok: "text-muted-foreground",
  none: "text-muted-foreground",
} as const;

/**
 * Products: every item the shop sells with its photo, each pack size's
 * price, and whether it's running out — the owner can spot a wrong price
 * or an empty shelf from the list, then tap in to fix it.
 */
export default async function AdminProductsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const parsed = adminProductFiltersSchema.safeParse({ query: query.q, categorySlug: query.categorySlug, stock: query.stock });
  const filters = parsed.success ? parsed.data : {};
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const [products, categories, counts] = await Promise.all([getAdminProducts(filters), getAllCategories(), getProductStockCounts()]);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Products</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {hasActiveFilters ? `${products.length} of ${counts.all}` : `${counts.all}`} product{counts.all === 1 ? "" : "s"}
          </p>
        </div>
        <Button render={<Link href="/admin/products/new" />} nativeButton={false} className="h-10">
          <Plus className="size-4" aria-hidden />
          Add product
        </Button>
      </div>

      <ProductFilters categories={categories} counts={counts} />

      {products.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">{hasActiveFilters ? "Nothing matches" : "No products yet"}</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters ? "Try another word, or pick All categories." : "Add your first product to start selling."}
          </p>
          {!hasActiveFilters && (
            <Button render={<Link href="/admin/products/new" />} nativeButton={false} className="mt-4 h-10">
              <Plus className="size-4" aria-hidden />
              Add product
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {products.map((product) => {
            const summary = stockSummary(product.variants);
            const livePacks = product.variants.filter((v) => v.isActive);
            return (
              <li key={product.id}>
                <Link
                  href={`/admin/products/${product.id}`}
                  className={cn(
                    "group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-secondary/50 focus-visible:bg-secondary/50 focus-visible:outline-none sm:gap-4 sm:px-4",
                    !product.isActive && "opacity-60",
                  )}
                >
                  <ProductThumbnail
                    imageUrl={product.imageUrl}
                    alt=""
                    categorySlug={product.category.slug}
                    compact
                    className="size-14 shrink-0 rounded-lg border border-border"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium">{product.name}</p>
                      {!product.isActive && (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs text-muted-foreground">
                          <EyeOff className="size-3" aria-hidden />
                          Hidden
                        </span>
                      )}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[product.brand, product.category.name].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {livePacks.slice(0, 4).map((pack) => (
                        <span
                          key={pack.id}
                          className={cn(
                            "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs tabular-nums",
                            pack.stockStatus === "OUT_OF_STOCK"
                              ? "border-destructive/40 text-destructive"
                              : pack.stockStatus === "LOW_STOCK"
                                ? "border-amber-500/40 text-amber-400"
                                : "border-border text-foreground/90",
                          )}
                        >
                          <span className="text-muted-foreground">{pack.size}</span>
                          <span className="font-medium">{formatPaise(pack.priceInPaise)}</span>
                        </span>
                      ))}
                      {livePacks.length > 4 && <span className="px-1 text-xs text-muted-foreground">+{livePacks.length - 4}</span>}
                    </div>
                    {summary.tone !== "ok" && <p className={cn("mt-1 text-xs md:hidden", TONE[summary.tone])}>{summary.text}</p>}
                  </div>
                  <p className={cn("hidden w-44 shrink-0 text-right text-sm md:block", TONE[summary.tone])}>{summary.text}</p>
                  <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
