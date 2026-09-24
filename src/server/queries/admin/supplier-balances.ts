import { db } from "@/lib/db";
import { OPENING_BALANCE_REFERENCE, netSupplierBalanceInPaise, startOfMonthInIndia } from "@/lib/supplier-balance";

export type SupplierBalanceRow = {
  netInPaise: number;
  /** Most recent bill or payment — "last activity" on the list. */
  lastActivityAt: Date | null;
};

/**
 * Net balance (see `netSupplierBalanceInPaise`) for many suppliers at
 * once: four grouped sums, never one query per supplier. `supplierIds`
 * undefined means every supplier (the overview's totals).
 */
export async function getSupplierNetBalances(supplierIds?: string[]): Promise<Map<string, SupplierBalanceRow>> {
  const where = supplierIds ? { supplierId: { in: supplierIds } } : {};
  const [purchases, payments, credits, refunds] = await Promise.all([
    db.supplierPurchase.groupBy({ by: ["supplierId"], where, _sum: { totalInPaise: true }, _max: { purchaseDate: true } }),
    db.supplierPayment.groupBy({ by: ["supplierId"], where, _sum: { amountInPaise: true }, _max: { paymentDate: true } }),
    db.supplierCredit.groupBy({ by: ["supplierId"], where, _sum: { amountInPaise: true } }),
    db.supplierRefund.groupBy({ by: ["supplierId"], where, _sum: { amountInPaise: true } }),
  ]);

  const totals = new Map<string, { p: number; pay: number; c: number; r: number; last: Date | null }>();
  const row = (id: string) => {
    let t = totals.get(id);
    if (!t) {
      t = { p: 0, pay: 0, c: 0, r: 0, last: null };
      totals.set(id, t);
    }
    return t;
  };
  const later = (a: Date | null, b: Date | null) => (!a ? b : !b ? a : a > b ? a : b);

  for (const g of purchases) {
    const t = row(g.supplierId);
    t.p = g._sum.totalInPaise ?? 0;
    t.last = later(t.last, g._max.purchaseDate);
  }
  for (const g of payments) {
    const t = row(g.supplierId);
    t.pay = g._sum.amountInPaise ?? 0;
    t.last = later(t.last, g._max.paymentDate);
  }
  for (const g of credits) row(g.supplierId).c = g._sum.amountInPaise ?? 0;
  for (const g of refunds) row(g.supplierId).r = g._sum.amountInPaise ?? 0;

  const result = new Map<string, SupplierBalanceRow>();
  for (const [id, t] of totals) {
    result.set(id, {
      netInPaise: netSupplierBalanceInPaise({
        purchasesInPaise: t.p,
        paymentsInPaise: t.pay,
        creditsInPaise: t.c,
        refundsInPaise: t.r,
      }),
      lastActivityAt: t.last,
    });
  }
  return result;
}

export type SupplierOverview = {
  /** Sum of every positive balance — "you owe ₹X in total". */
  totalOwedInPaise: number;
  suppliersOwedCount: number;
  boughtThisMonthInPaise: number;
  paidThisMonthInPaise: number;
};

/** The header card on /admin/suppliers. */
export async function getSupplierOverview(now: Date = new Date()): Promise<SupplierOverview> {
  const monthStart = startOfMonthInIndia(now);
  const [balances, bought, paid] = await Promise.all([
    getSupplierNetBalances(),
    // An opening balance (purana baaki, see createQuickSupplier) is money
    // owed from before, not goods bought this month.
    db.supplierPurchase.aggregate({
      where: { purchaseDate: { gte: monthStart }, NOT: { reference: OPENING_BALANCE_REFERENCE } },
      _sum: { totalInPaise: true },
    }),
    db.supplierPayment.aggregate({ where: { paymentDate: { gte: monthStart } }, _sum: { amountInPaise: true } }),
  ]);

  let totalOwedInPaise = 0;
  let suppliersOwedCount = 0;
  for (const { netInPaise } of balances.values()) {
    if (netInPaise > 0) {
      totalOwedInPaise += netInPaise;
      suppliersOwedCount += 1;
    }
  }

  return {
    totalOwedInPaise,
    suppliersOwedCount,
    boughtThisMonthInPaise: bought._sum.totalInPaise ?? 0,
    paidThisMonthInPaise: paid._sum.amountInPaise ?? 0,
  };
}

export const SUPPLIER_LIST_FILTERS = ["ALL", "TO_PAY", "INACTIVE"] as const;
export type SupplierListFilter = (typeof SUPPLIER_LIST_FILTERS)[number];

export type SupplierListRow = {
  id: string;
  name: string;
  businessName: string | null;
  phone: string | null;
  city: string | null;
  isActive: boolean;
  netInPaise: number;
  lastActivityAt: Date | null;
};

const SUPPLIER_LIST_PAGE_SIZE = 30;

/**
 * /admin/suppliers: every matching supplier with what's owed, the ones
 * owed most first (then by name) — the order a shopkeeper plans
 * payments in. A kirana has tens of suppliers, not thousands, so the
 * balance sort happens in memory after one grouped balance read.
 * "All" hides inactive suppliers; the Inactive tab shows only them.
 */
export async function getSupplierList(params: { query?: string; filter?: SupplierListFilter; page?: number }) {
  const q = params.query?.trim();
  const filter = params.filter ?? "ALL";
  const suppliers = await db.supplier.findMany({
    where: {
      isActive: filter !== "INACTIVE",
      ...(q
        ? {
            OR: [
              { name: { contains: q, mode: "insensitive" as const } },
              { businessName: { contains: q, mode: "insensitive" as const } },
              { phone: { contains: q } },
              { city: { contains: q, mode: "insensitive" as const } },
            ],
          }
        : {}),
    },
    select: { id: true, name: true, businessName: true, phone: true, city: true, isActive: true },
  });

  const balances = await getSupplierNetBalances(suppliers.map((s) => s.id));
  let rows: SupplierListRow[] = suppliers.map((s) => ({
    ...s,
    netInPaise: balances.get(s.id)?.netInPaise ?? 0,
    lastActivityAt: balances.get(s.id)?.lastActivityAt ?? null,
  }));
  if (filter === "TO_PAY") rows = rows.filter((r) => r.netInPaise > 0);
  rows.sort((a, b) => b.netInPaise - a.netInPaise || a.name.localeCompare(b.name));

  const pageSize = SUPPLIER_LIST_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
  const page = Math.min(Math.max(1, params.page ?? 1), totalPages);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), totalCount: rows.length, page, pageSize, totalPages };
}
