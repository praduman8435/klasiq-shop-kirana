import { db } from "@/lib/db";

export async function getAdminSchools(query?: string) {
  const trimmed = query?.trim();
  return db.school.findMany({
    where: trimmed ? { name: { contains: trimmed, mode: "insensitive" } } : {},
    orderBy: { name: "asc" },
    include: { _count: { select: { classes: true, assignments: true, orders: true } } },
  });
}

export async function getAdminSchoolById(id: string) {
  return db.school.findUnique({
    where: { id },
    include: {
      classes: { orderBy: { sortOrder: "asc" } },
      assignments: {
        orderBy: { sortOrder: "asc" },
        include: {
          product: { select: { id: true, name: true } },
          class: { select: { id: true, name: true } },
        },
      },
      recommendedSets: {
        orderBy: { createdAt: "desc" },
        include: {
          class: { select: { id: true, name: true } },
          items: {
            orderBy: { sortOrder: "asc" },
            include: { product: { select: { id: true, name: true } } },
          },
        },
      },
    },
  });
}

/** Products eligible to be assigned to this school: generic products (usable
 * by any school) plus this specific school's own exclusive products. */
export async function getAssignableProductsForSchool(schoolId: string) {
  return db.product.findMany({
    where: { isActive: true, OR: [{ schoolId: null }, { schoolId }] },
    orderBy: { name: "asc" },
    select: { id: true, name: true, schoolId: true },
  });
}
