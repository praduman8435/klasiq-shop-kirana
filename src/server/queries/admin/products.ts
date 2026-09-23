import { db } from "@/lib/db";

export async function getAdminProducts(filters: { query?: string; categorySlug?: string }) {
  const trimmedQuery = filters.query?.trim();
  return db.product.findMany({
    where: {
      AND: [
        filters.categorySlug ? { category: { slug: filters.categorySlug } } : {},
        trimmedQuery ? { name: { contains: trimmedQuery, mode: "insensitive" as const } } : {},
      ],
    },
    orderBy: { name: "asc" },
    include: {
      category: { select: { name: true } },
      school: { select: { name: true } },
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
      school: { select: { id: true, name: true } },
    },
  });
}

export async function getAllSchoolsForPicker() {
  return db.school.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } });
}
