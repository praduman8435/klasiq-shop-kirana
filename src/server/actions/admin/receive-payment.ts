"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/session";
import { receivePaymentSchema } from "@/lib/validation/admin-khatabook";
import { receivePayment, type ReceivePaymentResult } from "@/server/commerce/receive-payment";

export type AdminKhataBookActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION"; message: string } };

/**
 * The one Server Action behind the "Receive Payment" dialog (section 2).
 * Mirrors `createCounterSaleAction`'s exact shape
 * (src/server/actions/admin/counter-sale.ts): resolve `getAdminSession()`
 * first and reject before ever touching `input`, validate, then delegate
 * to the domain function with `adminUserId` resolved from the verified
 * session — never from client input, since there is no such field in
 * `receivePaymentSchema` for a client to supply.
 *
 * Revalidates the customer's KhataBook profile (Outstanding/Ledger just
 * changed), the specific order's Admin Order Detail page (its own
 * Received/Outstanding display — Part 3 — just changed too), and the
 * Orders list (its payment-status filter/badge).
 */
export async function receivePaymentAction(
  input: unknown,
): Promise<AdminKhataBookActionResult<ReceivePaymentResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = receivePaymentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const result = await receivePayment({ ...parsed.data, adminUserId: admin.id });
  if (result.success) {
    revalidatePath(`/admin/khatabook/${parsed.data.customerId}`);
    revalidatePath(`/admin/orders/${result.orderNumber}`);
    revalidatePath("/admin/orders");
    revalidatePath("/admin/khatabook");
  }
  return result;
}
