"use server";

import { z } from "zod";
import { getAdminSession } from "@/lib/admin/session";
import { sendInvoiceWhatsApp, type SendInvoiceWhatsAppResult } from "@/server/commerce/send-invoice";

export type AdminActionResult<T> = T | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION"; message: string } };

const sendInvoiceWhatsAppSchema = z.object({ orderNumber: z.string().trim().min(1) });

/**
 * Section 10 — Admin may send any invoice. Requires `getAdminSession()`,
 * the same authorization gate every other admin-mutating Server Action in
 * this codebase re-checks itself (mirrors `updateOrderStatusAction` in
 * `src/server/actions/admin/orders.ts`) — a client already holding a
 * reference to this action could otherwise call it directly, bypassing
 * the `(protected)` layout's own gate, which only ever covers page
 * renders, not Server Action invocations.
 *
 * This is the ONLY Server Action in this codebase that can reach
 * `sendInvoiceWhatsApp` — there is no customer-portal equivalent (see
 * docs/PHASE_3_6_6_REPORT.md Part 3 "Customer Portal"), so "Customer may
 * only send their own invoice" is satisfied structurally: no code path
 * exists for a customer session to trigger this at all, for any order.
 */
export async function sendInvoiceWhatsAppAction(
  input: unknown,
): Promise<AdminActionResult<SendInvoiceWhatsAppResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = sendInvoiceWhatsAppSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  return sendInvoiceWhatsApp(parsed.data.orderNumber);
}
