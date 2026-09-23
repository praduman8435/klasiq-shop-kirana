"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/session";
import { updateOrderStatusSchema, updatePaymentStatusSchema } from "@/lib/validation/admin-orders";
import {
  updateOrderStatus,
  updatePaymentStatus,
  type OrderTransitionResult,
  type PaymentTransitionResult,
} from "@/server/commerce/update-order-status";

export type AdminActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION"; message: string } };

function revalidateOrderViews(orderNumber: string) {
  revalidatePath("/admin/orders");
  revalidatePath(`/admin/orders/${orderNumber}`);
  revalidatePath("/admin");
}

export async function updateOrderStatusAction(
  input: unknown,
): Promise<AdminActionResult<OrderTransitionResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = updateOrderStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const result = await updateOrderStatus({ ...parsed.data, adminUserId: admin.id });
  if (result.success) revalidateOrderViews(parsed.data.orderNumber);
  return result;
}

export async function updatePaymentStatusAction(
  input: unknown,
): Promise<AdminActionResult<PaymentTransitionResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = updatePaymentStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const result = await updatePaymentStatus(parsed.data);
  if (result.success) revalidateOrderViews(parsed.data.orderNumber);
  return result;
}
