import type { ReactNode } from "react";
import { ProductCard } from "@/components/product/product-card";
import type { ProductWithVariants } from "@/types/catalog";

/**
 * THE shared category-page shell — every generic category (`/uniforms`,
 * `/shoes`, `/bags`, `/kurtis`, ...) and the standalone `/search` page all
 * render through this one component, so redesigning it once redesigns
 * every category simultaneously (product discovery redesign, section 3).
 */
export function CategoryProductGrid({
  title,
  description,
  products,
  emptyState,
  headerExtra,
  nav,
}: {
  title: string;
  description?: string;
  products: ProductWithVariants[];
  emptyState?: ReactNode;
  headerExtra?: ReactNode;
  /** Rendered above the title — the category pages' mobile aisle rail. */
  nav?: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-6xl px-4 py-5 sm:px-6 sm:py-8">
      {nav && <div className="mb-5">{nav}</div>}
      <div className="max-w-2xl">
        <h1 className="font-heading text-2xl font-extrabold leading-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-2 text-sm text-muted-foreground">{description}</p>}
      </div>

      {headerExtra && <div className="mt-4 max-w-lg">{headerExtra}</div>}

      {products.length === 0 ? (
        <div className="mt-5 flex flex-col items-center rounded-2xl border border-dashed border-border bg-card px-4 py-12 text-center sm:mt-6">
          <p className="text-sm font-medium text-foreground">No products found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {emptyState ?? "Try another search or category."}
          </p>
        </div>
      ) : (
        <div className="relative mt-4 grid grid-cols-2 gap-3 sm:mt-6 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
          {products.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </div>
      )}
    </div>
  );
}
