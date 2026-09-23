"use server";

import type { Customer } from "@prisma/client";
import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/session";
import {
  counterSaleCustomerSearchSchema,
  counterSaleProductSearchSchema,
  createCounterSaleCustomerSchema,
  createCounterSaleSchema,
} from "@/lib/validation/admin-counter-sale";
import { createCounterSale, type CreateCounterSaleResult } from "@/server/commerce/counter-sale";
import { createCustomerInline } from "@/server/commerce/customer";
import { searchSellableVariants } from "@/server/queries/admin/counter-sale";
import { getRecentCustomers, searchCustomers } from "@/server/queries/admin/customers";

export type AdminActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION"; message: string } };

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

export type SearchVariantsResult = {
  success: true;
  variants: Awaited<ReturnType<typeof searchSellableVariants>>;
};

export async function searchSellableVariantsAction(
  input: unknown,
): Promise<AdminActionResult<SearchVariantsResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = counterSaleProductSearchSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid search." } };
  }

  const variants = await searchSellableVariants(parsed.data.query);
  return { success: true, variants };
}

export type SearchCustomersResult = {
  success: true;
  customers: Awaited<ReturnType<typeof searchCustomers>>;
};

export async function searchCustomersForCounterSaleAction(
  input: unknown,
): Promise<AdminActionResult<SearchCustomersResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = counterSaleCustomerSearchSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid search." } };
  }

  const customers = await searchCustomers(parsed.data.query);
  return { success: true, customers };
}

/** The shape both search results and a freshly-created customer share —
 * `CustomerSearchResult` on the client (src/components/admin/counter-sale-customer-panel.tsx).
 * Phase 3.6.6 Part 1 — the four address fields are included so the
 * client can offer "Use Saved Address" only when one genuinely exists,
 * without a second round-trip; the actual snapshot written to the Order
 * is always re-resolved server-side from a fresh read, never trusted
 * from this client-facing shape (see docs/PHASE_3_6_6_REPORT.md Part 1
 * "Security"). */
function toCounterSaleCustomerResult(customer: Customer) {
  return {
    id: customer.id,
    customerId: customer.customerId,
    displayName: customer.displayName,
    primaryPhone: customer.primaryPhone,
    lastOrderAt: customer.lastOrderAt,
    addressLine: customer.addressLine,
    addressCity: customer.addressCity,
    addressState: customer.addressState,
    addressPincode: customer.addressPincode,
  };
}

export type RecentCustomersResult = {
  success: true;
  customers: ReturnType<typeof toCounterSaleCustomerResult>[];
};

/** Section 9 "Recent Customers" — a lightweight, no-input read reusing
 * `getRecentCustomers` (src/server/queries/admin/customers.ts) unchanged. */
export async function getRecentCustomersForCounterSaleAction(): Promise<
  AdminActionResult<RecentCustomersResult>
> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const customers = await getRecentCustomers();
  return { success: true, customers: customers.map(toCounterSaleCustomerResult) };
}

export type CreateCounterSaleCustomerResult =
  | { success: true; customer: ReturnType<typeof toCounterSaleCustomerResult> }
  | { success: false; error: { type: "VALIDATION" | "INVALID_PHONE"; message: string } };

/**
 * Section 7 "Customer not found" — the inline create form's one action.
 * All the actual customer-domain logic (find-or-create by phone, the
 * "never overwrite an existing customer's data" guarantee, the optional
 * WhatsApp number) lives in `createCustomerInline`
 * (src/server/commerce/customer.ts) — this action is only auth +
 * validation + delegation, the same thin shape every other admin action in
 * this codebase already has.
 */
export async function createCounterSaleCustomerAction(
  input: unknown,
): Promise<AdminActionResult<CreateCounterSaleCustomerResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createCounterSaleCustomerSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const result = await createCustomerInline(parsed.data);
  if (!result.success) {
    return { success: false, error: { type: "INVALID_PHONE", message: result.error.message } };
  }

  return { success: true, customer: toCounterSaleCustomerResult(result.customer) };
}

export async function createCounterSaleAction(
  input: unknown,
): Promise<AdminActionResult<CreateCounterSaleResult>> {
  const { admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createCounterSaleSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const result = await createCounterSale({ ...parsed.data, adminUserId: admin.id });
  if (result.success) {
    revalidatePath("/admin/orders");
    revalidatePath("/admin/inventory");
    revalidatePath("/admin");
  }
  return result;
}
