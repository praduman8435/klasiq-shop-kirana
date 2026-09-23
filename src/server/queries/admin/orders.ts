import type { FulfillmentType, OrderSource, OrderStatus, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type AdminOrderFilters = {
  status?: OrderStatus;
  paymentStatus?: PaymentStatus;
  fulfillmentType?: FulfillmentType;
  source?: OrderSource;
  /** Inclusive, local-calendar-day bounds — "YYYY-MM-DD". See below for how
   * each becomes a createdAt bound. */
  dateFrom?: string;
  dateTo?: string;
  query?: string;
};

// A small shop doesn't need pagination UI yet — capping the list keeps the
// page fast and avoids ever silently rendering an unbounded table.
const ADMIN_ORDER_LIST_LIMIT = 200;

export async function getAdminOrders(filters: AdminOrderFilters) {
  const trimmedQuery = filters.query?.trim();

  // dateFrom is the start of that calendar day; dateTo is the start of the
  // NEXT calendar day (an exclusive upper bound), so "dateTo: 2026-08-04"
  // includes every order created any time on the 4th, not just at midnight.
  const createdAtGte = filters.dateFrom ? new Date(`${filters.dateFrom}T00:00:00.000Z`) : undefined;
  const createdAtLt = filters.dateTo
    ? new Date(new Date(`${filters.dateTo}T00:00:00.000Z`).getTime() + 24 * 60 * 60 * 1000)
    : undefined;

  return db.order.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.paymentStatus ? { paymentStatus: filters.paymentStatus } : {}),
      ...(filters.fulfillmentType ? { fulfillmentType: filters.fulfillmentType } : {}),
      ...(filters.source ? { source: filters.source } : {}),
      ...(createdAtGte || createdAtLt
        ? { createdAt: { ...(createdAtGte ? { gte: createdAtGte } : {}), ...(createdAtLt ? { lt: createdAtLt } : {}) } }
        : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { orderNumber: { contains: trimmedQuery, mode: "insensitive" as const } },
              { customerName: { contains: trimmedQuery, mode: "insensitive" as const } },
              { customerMobile: { contains: trimmedQuery } },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
    take: ADMIN_ORDER_LIST_LIMIT,
  });
}

export async function getAdminOrderByNumber(orderNumber: string) {
  return db.order.findUnique({
    where: { orderNumber },
    include: {
      items: { orderBy: { id: "asc" } },
      school: { select: { name: true } },
      customer: { select: { customerId: true, displayName: true } },
      createdByAdminUser: { select: { name: true } },
      inventoryAdjustments: { orderBy: { createdAt: "desc" } },
    },
  });
}
