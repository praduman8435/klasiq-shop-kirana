import type { StockStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type AdminInventoryFilters = {
  query?: string;
  categorySlug?: string;
  stock?: StockStatus;
};

export async function getAdminInventory(filters: AdminInventoryFilters) {
  const trimmedQuery = filters.query?.trim();

  return db.productVariant.findMany({
    where: {
      isActive: true,
      AND: [
        filters.stock ? { stockStatus: filters.stock } : {},
        filters.categorySlug ? { product: { category: { slug: filters.categorySlug } } } : {},
        trimmedQuery
          ? {
              OR: [
                { sku: { contains: trimmedQuery, mode: "insensitive" as const } },
                { product: { name: { contains: trimmedQuery, mode: "insensitive" as const } } },
              ],
            }
          : {},
      ],
    },
    include: {
      product: { include: { category: { select: { slug: true, name: true } } } },
    },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
  });
}
