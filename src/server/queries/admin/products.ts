import { db } from "@/lib/db";

export async function getAdminProducts(filters: { query?: string; categorySlug?: string }) {
  const trimmedQuery = filters.query?.trim();
  return db.product.findMany({
    where: {
      AND: [
        filters.categorySlug ? { category: { slug: filters.categorySlug } } : {},
        trimmedQuery
          ? {
              OR: [
                { name: { contains: trimmedQuery, mode: "insensitive" as const } },
                { brand: { contains: trimmedQuery, mode: "insensitive" as const } },
              ],
            }
          : {},
      ],
    },
    orderBy: { name: "asc" },
    include: {
      category: { select: { name: true } },
      _count: { select: { variants: true } },
    },
  });
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
