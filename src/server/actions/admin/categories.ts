"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import {
  createCategorySchema,
  deleteCategorySchema,
  updateCategorySchema,
} from "@/lib/validation/admin-categories";

export type AdminActionResult<T> =
  | T
  | {
      success: false;
      error: { type: "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND" | "CONFLICT"; message: string };
    };

async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      unauthorized: {
        success: false as const,
        error: { type: "UNAUTHORIZED" as const, message: "Please sign in again." },
      },
    };
  }
  return { unauthorized: null };
}

function revalidateCategoryViews() {
  revalidatePath("/admin/categories");
  revalidatePath("/admin/products");
  revalidatePath("/admin/inventory");
  revalidatePath("/", "layout");
}

/**
 * Section 11 — "duplicate header order conflicts" is checked ONLY among
 * OTHER categories that are ALSO currently `displayInHeader: true` (a
 * hidden category's stale `headerOrder` is inert and can never conflict
 * with anything — see the schema's own doc comment). Returns the
 * conflicting category's name so the admin gets an actionable message,
 * never a bare "conflict."
 */
async function findHeaderOrderConflict(params: {
  displayInHeader: boolean;
  headerOrder: number;
  excludeId?: string;
}): Promise<string | null> {
  if (!params.displayInHeader) return null;
  const conflict = await db.category.findFirst({
    where: {
      displayInHeader: true,
      headerOrder: params.headerOrder,
      ...(params.excludeId ? { id: { not: params.excludeId } } : {}),
    },
    select: { name: true },
  });
  return conflict?.name ?? null;
}

/**
 * Section 11 — "review whether duplicate display names should be
 * allowed." Decision: NOT allowed (case-insensitive). A category name is
 * the exact text a shopper sees as a header link and an admin sees in
 * the category list — two categories sharing one name would be a real,
 * avoidable point of confusion in both places (which "Uniforms" does a
 * customer just clicked?), unlike the slug, which is already the
 * enforced-unique true identity. See docs/PHASE_3_6_7_REPORT.md
 * "Validation" for the full reasoning.
 */
async function findNameConflict(name: string, excludeId?: string): Promise<boolean> {
  const conflict = await db.category.findFirst({
    where: {
      name: { equals: name, mode: "insensitive" },
      ...(excludeId ? { id: { not: excludeId } } : {}),
    },
    select: { id: true },
  });
  return conflict !== null;
}

export async function createCategoryAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const existing = await db.category.findUnique({ where: { slug: parsed.data.slug } });
  if (existing) {
    return { success: false, error: { type: "CONFLICT", message: "That slug is already in use." } };
  }

  if (await findNameConflict(parsed.data.name)) {
    return { success: false, error: { type: "CONFLICT", message: "A category with that name already exists." } };
  }

  const conflictingCategoryName = await findHeaderOrderConflict({
    displayInHeader: parsed.data.displayInHeader,
    headerOrder: parsed.data.headerOrder,
  });
  if (conflictingCategoryName) {
    return {
      success: false,
      error: {
        type: "CONFLICT",
        message: `Header order ${parsed.data.headerOrder} is already used by "${conflictingCategoryName}".`,
      },
    };
  }

  const maxSortOrder = await db.category.aggregate({ _max: { sortOrder: true } });
  await db.category.create({
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      displayInHeader: parsed.data.displayInHeader,
      headerOrder: parsed.data.headerOrder,
      sortOrder: (maxSortOrder._max.sortOrder ?? -1) + 1,
    },
  });

  revalidateCategoryViews();
  return { success: true };
}

export async function updateCategoryAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateCategorySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const current = await db.category.findUnique({ where: { id: parsed.data.id } });
  if (!current) {
    return { success: false, error: { type: "NOT_FOUND", message: "Category not found." } };
  }

  if (parsed.data.slug !== current.slug) {
    const slugTaken = await db.category.findUnique({ where: { slug: parsed.data.slug } });
    if (slugTaken) {
      return { success: false, error: { type: "CONFLICT", message: "That slug is already in use." } };
    }
  }

  if (await findNameConflict(parsed.data.name, parsed.data.id)) {
    return { success: false, error: { type: "CONFLICT", message: "A category with that name already exists." } };
  }

  const conflictingCategoryName = await findHeaderOrderConflict({
    displayInHeader: parsed.data.displayInHeader,
    headerOrder: parsed.data.headerOrder,
    excludeId: parsed.data.id,
  });
  if (conflictingCategoryName) {
    return {
      success: false,
      error: {
        type: "CONFLICT",
        message: `Header order ${parsed.data.headerOrder} is already used by "${conflictingCategoryName}".`,
      },
    };
  }

  await db.category.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      slug: parsed.data.slug,
      description: parsed.data.description || null,
      displayInHeader: parsed.data.displayInHeader,
      headerOrder: parsed.data.headerOrder,
    },
  });

  revalidateCategoryViews();
  return { success: true };
}

export async function deleteCategoryAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = deleteCategorySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const category = await db.category.findUnique({ where: { id: parsed.data.id } });
  if (!category) {
    return { success: false, error: { type: "NOT_FOUND", message: "Category not found." } };
  }

  const productCount = await db.product.count({ where: { categoryId: parsed.data.id } });
  if (productCount > 0) {
    return {
      success: false,
      error: {
        type: "CONFLICT",
        message: `This category has ${productCount} product${productCount === 1 ? "" : "s"} — move or remove them first.`,
      },
    };
  }

  await db.category.delete({ where: { id: parsed.data.id } });
  revalidateCategoryViews();
  return { success: true };
}
