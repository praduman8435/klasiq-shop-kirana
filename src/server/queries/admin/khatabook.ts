import type { OrderSource, OrderStatus, PaymentMethod, PaymentStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { buildCustomerSearchWhere, getRecentCustomers, searchCustomers } from "@/server/queries/admin/customers";

// A small shop doesn't need real pagination yet — same convention as
// getAdminOrders/getAdminReturnRequests (src/server/queries/admin/
// orders.ts, returns.ts). One customer's own purchase history is bounded
// by how many times they've ever bought from this shop, which in practice
// stays well under this cap even for a shop's most loyal customer.
const KHATABOOK_PURCHASE_HISTORY_LIMIT = 500;

// Phase 3.6.5 Part 5 — same "small shop doesn't need real pagination yet"
// convention as Purchase History above; a customer's own payment receipts
// are bounded by how many times they've ever paid down a balance, which
// in practice stays well under this cap too.
const KHATABOOK_LEDGER_LIMIT = 500;

export type KhataBookCustomerListRow = {
  id: string;
  customerId: string;
  displayName: string | null;
  primaryPhone: string | null;
  lastOrderAt: Date | null;
  outstandingInPaise: number;
  lifetimePurchaseInPaise: number;
};

/**
 * Attaches Outstanding Balance + Lifetime Purchase Total to a list of bare
 * Customer rows, via ONE `groupBy` aggregate query keyed by `customerId` —
 * never a query per customer (section 9, "avoid N+1 queries; prefer
 * aggregation over repeated queries"). Both figures reuse Phase 3.6.5 Part
 * 3's own `Order.outstandingInPaise`/`totalInPaise` fields directly — no
 * new calculation invented, just summed across each customer's orders.
 * A customer with no orders at all (matched by name/phone/ID but never
 * having purchased) correctly gets ₹0/₹0, not an error.
 */
async function attachKhataBookAggregates(
  customers: Array<{
    id: string;
    customerId: string;
    displayName: string | null;
    primaryPhone: string | null;
    lastOrderAt: Date | null;
  }>,
): Promise<KhataBookCustomerListRow[]> {
  if (customers.length === 0) return [];

  const ids = customers.map((c) => c.id);
  const aggregates = await db.order.groupBy({
    by: ["customerId"],
    where: { customerId: { in: ids } },
    _sum: { totalInPaise: true, outstandingInPaise: true },
  });
  const byCustomerId = new Map(
    aggregates.filter((a) => a.customerId !== null).map((a) => [a.customerId as string, a]),
  );

  return customers.map((c) => {
    const agg = byCustomerId.get(c.id);
    return {
      id: c.id,
      customerId: c.customerId,
      displayName: c.displayName,
      primaryPhone: c.primaryPhone,
      lastOrderAt: c.lastOrderAt,
      outstandingInPaise: agg?._sum.outstandingInPaise ?? 0,
      lifetimePurchaseInPaise: agg?._sum.totalInPaise ?? 0,
    };
  });
}

/**
 * KhataBook's search — deliberately just a thin wrapper around the
 * EXISTING `searchCustomers` (src/server/queries/admin/customers.ts,
 * Phase 3.6.5 Part 1), which already covers Customer ID, Name, and Mobile
 * Number via one unified `OR` (section 3: "reuse the existing customer
 * search infrastructure ... do not duplicate search logic"). This function
 * adds nothing to the search itself — only the Outstanding/Lifetime
 * augmentation KhataBook's results view needs on top of it.
 */
export async function searchKhataBookCustomers(query: string): Promise<KhataBookCustomerListRow[]> {
  const customers = await searchCustomers(query);
  return attachKhataBookAggregates(customers);
}

/**
 * The KhataBook landing view's default (no search typed yet) — reuses
 * `getRecentCustomers` (same file, same Part 1 precedent) rather than
 * inventing a new "browse all customers" or "customers with a balance"
 * query. Gives the page something useful to show immediately instead of a
 * bare empty state, at zero extra query-logic cost.
 */
export async function getRecentKhataBookCustomers(): Promise<KhataBookCustomerListRow[]> {
  const customers = await getRecentCustomers();
  return attachKhataBookAggregates(customers);
}

export type KhataBookDirectoryFilter = "ALL" | "RECENTLY_ACTIVE" | "OUTSTANDING";

const KHATABOOK_DIRECTORY_PAGE_SIZE = 25;

export type KhataBookDirectoryResult = {
  customers: KhataBookCustomerListRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

/**
 * The actual customer DIRECTORY — every customer, paginated, not the "a
 * few recently used" quick-pick `getRecentCustomers` was built for
 * (Counter Sale's own customer panel; see that function's own doc
 * comment). The KhataBook landing page previously called
 * `getRecentKhataBookCustomers` (which just wraps `getRecentCustomers`)
 * as its DEFAULT view, which is why it only ever showed 5 customers —
 * that function's `take: 5` was never meant to be a directory's main
 * listing, only a small "recently used" shortcut. This is a genuinely
 * new, separate query for a genuinely different purpose; the old
 * function is untouched and still correctly serves whatever still wants
 * "a few recent customers" (Counter Sale, and its own existing tests).
 *
 * Search reuses `buildCustomerSearchWhere` — the exact same Customer
 * ID/Name/Mobile match `searchCustomers` already uses — so this never
 * invents a second, subtly-different search rule. Both `search` and
 * `filter` narrow the SAME paginated query (not a separate branch that
 * loses pagination), so `totalCount`/`totalPages` always reflect the
 * actual filtered set.
 *
 * The `OUTSTANDING` filter needs the set of customer ids with a
 * currently-positive summed balance — computed with one `groupBy` +
 * `having` (never a query per customer, never a full table scan
 * filtered in memory), reusing the exact same `Order.outstandingInPaise`
 * field `attachKhataBookAggregates` already sums for display. This
 * mirrors that function's own aggregation, just with a `having` clause
 * instead of a bare sum.
 */
export async function getKhataBookCustomerDirectory(params: {
  query?: string;
  filter?: KhataBookDirectoryFilter;
  page?: number;
}): Promise<KhataBookDirectoryResult> {
  const pageSize = KHATABOOK_DIRECTORY_PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);
  const trimmedQuery = params.query?.trim();
  const filter = params.filter ?? "ALL";

  let outstandingCustomerIds: string[] | null = null;
  if (filter === "OUTSTANDING") {
    const grouped = await db.order.groupBy({
      by: ["customerId"],
      _sum: { outstandingInPaise: true },
      having: { outstandingInPaise: { _sum: { gt: 0 } } },
    });
    outstandingCustomerIds = grouped
      .map((g) => g.customerId)
      .filter((id): id is string => id !== null);
  }

  const where: Prisma.CustomerWhereInput = {
    ...(trimmedQuery ? buildCustomerSearchWhere(trimmedQuery) : {}),
    ...(filter === "RECENTLY_ACTIVE" ? { lastOrderAt: { not: null } } : {}),
    ...(outstandingCustomerIds ? { id: { in: outstandingCustomerIds } } : {}),
  };

  // "Recently active" already excludes every null `lastOrderAt`, so
  // sorting by it there is unambiguous. The other two views can contain
  // customers who have never ordered (`lastOrderAt: null`), where SQL's
  // default NULL placement for a `DESC` sort would put them FIRST —
  // confusing for a directory. `createdAt desc` sidesteps that ambiguity
  // entirely rather than depending on a specific NULLS FIRST/LAST setting.
  const orderBy: Prisma.CustomerOrderByWithRelationInput[] =
    filter === "RECENTLY_ACTIVE" ? [{ lastOrderAt: "desc" }] : [{ createdAt: "desc" }];

  const [totalCount, customers] = await Promise.all([
    db.customer.count({ where }),
    db.customer.findMany({
      where,
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    }),
  ]);

  const rows = await attachKhataBookAggregates(customers);

  return {
    customers: rows,
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export type KhataBookPurchaseHistoryRow = {
  orderNumber: string;
  createdAt: Date;
  source: OrderSource;
  totalInPaise: number;
  amountReceivedInPaise: number;
  outstandingInPaise: number;
  paymentStatus: PaymentStatus;
  status: OrderStatus;
};

/**
 * Phase 3.6.5 Part 5 — one row per `PaymentReceipt`, the permanent record
 * of a single collected payment (section 4, "Ledger should always
 * explain how the balance reached its current value"). `outstandingBeforeInPaise`/
 * `outstandingAfterInPaise` are the ORDER's own immutable snapshots at the
 * moment this receipt was created — never recomputed here, so the ledger
 * never needs to replay every prior receipt to explain one row.
 */
export type KhataBookLedgerRow = {
  id: string;
  createdAt: Date;
  orderNumber: string;
  amountInPaise: number;
  paymentMethod: PaymentMethod;
  note: string | null;
  outstandingBeforeInPaise: number;
  outstandingAfterInPaise: number;
  createdByAdminName: string | null;
};

export type KhataBookCustomerProfile = {
  customer: {
    id: string;
    customerId: string;
    displayName: string | null;
    primaryPhone: string | null;
    whatsappPhone: string | null;
    lastOrderAt: Date | null;
    createdAt: Date;
  };
  summary: {
    /** Sum of every order's totalInPaise for this customer — mirrors
     * getDashboardStats's own existing precedent (src/server/queries/
     * admin/dashboard.ts) of not excluding CANCELLED orders from a total,
     * rather than inventing a new, different revenue-exclusion rule here. */
    lifetimePurchaseInPaise: number;
    totalOrders: number;
    /** Sum of Order.outstandingInPaise (Phase 3.6.5 Part 3) across every
     * order — the customer's total tracked Khata credit. */
    outstandingInPaise: number;
    /** Count of orders with outstandingInPaise > 0 — section 7's "Number
     * of Unpaid Orders". */
    unpaidOrderCount: number;
    returnCount: number;
    exchangeCount: number;
    /** Section 8 — a genuinely useful, zero-extra-query addition: plain
     * arithmetic over figures already computed above, not a new lookup. */
    averageOrderValueInPaise: number;
  };
  orders: KhataBookPurchaseHistoryRow[];
  /** Section 6 — kept as its own array, deliberately separate from
   * `orders` (Purchase History): "Keep Purchase History separate." */
  ledger: KhataBookLedgerRow[];
};

/**
 * The KhataBook customer profile — one customer lookup, then five
 * independent aggregate/list queries issued in parallel, ALL scoped by a
 * single `customerId`. Every one of the five is O(1) in query COUNT
 * regardless of how many orders/returns/receipts that customer has —
 * none contains a loop issuing one query per row. (The Ledger query's
 * nested `order`/`createdByAdminUser` selects each add one further
 * Prisma-batched `WHERE id IN (...)` round-trip rather than a SQL JOIN,
 * since this schema doesn't enable the `relationJoins` preview feature —
 * so a real run typically measures ~8 total queries, not exactly five.
 * That batching is itself still O(1): Phase 3.6.5 Part 6's production
 * acceptance audit confirmed it collapses to one `IN (...)` per distinct
 * related id, never one query per Ledger row — see docs/PHASE_3_6_5_REPORT.md
 * Part 6 "Performance".) Returns null when the customerId doesn't resolve
 * to a real Customer, so the caller can 404 without running the other
 * five queries at all.
 */
export async function getKhataBookCustomerProfile(customerId: string): Promise<KhataBookCustomerProfile | null> {
  const customer = await db.customer.findUnique({ where: { customerId } });
  if (!customer) return null;

  const [orderAggregate, unpaidOrderCount, returnTypeCounts, orders, ledgerReceipts] = await Promise.all([
    db.order.aggregate({
      where: { customerId: customer.id },
      _sum: { totalInPaise: true, outstandingInPaise: true },
      _count: { _all: true },
    }),
    db.order.count({ where: { customerId: customer.id, outstandingInPaise: { gt: 0 } } }),
    db.returnRequest.groupBy({
      by: ["type"],
      where: { customerId: customer.id },
      _count: { _all: true },
    }),
    db.order.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: KHATABOOK_PURCHASE_HISTORY_LIMIT,
      select: {
        orderNumber: true,
        createdAt: true,
        source: true,
        totalInPaise: true,
        amountReceivedInPaise: true,
        outstandingInPaise: true,
        paymentStatus: true,
        status: true,
      },
    }),
    db.paymentReceipt.findMany({
      where: { customerId: customer.id },
      orderBy: { createdAt: "desc" },
      take: KHATABOOK_LEDGER_LIMIT,
      select: {
        id: true,
        createdAt: true,
        amountInPaise: true,
        paymentMethod: true,
        note: true,
        outstandingBeforeInPaise: true,
        outstandingAfterInPaise: true,
        order: { select: { orderNumber: true } },
        createdByAdminUser: { select: { name: true } },
      },
    }),
  ]);

  const totalOrders = orderAggregate._count._all;
  const lifetimePurchaseInPaise = orderAggregate._sum.totalInPaise ?? 0;
  const returnCount = returnTypeCounts.find((r) => r.type === "RETURN")?._count._all ?? 0;
  const exchangeCount = returnTypeCounts.find((r) => r.type === "EXCHANGE")?._count._all ?? 0;

  return {
    customer: {
      id: customer.id,
      customerId: customer.customerId,
      displayName: customer.displayName,
      primaryPhone: customer.primaryPhone,
      whatsappPhone: customer.whatsappPhone,
      lastOrderAt: customer.lastOrderAt,
      createdAt: customer.createdAt,
    },
    summary: {
      lifetimePurchaseInPaise,
      totalOrders,
      outstandingInPaise: orderAggregate._sum.outstandingInPaise ?? 0,
      unpaidOrderCount,
      returnCount,
      exchangeCount,
      averageOrderValueInPaise: totalOrders > 0 ? Math.round(lifetimePurchaseInPaise / totalOrders) : 0,
    },
    orders,
    ledger: ledgerReceipts.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      orderNumber: r.order.orderNumber,
      amountInPaise: r.amountInPaise,
      paymentMethod: r.paymentMethod,
      note: r.note,
      outstandingBeforeInPaise: r.outstandingBeforeInPaise,
      outstandingAfterInPaise: r.outstandingAfterInPaise,
      createdByAdminName: r.createdByAdminUser?.name ?? null,
    })),
  };
}
