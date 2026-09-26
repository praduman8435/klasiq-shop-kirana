import { db } from "@/lib/db";

const STOCK_WHERE = {
  out: { variants: { some: { isActive: true, stockStatus: "OUT_OF_STOCK" as const } } },
  low: { variants: { some: { isActive: true, stockStatus: "LOW_STOCK" as const } } },
  hidden: { isActive: false },
} as const;

/**
 * The Products list: every product with its photo, category and each pack
 * size's price and stock, so the owner sees what sells for how much and
 * what's running out without opening each one. `stock` narrows to
 * products with a pack out of stock / running low, or hidden products.
 */
export async function getAdminProducts(filters: { query?: string; categorySlug?: string; stock?: "out" | "low" | "hidden" }) {
  const trimmedQuery = filters.query?.trim();
  return db.product.findMany({
    where: {
      AND: [
        filters.categorySlug ? { category: { slug: filters.categorySlug } } : {},
        filters.stock ? STOCK_WHERE[filters.stock] : {},
        trimmedQuery
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: "insensitive" as const } },
                { brand: { contains: trimmedQuery, mode: "insensitive" as const } },
                { variants: { some: { sku: { contains: trimmedQuery, mode: "insensitive" as const } } } },
              ],
            }
          : {},
      ],
    },
    orderBy: { name: "asc" },
    include: {
      category: { select: { name: true, slug: true } },
      variants: {
        orderBy: { sortOrder: "asc" },
        select: { id: true, size: true, priceInPaise: true, mrpInPaise: true, stockQuantity: true, stockStatus: true, isActive: true },
      },
    },
  });
}

/** How many products need a look, for the filter chips. */
export async function getProductStockCounts() {
  const [out, low, hidden, all] = await Promise.all([
    db.product.count({ where: STOCK_WHERE.out }),
    db.product.count({ where: STOCK_WHERE.low }),
    db.product.count({ where: STOCK_WHERE.hidden }),
    db.product.count(),
  ]);
  return { out, low, hidden, all };
}

export async function getAdminProductById(id: string) {
  return db.product.findUnique({
    where: { id },
    include: {
      variants: { orderBy: { sortOrder: "asc" } },
      category: true,
    },
  });
}
