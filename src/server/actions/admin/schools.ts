"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import {
  addSetItemSchema,
  createAssignmentSchema,
  createRecommendedSetSchema,
  createSchoolClassSchema,
  createSchoolSchema,
  deleteAssignmentSchema,
  deleteRecommendedSetSchema,
  deleteSchoolClassSchema,
  removeSetItemSchema,
  updateSchoolSchema,
} from "@/lib/validation/admin-schools";

export type AdminActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND" | "CONFLICT"; message: string } };

async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      admin: null,
      unauthorized: {
        success: false as const,
        error: { type: "UNAUTHORIZED" as const, message: "Please sign in again." },
      },
    };
  }
  return { admin, unauthorized: null };
}

function revalidateSchoolViews(schoolId?: string, slug?: string) {
  revalidatePath("/admin/schools");
  if (schoolId) revalidatePath(`/admin/schools/${schoolId}`);
  revalidatePath("/", "layout");
  if (slug) revalidatePath(`/school/${slug}`);
}

export type CreateSchoolResult = { success: true; id: string };

export async function createSchoolAction(input: unknown): Promise<AdminActionResult<CreateSchoolResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSchoolSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const existing = await db.school.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return {
      success: false,
      error: { type: "CONFLICT", message: "That slug is already used by another school." },
    };
  }

  const school = await db.school.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      city: parsed.data.city || null,
      logoUrl: parsed.data.logoUrl || null,
      isActive: parsed.data.isActive,
      isVerifiedPartner: parsed.data.isVerifiedPartner,
    },
  });

  revalidateSchoolViews(school.id, school.slug);
  return { success: true, id: school.id };
}

export async function updateSchoolAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateSchoolSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const current = await db.school.findUnique({ where: { id: parsed.data.id } });
  if (!current) {
    return { success: false, error: { type: "NOT_FOUND", message: "School not found." } };
  }

  if (parsed.data.slug !== current.slug) {
    const slugTaken = await db.school.findUnique({ where: { slug: parsed.data.slug } });
    if (slugTaken) {
      return {
        success: false,
        error: { type: "CONFLICT", message: "That slug is already used by another school." },
      };
    }
  }

  await db.school.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      city: parsed.data.city || null,
      logoUrl: parsed.data.logoUrl || null,
      isActive: parsed.data.isActive,
      isVerifiedPartner: parsed.data.isVerifiedPartner,
    },
  });

  revalidateSchoolViews(parsed.data.id, parsed.data.slug);
  if (parsed.data.slug !== current.slug) revalidateSchoolViews(current.id, current.slug);
  return { success: true };
}

export async function createSchoolClassAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSchoolClassSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const existing = await db.schoolClass.findUnique({
    where: { schoolId_name: { schoolId: parsed.data.schoolId, name: parsed.data.name } },
  });
  if (existing) {
    return { success: false, error: { type: "CONFLICT", message: "That class already exists for this school." } };
  }

  const maxSortOrder = await db.schoolClass.aggregate({
    where: { schoolId: parsed.data.schoolId },
    _max: { sortOrder: true },
  });

  const school = await db.school.findUnique({ where: { id: parsed.data.schoolId } });
  await db.schoolClass.create({
    data: {
      schoolId: parsed.data.schoolId,
      name: parsed.data.name,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  revalidateSchoolViews(parsed.data.schoolId, school?.slug);
  return { success: true };
}

export async function deleteSchoolClassAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = deleteSchoolClassSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const schoolClass = await db.schoolClass.findUnique({ where: { id: parsed.data.id } });
  if (!schoolClass) {
    return { success: false, error: { type: "NOT_FOUND", message: "Class not found." } };
  }

  // Assignments/recommended sets scoped to this class cascade-delete
  // (onDelete: Cascade in the schema) — that's the intended behavior: a
  // class-specific rule with no class left to apply to is meaningless, not
  // historical data worth preserving the way orders are.
  await db.schoolClass.delete({ where: { id: parsed.data.id } });

  const school = await db.school.findUnique({ where: { id: schoolClass.schoolId } });
  revalidateSchoolViews(schoolClass.schoolId, school?.slug);
  return { success: true };
}

export async function createAssignmentAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const existing = await db.schoolUniformAssignment.findFirst({
    where: {
      schoolId: parsed.data.schoolId,
      classId: parsed.data.classId,
      gender: parsed.data.gender,
      productId: parsed.data.productId,
    },
  });
  if (existing) {
    return { success: false, error: { type: "CONFLICT", message: "That item is already assigned." } };
  }

  const maxSortOrder = await db.schoolUniformAssignment.aggregate({
    where: { schoolId: parsed.data.schoolId },
    _max: { sortOrder: true },
  });

  await db.schoolUniformAssignment.create({
    data: {
      schoolId: parsed.data.schoolId,
      classId: parsed.data.classId,
      gender: parsed.data.gender,
      productId: parsed.data.productId,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  const school = await db.school.findUnique({ where: { id: parsed.data.schoolId } });
  revalidateSchoolViews(parsed.data.schoolId, school?.slug);
  return { success: true };
}

export async function deleteAssignmentAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = deleteAssignmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const assignment = await db.schoolUniformAssignment.findUnique({ where: { id: parsed.data.id } });
  if (!assignment) {
    return { success: false, error: { type: "NOT_FOUND", message: "Assignment not found." } };
  }

  await db.schoolUniformAssignment.delete({ where: { id: parsed.data.id } });

  const school = await db.school.findUnique({ where: { id: assignment.schoolId } });
  revalidateSchoolViews(assignment.schoolId, school?.slug);
  return { success: true };
}

export type CreateRecommendedSetResult = { success: true; id: string };

export async function createRecommendedSetAction(
  input: unknown,
): Promise<AdminActionResult<CreateRecommendedSetResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createRecommendedSetSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const set = await db.recommendedUniformSet.create({
    data: {
      schoolId: parsed.data.schoolId,
      classId: parsed.data.classId,
      gender: parsed.data.gender,
      name: parsed.data.name,
      description: parsed.data.description || null,
    },
  });

  const school = await db.school.findUnique({ where: { id: parsed.data.schoolId } });
  revalidateSchoolViews(parsed.data.schoolId, school?.slug);
  return { success: true, id: set.id };
}

export async function deleteRecommendedSetAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = deleteRecommendedSetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const set = await db.recommendedUniformSet.findUnique({ where: { id: parsed.data.id } });
  if (!set) {
    return { success: false, error: { type: "NOT_FOUND", message: "Set not found." } };
  }

  await db.recommendedUniformSet.delete({ where: { id: parsed.data.id } });

  const school = await db.school.findUnique({ where: { id: set.schoolId } });
  revalidateSchoolViews(set.schoolId, school?.slug);
  return { success: true };
}

export async function addSetItemAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = addSetItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const set = await db.recommendedUniformSet.findUnique({ where: { id: parsed.data.setId } });
  if (!set) {
    return { success: false, error: { type: "NOT_FOUND", message: "Set not found." } };
  }

  const existing = await db.recommendedUniformSetItem.findUnique({
    where: { setId_productId: { setId: parsed.data.setId, productId: parsed.data.productId } },
  });
  if (existing) {
    return { success: false, error: { type: "CONFLICT", message: "That product is already in this set." } };
  }

  const maxSortOrder = await db.recommendedUniformSetItem.aggregate({
    where: { setId: parsed.data.setId },
    _max: { sortOrder: true },
  });

  await db.recommendedUniformSetItem.create({
    data: {
      setId: parsed.data.setId,
      productId: parsed.data.productId,
      quantity: parsed.data.quantity,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  const school = await db.school.findUnique({ where: { id: set.schoolId } });
  revalidateSchoolViews(set.schoolId, school?.slug);
  return { success: true };
}

export async function removeSetItemAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = removeSetItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const item = await db.recommendedUniformSetItem.findUnique({
    where: { id: parsed.data.id },
    include: { set: true },
  });
  if (!item) {
    return { success: false, error: { type: "NOT_FOUND", message: "Item not found." } };
  }

  await db.recommendedUniformSetItem.delete({ where: { id: parsed.data.id } });

  const school = await db.school.findUnique({ where: { id: item.set.schoolId } });
  revalidateSchoolViews(item.set.schoolId, school?.slug);
  return { success: true };
}
