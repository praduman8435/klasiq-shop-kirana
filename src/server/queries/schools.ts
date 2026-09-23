import { db } from "@/lib/db";

export async function searchSchools(query: string, limit = 8) {
  const trimmed = query.trim();
  if (trimmed.length < 2) return [];

  return db.school.findMany({
    where: {
      isActive: true,
      name: { contains: trimmed, mode: "insensitive" },
    },
    orderBy: { name: "asc" },
    take: limit,
    select: { id: true, slug: true, name: true, city: true, logoUrl: true },
  });
}

export async function getSchoolBySlug(slug: string) {
  return db.school.findUnique({
    where: { slug },
    include: {
      classes: { orderBy: { sortOrder: "asc" } },
    },
  });
}

/**
 * Returns the products assigned to a school for an optional class/gender
 * selection, grouped in display order. `classId` and `gender` are optional
 * filters — omitting them returns everything assigned school-wide.
 */
export async function getSchoolAssignedProducts(params: {
  schoolId: string;
  classId?: string | null;
  gender?: "BOYS" | "GIRLS" | null;
}) {
  const { schoolId, classId, gender } = params;

  const assignments = await db.schoolUniformAssignment.findMany({
    where: {
      schoolId,
      product: { isActive: true },
      AND: [
        classId ? { OR: [{ classId }, { classId: null }] } : {},
        gender ? { OR: [{ gender }, { gender: "UNISEX" as const }] } : {},
      ],
    },
    orderBy: { sortOrder: "asc" },
    include: {
      product: {
        include: {
          variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
          category: { select: { slug: true, name: true } },
        },
      },
    },
  });

  // A product can appear from more than one matching assignment row (e.g.
  // both a school-wide row and a class-specific one) — de-duplicate by
  // product id while keeping the first (lowest sortOrder) occurrence.
  const seen = new Set<string>();
  const products = [];
  for (const assignment of assignments) {
    if (seen.has(assignment.productId)) continue;
    seen.add(assignment.productId);
    products.push(assignment.product);
  }
  return products;
}

export async function getSchoolRecommendedSets(params: {
  schoolId: string;
  classId?: string | null;
  gender?: "BOYS" | "GIRLS" | null;
}) {
  const { schoolId, classId, gender } = params;

  return db.recommendedUniformSet.findMany({
    where: {
      schoolId,
      isActive: true,
      AND: [
        classId ? { OR: [{ classId }, { classId: null }] } : {},
        gender ? { OR: [{ gender }, { gender: "UNISEX" as const }] } : {},
      ],
    },
    include: {
      class: { select: { name: true } },
      items: {
        orderBy: { sortOrder: "asc" },
        where: { product: { isActive: true } },
        include: {
          product: {
            include: {
              variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
            },
          },
        },
      },
    },
  });
}
