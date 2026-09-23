"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getAdminSession } from "@/lib/admin/session";
import { anonymizeCustomer, type AnonymizeCustomerResult } from "@/server/commerce/customer";

export type AdminActionResult<T> = T | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION"; message: string } };

const anonymizeCustomerSchema = z.object({ id: z.string().trim().min(1) });

/**
 * Personal-data audit (2026-08-10) — the one admin-facing entry point for
 * "delete/anonymize this customer's data" (see
 * src/server/commerce/customer.ts's `anonymizeCustomer` for exactly what
 * is and isn't erased, and why). Admin-only: requires `getAdminSession()`,
 * the same re-check every other admin-mutating Server Action in this
 * codebase performs itself — Route Handlers/Server Actions are never
 * covered by the `(protected)` layout's own gate, which only wraps page
 * renders.
 */
export async function anonymizeCustomerAction(
  input: unknown,
): Promise<AdminActionResult<AnonymizeCustomerResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = anonymizeCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const result = await anonymizeCustomer(parsed.data.id);
  if (result.success) {
    revalidatePath("/admin/khatabook");
    revalidatePath("/", "layout");
  }
  return result;
}
