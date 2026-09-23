import { db } from "@/lib/db";

const SUPPLIER_PURCHASE_HISTORY_PAGE_SIZE = 20;

export type SupplierPurchaseSummary = {
  totalInPaise: number;
  purchaseCount: number;
  latestPurchaseDate: Date | null;
};

/**
 * Deliberately ONLY total/count/latest-date — no outstanding/paid figures.
 * Payment tracking does not exist yet (Part 3); fabricating those numbers
 * here would be the exact "invented figures" the KhataBook customer
 * directory work (Phase 4's own predecessor phase) was explicitly
 * corrected away from.
 */
export async function getSupplierPurchaseSummary(supplierId: string): Promise<SupplierPurchaseSummary> {
  const [aggregate, latest] = await Promise.all([
    db.supplierPurchase.aggregate({
      where: { supplierId },
      _sum: { totalInPaise: true },
      _count: { _all: true },
    }),
    db.supplierPurchase.findFirst({
      where: { supplierId },
      orderBy: { purchaseDate: "desc" },
      select: { purchaseDate: true },
    }),
  ]);

  return {
    totalInPaise: aggregate._sum.totalInPaise ?? 0,
    purchaseCount: aggregate._count._all,
    latestPurchaseDate: latest?.purchaseDate ?? null,
  };
}

export type SupplierPurchaseHistoryResult = {
  purchases: Array<{
    id: string;
    purchaseDate: Date;
    reference: string | null;
    totalInPaise: number;
    billCount: number;
  }>;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export async function getSupplierPurchaseHistory(params: {
  supplierId: string;
  page?: number;
}): Promise<SupplierPurchaseHistoryResult> {
  const pageSize = SUPPLIER_PURCHASE_HISTORY_PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);

  const [totalCount, purchases] = await Promise.all([
    db.supplierPurchase.count({ where: { supplierId: params.supplierId } }),
    db.supplierPurchase.findMany({
      where: { supplierId: params.supplierId },
      orderBy: { purchaseDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        purchaseDate: true,
        reference: true,
        totalInPaise: true,
        _count: { select: { bills: true } },
      },
    }),
  ]);

  return {
    purchases: purchases.map((p) => ({
      id: p.id,
      purchaseDate: p.purchaseDate,
      reference: p.reference,
      totalInPaise: p.totalInPaise,
      billCount: p._count.bills,
    })),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

/**
 * Scoped to `supplierId` too (not just `id`) so `/admin/suppliers/[a]/
 * purchases/[b]` can never render purchase `b` when it actually belongs
 * to a different supplier `c` — the route param and the record must
 * agree, checked here rather than trusted from the URL alone.
 */
export async function getSupplierPurchaseDetail(supplierId: string, purchaseId: string) {
  const purchase = await db.supplierPurchase.findFirst({
    where: { id: purchaseId, supplierId },
    include: {
      supplier: { select: { id: true, name: true, businessName: true } },
      bills: {
        orderBy: { createdAt: "asc" },
        include: { attachments: { orderBy: { createdAt: "asc" } } },
      },
    },
  });
  return purchase;
}
