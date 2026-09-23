"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/session";
import {
  createWalkInReturnRequestSchema,
  receiveReturnRequestSchema,
  updateReturnRequestAdminNoteSchema,
  updateReturnRequestStatusSchema,
} from "@/lib/validation/admin-returns";
import {
  updateReturnRequestAdminNote,
  updateReturnRequestStatus,
  type ReturnStatusTransitionResult,
  type UpdateAdminNoteResult,
} from "@/server/commerce/admin-returns";
import { receiveReturnRequest, type ReceiveReturnRequestResult } from "@/server/commerce/return-fulfillment";
import { createReturnRequest, type CreateReturnRequestResult } from "@/server/commerce/returns";
import { getOrdersForAuthenticatedCustomer } from "@/server/queries/customer-portal/orders";
import { getReturnableItemsForOrder } from "@/server/queries/customer-portal/returns";

export type AdminReturnActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION"; message: string } };

function revalidateReturnViews(returnNumber: string) {
  revalidatePath("/admin/returns");
  revalidatePath(`/admin/returns/${returnNumber}`);
}

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

/**
 * The one Server Action every Return status-transition button
 * (Approve/Reject/Cancel) calls — mirrors `updateOrderStatusAction`'s
 * shape exactly (src/server/actions/admin/orders.ts): resolve
 * `getAdminSession()` first and reject before ever touching `input` if
 * it's missing, validate, then delegate to the domain function with
 * `adminUserId` resolved from the verified session — never from `input`
 * (there is no such field in the schema for a client to supply). This is
 * also the entire enforcement of section 18's "Customers cannot modify
 * ReturnRequest status" — the customer session cookie is a different
 * cookie entirely (`klasiq_customer_session`) that `getAdminSession()`
 * never reads, so a customer session grants nothing here even in
 * principle. As of Phase 3.5 Part 4, Receive/Complete are NOT reachable
 * through this action at all — see `receiveReturnRequestAction` below.
 */
export async function updateReturnRequestStatusAction(
  input: unknown,
): Promise<AdminReturnActionResult<ReturnStatusTransitionResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = updateReturnRequestStatusSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const result = await updateReturnRequestStatus({ ...parsed.data, adminUserId: admin.id });
  if (result.success) revalidateReturnViews(parsed.data.returnNumber);
  return result;
}

/** Same admin-only authorization shape, for the free-text internal note. */
export async function updateReturnRequestAdminNoteAction(
  input: unknown,
): Promise<AdminReturnActionResult<UpdateAdminNoteResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = updateReturnRequestAdminNoteSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const result = await updateReturnRequestAdminNote(parsed.data);
  if (result.success) revalidateReturnViews(parsed.data.returnNumber);
  return result;
}

/**
 * The Receive Return action — the only path that reconciles inventory
 * (see `receiveReturnRequest`, src/server/commerce/return-fulfillment.ts).
 * Also revalidates `/admin/inventory` on success, mirroring
 * `createCounterSaleAction`'s own precedent for any action that changes
 * stock — an admin viewing the Inventory page right after receiving a
 * return sees the updated quantity without a manual refresh.
 */
export async function receiveReturnRequestAction(
  input: unknown,
): Promise<AdminReturnActionResult<ReceiveReturnRequestResult>> {
  const admin = await getAdminSession();
  if (!admin) {
    return { success: false, error: { type: "UNAUTHORIZED", message: "Please sign in again." } };
  }

  const parsed = receiveReturnRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const result = await receiveReturnRequest({ ...parsed.data, adminUserId: admin.id });
  if (result.success) {
    revalidateReturnViews(parsed.data.returnNumber);
    revalidatePath("/admin/inventory");
  }
  return result;
}

export type WalkInCustomerOrdersResult = {
  success: true;
  orders: Awaited<ReturnType<typeof getOrdersForAuthenticatedCustomer>>;
};

/**
 * Section 5 "Walk-in returns" — step 2, "Search Order": every order
 * belonging to the customer the admin already selected, reusing
 * `getOrdersForAuthenticatedCustomer` (Phase 3.4 Part 2) unchanged. Safe
 * to call with any `customerId` under an admin session — that function's
 * only input is the id itself, and here the caller IS the authorization
 * (`getAdminSession()`), unlike the customer portal's own use of it (where
 * the id must come from the verified session, never a parameter).
 */
export async function getCustomerOrdersForWalkInAction(
  customerId: string,
): Promise<AdminReturnActionResult<WalkInCustomerOrdersResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  if (!customerId.trim()) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid customer." } };
  }

  const orders = await getOrdersForAuthenticatedCustomer(customerId);
  return { success: true, orders };
}

export type WalkInReturnableItemsResult = {
  success: true;
  items: Awaited<ReturnType<typeof getReturnableItemsForOrder>>;
};

/** Section 5 — step 3, "Open Return": reuses `getReturnableItemsForOrder` (Part 1) unchanged. */
export async function getReturnableItemsForWalkInAction(input: {
  orderNumber: string;
  customerId: string;
}): Promise<AdminReturnActionResult<WalkInReturnableItemsResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  if (!input.orderNumber.trim() || !input.customerId.trim()) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const items = await getReturnableItemsForOrder(input.orderNumber, input.customerId);
  return { success: true, items };
}

/**
 * Section 5/6 "Walk-in returns" — "No separate workflow. Reuse the same
 * ReturnRequest." This calls the EXACT SAME `createReturnRequest`
 * (Phase 3.5 Part 1/2) the customer portal's own action calls — zero new
 * domain logic. The only thing that differs from the customer-portal path
 * is WHERE `customerId` comes from: there, the verified session; here,
 * the customer the admin explicitly searched for and selected (mirroring
 * `createCounterSaleAction`'s own established "admin picks an EXISTING
 * customer via search" precedent, src/server/actions/admin/counter-sale.ts)
 * — never free-typed, always a real `Customer.id` returned by
 * `searchCustomersForCounterSaleAction`'s own search. `createReturnRequest`
 * itself re-validates that `orderNumber` truly belongs to `customerId` and
 * re-validates full eligibility server-side regardless of who calls it —
 * the same authoritative guarantee Part 1 already established.
 *
 * `overrideReason` (Phase 3.5 Part 5, Admin Override), when present, is
 * translated into `createReturnRequest`'s `override` parameter here —
 * `adminUserId` is resolved from THIS action's own verified
 * `getAdminSession()` call, never from `input`, exactly like every other
 * audit-actor field in this feature.
 */
export async function createWalkInReturnRequestAction(
  input: unknown,
): Promise<AdminReturnActionResult<CreateReturnRequestResult>> {
  const { admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createWalkInReturnRequestSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const { overrideReason, ...rest } = parsed.data;
  const result = await createReturnRequest({
    ...rest,
    ...(overrideReason ? { override: { reason: overrideReason, adminUserId: admin.id } } : {}),
  });
  if (result.success) {
    revalidatePath("/admin/returns");
  }
  return result;
}
