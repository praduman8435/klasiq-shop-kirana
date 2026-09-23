"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import {
  createSupplierSchema,
  setSupplierActiveSchema,
  updateSupplierSchema,
} from "@/lib/validation/admin-suppliers";

export type AdminActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND"; message: string } };

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

function revalidateSupplierViews(supplierId?: string) {
  revalidatePath("/admin/suppliers");
  if (supplierId) revalidatePath(`/admin/suppliers/${supplierId}`);
}

export type CreateSupplierResult = { success: true; id: string };

export async function createSupplierAction(input: unknown): Promise<AdminActionResult<CreateSupplierResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  // No uniqueness check on name/phone/GST — see Supplier's own schema doc
  // comment (prisma/schema.prisma) for why: two distinct suppliers can
  // legitimately share a phone number, and business names are not a
  // dedup key this feature needs yet.
  const supplier = await db.supplier.create({
    data: {
      name: parsed.data.name,
      businessName: parsed.data.businessName || null,
      phone: parsed.data.phone || null,
      addressLine: parsed.data.addressLine || null,
      city: parsed.data.city || null,
      gstNumber: parsed.data.gstNumber || null,
      notes: parsed.data.notes || null,
      isActive: parsed.data.isActive,
    },
  });

  revalidateSupplierViews(supplier.id);
  return { success: true, id: supplier.id };
}

export async function updateSupplierAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateSupplierSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const current = await db.supplier.findUnique({ where: { id: parsed.data.id } });
  if (!current) {
    return { success: false, error: { type: "NOT_FOUND", message: "Supplier not found." } };
  }

  await db.supplier.update({
    where: { id: parsed.data.id },
    data: {
      name: parsed.data.name,
      businessName: parsed.data.businessName || null,
      phone: parsed.data.phone || null,
      addressLine: parsed.data.addressLine || null,
      city: parsed.data.city || null,
      gstNumber: parsed.data.gstNumber || null,
      notes: parsed.data.notes || null,
      isActive: parsed.data.isActive,
    },
  });

  revalidateSupplierViews(parsed.data.id);
  return { success: true };
}

/**
 * Section 16/17 — deactivate, never delete. A Supplier has no hard-delete
 * action anywhere in this codebase: future Purchases/Payments will
 * reference a supplier by id, and destroying that row would destroy their
 * accounting trail. Deactivating only changes whether the supplier is
 * offered as a default going forward (once Purchase creation exists in a
 * later Part) — it never removes the record itself.
 */
export async function setSupplierActiveAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = setSupplierActiveSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const supplier = await db.supplier.findUnique({ where: { id: parsed.data.id } });
  if (!supplier) {
    return { success: false, error: { type: "NOT_FOUND", message: "Supplier not found." } };
  }

  await db.supplier.update({ where: { id: parsed.data.id }, data: { isActive: parsed.data.isActive } });

  revalidateSupplierViews(parsed.data.id);
  return { success: true };
}
