"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/session";
import {
  adjustInventoryDeltaSchema,
  setInventoryQuantitySchema,
} from "@/lib/validation/admin-inventory";
import {
  adjustInventoryByDelta,
  setInventoryQuantity,
  type InventoryAdjustResult,
} from "@/server/commerce/inventory";

export type AdminActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION"; message: string } };

function revalidateInventoryViews() {
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
}

export async function adjustInventoryByDeltaAction(
  input: unknown,
): Promise<AdminActionResult<InventoryAdjustResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = adjustInventoryDeltaSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const result = await adjustInventoryByDelta({ ...parsed.data, adminUserId: admin.id });
  if (result.success) revalidateInventoryViews();
  return result;
}

export async function setInventoryQuantityAction(
  input: unknown,
): Promise<AdminActionResult<InventoryAdjustResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = setInventoryQuantitySchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const result = await setInventoryQuantity({ ...parsed.data, adminUserId: admin.id });
  if (result.success) revalidateInventoryViews();
  return result;
}
