import { db } from "@/lib/db";

const SUPPLIER_CREDIT_HISTORY_PAGE_SIZE = 20;

export type PurchaseWithCreditInfo = {
  id: string;
  purchaseDate: Date;
  reference: string | null;
  totalInPaise: number;
  paidInPaise: number;
  creditsAppliedInPaise: number;
  outstandingInPaise: number;
};

/**
 * Same "one query, sum nested rows in JS" shape as
 * `getSupplierPurchasesWithPaymentInfo` (Phase 4 Part 3, updated Part 6)
 * — used by the New Credit allocation form, which needs every purchase
 * (not just outstanding ones, so a fully-settled purchase can still show
 * "Paid") together with its TRUE remaining balance net of both payment
 * and credit allocations.
 */
export async function getSupplierPurchasesWithCreditInfo(supplierId: string): Promise<PurchaseWithCreditInfo[]> {
  const purchases = await db.supplierPurchase.findMany({
    where: { supplierId },
    orderBy: { purchaseDate: "desc" },
    select: {
      id: true,
      purchaseDate: true,
      reference: true,
      totalInPaise: true,
      allocations: { select: { amountInPaise: true } },
      creditAllocations: { select: { amountInPaise: true } },
    },
  });

  return purchases.map((purchase) => {
    const paidInPaise = purchase.allocations.reduce((sum, a) => sum + a.amountInPaise, 0);
    const creditsAppliedInPaise = purchase.creditAllocations.reduce((sum, a) => sum + a.amountInPaise, 0);
    return {
      id: purchase.id,
      purchaseDate: purchase.purchaseDate,
      reference: purchase.reference,
      totalInPaise: purchase.totalInPaise,
      paidInPaise,
      creditsAppliedInPaise,
      outstandingInPaise: purchase.totalInPaise - paidInPaise - creditsAppliedInPaise,
    };
  });
}

export type SupplierCreditSummary = {
  totalCreditedInPaise: number;
  totalAllocatedInPaise: number;
  totalRefundedFromCreditsInPaise: number;
  unallocatedCreditInPaise: number;
  creditCount: number;
  latestCreditDate: Date | null;
};

/**
 * `unallocatedCreditInPaise` — the ONE derived figure this phase's
 * brief cares most about: a credit's remaining spendable balance can
 * leave via EITHER path (allocate to a purchase, OR pay back as a
 * refund), so both must be subtracted together, never just one — see
 * SupplierCredit's own schema doc comment (prisma/schema.prisma).
 */
export async function getSupplierCreditSummary(supplierId: string): Promise<SupplierCreditSummary> {
  const [creditTotal, allocatedTotal, refundedTotal, creditCount, latestCredit] = await Promise.all([
    db.supplierCredit.aggregate({ where: { supplierId }, _sum: { amountInPaise: true } }),
    db.creditAllocation.aggregate({ where: { credit: { supplierId } }, _sum: { amountInPaise: true } }),
    db.supplierRefund.aggregate({ where: { sourceCredit: { supplierId } }, _sum: { amountInPaise: true } }),
    db.supplierCredit.count({ where: { supplierId } }),
    db.supplierCredit.findFirst({ where: { supplierId }, orderBy: { creditDate: "desc" }, select: { creditDate: true } }),
  ]);

  const totalCreditedInPaise = creditTotal._sum.amountInPaise ?? 0;
  const totalAllocatedInPaise = allocatedTotal._sum.amountInPaise ?? 0;
  const totalRefundedFromCreditsInPaise = refundedTotal._sum.amountInPaise ?? 0;

  return {
    totalCreditedInPaise,
    totalAllocatedInPaise,
    totalRefundedFromCreditsInPaise,
    unallocatedCreditInPaise: totalCreditedInPaise - totalAllocatedInPaise - totalRefundedFromCreditsInPaise,
    creditCount,
    latestCreditDate: latestCredit?.creditDate ?? null,
  };
}

export type SupplierCreditHistoryRow = {
  id: string;
  creditNumber: string;
  creditDate: Date;
  reason: string;
  amountInPaise: number;
  allocatedInPaise: number;
  refundedInPaise: number;
  unallocatedInPaise: number;
  sourceReturnNumber: string | null;
};

export type SupplierCreditHistoryResult = {
  credits: SupplierCreditHistoryRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export async function getSupplierCreditHistory(params: {
  supplierId: string;
  page?: number;
}): Promise<SupplierCreditHistoryResult> {
  const pageSize = SUPPLIER_CREDIT_HISTORY_PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);

  const [totalCount, credits] = await Promise.all([
    db.supplierCredit.count({ where: { supplierId: params.supplierId } }),
    db.supplierCredit.findMany({
      where: { supplierId: params.supplierId },
      orderBy: { creditDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        creditNumber: true,
        creditDate: true,
        reason: true,
        amountInPaise: true,
        allocations: { select: { amountInPaise: true } },
        refunds: { select: { amountInPaise: true } },
        sourceReturn: { select: { returnNumber: true } },
      },
    }),
  ]);

  return {
    credits: credits.map((credit) => {
      const allocatedInPaise = credit.allocations.reduce((sum, a) => sum + a.amountInPaise, 0);
      const refundedInPaise = credit.refunds.reduce((sum, r) => sum + r.amountInPaise, 0);
      return {
        id: credit.id,
        creditNumber: credit.creditNumber,
        creditDate: credit.creditDate,
        reason: credit.reason,
        amountInPaise: credit.amountInPaise,
        allocatedInPaise,
        refundedInPaise,
        unallocatedInPaise: credit.amountInPaise - allocatedInPaise - refundedInPaise,
        sourceReturnNumber: credit.sourceReturn?.returnNumber ?? null,
      };
    }),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export type PurchaseCreditAllocationHistoryRow = {
  allocationId: string;
  amountInPaise: number;
  credit: { id: string; creditNumber: string; creditDate: Date; reason: string };
};

/** Newest-first, unpaginated — same reasoning as
 *  `getPurchasePaymentHistory`/`getPurchaseReceiptHistory` (Phase 4
 *  Parts 3/4): the number of credits ever applied to one purchase is
 *  naturally small. */
export async function getPurchaseCreditAllocationHistory(purchaseId: string): Promise<PurchaseCreditAllocationHistoryRow[]> {
  const allocations = await db.creditAllocation.findMany({
    where: { purchaseId },
    orderBy: { credit: { creditDate: "desc" } },
    select: {
      id: true,
      amountInPaise: true,
      credit: { select: { id: true, creditNumber: true, creditDate: true, reason: true } },
    },
  });
  return allocations.map((a) => ({ allocationId: a.id, amountInPaise: a.amountInPaise, credit: a.credit }));
}

/**
 * Scoped to `supplierId` too (not just `id`), same "the route param and
 * the record must agree" rule every other detail query in this phase
 * establishes.
 */
export async function getSupplierCreditDetail(supplierId: string, creditId: string) {
  const credit = await db.supplierCredit.findFirst({
    where: { id: creditId, supplierId },
    include: {
      supplier: { select: { id: true, name: true } },
      sourceReturn: { select: { id: true, returnNumber: true } },
      createdByAdminUser: { select: { name: true } },
      refunds: { select: { id: true, refundNumber: true, amountInPaise: true } },
      allocations: {
        orderBy: { createdAt: "asc" },
        include: { purchase: { select: { id: true, purchaseDate: true, reference: true, totalInPaise: true } } },
      },
    },
  });
  if (!credit) return null;

  // Current outstanding per referenced purchase, computed fresh — same
  // pattern as getSupplierPaymentDetail (Phase 4 Part 3).
  const purchaseIds = [...new Set(credit.allocations.map((a) => a.purchase.id))];
  const netByPurchase = await Promise.all(
    purchaseIds.map(async (purchaseId) => {
      const [paid, credited] = await Promise.all([
        db.paymentAllocation.aggregate({ where: { purchaseId }, _sum: { amountInPaise: true } }),
        db.creditAllocation.aggregate({ where: { purchaseId }, _sum: { amountInPaise: true } }),
      ]);
      return [purchaseId, (paid._sum.amountInPaise ?? 0) + (credited._sum.amountInPaise ?? 0)] as const;
    }),
  );
  const netByPurchaseMap = new Map(netByPurchase);

  const refundedInPaise = credit.refunds.reduce((sum, r) => sum + r.amountInPaise, 0);
  const allocatedInPaise = credit.allocations.reduce((sum, a) => sum + a.amountInPaise, 0);

  return {
    ...credit,
    allocatedInPaise,
    refundedInPaise,
    unallocatedInPaise: credit.amountInPaise - allocatedInPaise - refundedInPaise,
    allocations: credit.allocations.map((allocation) => {
      const totalAppliedToPurchase = netByPurchaseMap.get(allocation.purchase.id) ?? allocation.amountInPaise;
      return {
        ...allocation,
        purchaseOutstandingAfterInPaise: allocation.purchase.totalInPaise - totalAppliedToPurchase,
      };
    }),
  };
}
