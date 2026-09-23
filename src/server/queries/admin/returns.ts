import type { ReturnRequestStatus, ReturnRequestType } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";

export type AdminReturnFilters = {
  status?: ReturnRequestStatus;
  type?: ReturnRequestType;
  schoolId?: string;
  /** Inclusive, local-calendar-day bounds — "YYYY-MM-DD", same convention
   * as getAdminOrders (src/server/queries/admin/orders.ts). */
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

// Same list-cap convention as getAdminOrders — a small shop doesn't need
// real pagination yet.
const ADMIN_RETURN_LIST_LIMIT = 200;

/**
 * The Returns dashboard's one list query. Search (section 5 of the brief)
 * covers Return Number, Order Number, Customer Name, Customer ID, Phone
 * (both a normalized exact match and a raw partial match, mirroring
 * `searchCustomers`'s own documented partial-search limitation for
 * displayName/phone), and School — all via one `OR`, never requiring an
 * exact match where the existing convention already supports partial.
 * "Customer" as a distinct filter (section 4) is deliberately NOT a
 * second, separate dropdown — the free-text search above already covers
 * it, and a redundant customer-only filter would just be a second way to
 * do the same thing (documented decision, not an oversight).
 */
export async function getAdminReturnRequests(filters: AdminReturnFilters) {
  const trimmedQuery = filters.query?.trim();
  const normalizedPhone = trimmedQuery ? normalizePhoneNumber(trimmedQuery) : { valid: false as const };

  const createdAtGte = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : undefined;
  const createdAtLt = filters.dateTo
    ? new Date(new Date(`${filters.dateTo}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
    : undefined;

  return db.returnRequest.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.type ? { type: filters.type } : {}),
      ...(filters.schoolId ? { order: { schoolId: filters.schoolId } } : {}),
      ...(createdAtGte || createdAtLt
        ? {
            createdAt: {
              ...(createdAtGte ? { gte: createdAtGte } : {}),
              ...(createdAtLt ? { lt: createdAtLt } : {}),
            },
          }
        : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { returnNumber: { contains: trimmedQuery, mode: "insensitive" as const } },
              { order: { orderNumber: { contains: trimmedQuery, mode: "insensitive" as const } } },
              { customer: { displayName: { contains: trimmedQuery, mode: "insensitive" as const } } },
              { customer: { customerId: { contains: trimmedQuery, mode: "insensitive" as const } } },
              { customer: { primaryPhone: { contains: trimmedQuery } } },
              { order: { school: { name: { contains: trimmedQuery, mode: "insensitive" as const } } } },
              ...(normalizedPhone.valid
                ? [{ customer: { primaryPhoneNormalized: normalizedPhone.normalized } }]
                : []),
            ],
          }
        : {}),
    },
    include: {
      order: { select: { orderNumber: true, school: { select: { name: true } } } },
      customer: { select: { customerId: true, displayName: true, primaryPhone: true } },
      items: { include: { orderItem: true } },
    },
    orderBy: { createdAt: "desc" },
    take: ADMIN_RETURN_LIST_LIMIT,
  });
}

/**
 * Full detail for one request — order context (with its own items, so
 * "Purchased Quantity"/"Already Returned"/"Remaining" can be computed
 * against the live `OrderItem.returnClaimedQuantity`, never a stale
 * snapshot), the acting admin's name for every lifecycle timestamp that
 * is actually set, and the school for display. Unlike the customer-portal
 * equivalent (`getReturnRequestsForOrder`), this is intentionally NOT
 * scoped by customerId — an admin's authorization is `getAdminSession()`
 * itself (checked by the caller), not per-customer ownership.
 *
 * Phase 3.5 Part 4 additions: each item's chosen `replacementVariant`
 * (EXCHANGE only, set once received) and every `inventoryAdjustments` row
 * this request has ever caused — reusing the SAME `InventoryAdjustment`
 * table every other stock movement in this codebase uses (see
 * `returnRequestId` on that model), never a second return-specific audit
 * log. Included with enough of the variant/product snapshot to render
 * "Inventory restored"/"Replacement issued" without a second query.
 *
 * Phase 3.5 Part 5 addition: `overriddenByAdminUser`'s name, for the
 * Timeline/"Admin Override" section — see docs/PHASE_3_5_REPORT.md
 * Part 5 "Admin history".
 */
export async function getAdminReturnRequestByNumber(returnNumber: string) {
  return db.returnRequest.findUnique({
    where: { returnNumber },
    include: {
      order: {
        include: {
          items: { orderBy: { id: "asc" } },
          school: { select: { name: true } },
        },
      },
      customer: { select: { customerId: true, displayName: true, primaryPhone: true } },
      items: {
        include: {
          orderItem: true,
          replacementVariant: { include: { product: { select: { name: true } } } },
        },
      },
      approvedByAdminUser: { select: { name: true } },
      rejectedByAdminUser: { select: { name: true } },
      receivedByAdminUser: { select: { name: true } },
      completedByAdminUser: { select: { name: true } },
      cancelledByAdminUser: { select: { name: true } },
      overriddenByAdminUser: { select: { name: true } },
      inventoryAdjustments: {
        include: { productVariant: { include: { product: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

/**
 * Every Return/Exchange request this Customer has ever made, across
 * every order — for the Return detail page's "Customer History" section
 * (section 14 of the brief). Deliberately NOT order-scoped (unlike
 * `getReturnRequestsForOrder`), since the point here is the customer's
 * full return/exchange history, not just this one order's.
 */
export async function getReturnRequestsForCustomer(customerId: string) {
  return db.returnRequest.findMany({
    where: { customerId },
    include: { order: { select: { orderNumber: true } }, items: { include: { orderItem: true } } },
    orderBy: { createdAt: "desc" },
  });
}
