import { db } from "@/lib/db";

export async function getAllCategories() {
  return db.category.findMany({
    orderBy: { sortOrder: "asc" },
    include: { _count: { select: { products: true } } },
  });
}
