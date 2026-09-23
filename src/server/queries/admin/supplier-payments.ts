import { db } from "@/lib/db";

const SUPPLIER_PAYMENT_HISTORY_PAGE_SIZE = 20;

/**
 * Part 12 — outstanding is ALWAYS derived (`total - sum(allocations)`),
 * never a stored/cached column that could drift. This is the one place
 * that math happens for a single purchase; every other query in this
 * file that needs a purchase's paid/outstanding figure calls this same
 * shape (or its bulk sibling below) rather than re-deriving it inline.
 *
 * Phase 4 Part 6 — extended (not replaced) to also net out
 * `CreditAllocation` rows: `creditsAppliedInPaise` is reported as its
 * own field (Part 6's brief keeps "Paid" and "Credits Applied" as
 * separate line items, never merged into one number), while
 * `outstandingInPaise` now nets BOTH payment and credit allocations —
 * `total - paidInPaise - creditsAppliedInPaise`. This was a necessary
 * update, not just an addition: once SupplierCredit/CreditAllocation
 * exist, a purchase's TRUE remaining balance can only be lower than
 * "total - payments alone" once any credit has been applied to it, and
 * `createSupplierPaymentAction`'s own allocation ceiling (Part 3) was
 * updated in lockstep (see that file) so a new payment can never be
 * allocated past this same real remaining amount. Every existing caller
 * from Part 3 that only ever saw `creditsAppliedInPaise === 0` (no
 * credits existed yet) sees byte-identical `outstandingInPaise` values
 * as before — this is additive in effect, not a behavior change, for
 * every purchase that predates Part 6.
 */
export type PurchasePaymentInfo = {
  totalInPaise: number;
  paidInPaise: number;
  creditsAppliedInPaise: number;
  outstandingInPaise: number;
};

export async function getPurchasePaymentInfo(purchaseId: string): Promise<PurchasePaymentInfo | null> {
  const purchase = await db.supplierPurchase.findUnique({ where: { id: purchaseId }, select: { totalInPaise: true } });
  if (!purchase) return null;

  const [paidAggregate, creditAggregate] = await Promise.all([
    db.paymentAllocation.aggregate({ where: { purchaseId }, _sum: { amountInPaise: true } }),
    db.creditAllocation.aggregate({ where: { purchaseId }, _sum: { amountInPaise: true } }),
  ]);
  const paidInPaise = paidAggregate._sum.amountInPaise ?? 0;
  const creditsAppliedInPaise = creditAggregate._sum.amountInPaise ?? 0;

  return {
    totalInPaise: purchase.totalInPaise,
    paidInPaise,
    creditsAppliedInPaise,
    outstandingInPaise: purchase.totalInPaise - paidInPaise - creditsAppliedInPaise,
  };
}

export type SupplierPurchaseWithPaymentInfo = PurchasePaymentInfo & {
  id: string;
  purchaseDate: Date;
  reference: string | null;
};

/**
 * One query (purchases + their nested allocation amounts), summed in
 * JS per purchase — not N+1: a single `findMany` with a nested
 * `select`, matching the same "read once, sum in code" shape
 * `getSupplierPurchaseHistory`'s own `_count` already uses (Phase 4
 * Part 2). Used by the New Payment allocation UI, which needs every
 * purchase (paid off or not) to let the admin see "Paid" purchases too.
 *
 * Phase 4 Part 6 — also nets out `creditAllocations` per purchase (same
 * reasoning as `getPurchasePaymentInfo` above): the New Payment form
 * must display the TRUE remaining outstanding, net of any credits
 * already applied, so its live "max allocation" guard matches what the
 * server will actually accept.
 */
export async function getSupplierPurchasesWithPaymentInfo(supplierId: string): Promise<SupplierPurchaseWithPaymentInfo[]> {
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

export type SupplierPaymentSummary = {
  totalPurchasesInPaise: number;
  totalPaidInPaise: number;
  /** Phase 4 Part 7 fix — `outstandingInPaise` below already nets this
   *  out; reported separately too so callers can show "Credits Applied"
   *  as its own line, matching `PurchasePaymentInfo.creditsAppliedInPaise`
   *  (getPurchasePaymentInfo, above) and Part 6's `SupplierPurchaseWithPaymentInfo`. */
  creditsAppliedInPaise: number;
  outstandingInPaise: number;
  paymentCount: number;
  latestPaymentDate: Date | null;
  /** Payments received but not yet allocated to any purchase — see this
   *  model's own doc comment (SupplierPayment, prisma/schema.prisma) and
   *  Part 9/13 of the brief: shown as its OWN figure, never netted into
   *  `outstandingInPaise`. */
  creditInPaise: number;
};

/**
 * All five aggregate reads run as independent, index-backed queries —
 * no N+1 (never loads individual payments/allocations to sum in JS
 * here; that per-row shape is reserved for the small, already-paginated
 * history lists below, where it doubles as the per-row "allocated"
 * display value).
 *
 * Phase 4 Part 7 fix — `outstandingInPaise` previously only netted
 * payments (`total - paidInPaise`), the same shape this function had
 * before Part 6 introduced credits. Part 6 correctly updated the
 * per-purchase functions above (`getPurchasePaymentInfo`,
 * `getSupplierPurchasesWithPaymentInfo`) to also net out
 * `CreditAllocation` rows, but missed this supplier-level aggregate —
 * discovered during Part 7's live QA when Supplier Detail's own header
 * "Outstanding" stat (₹50,000, this function) didn't match the sum of
 * its own two Purchase History rows' outstanding (₹18,000 + ₹22,000 =
 * ₹40,000, `getPurchasePaymentInfo`) after a credit was applied. Fixed
 * the same way Part 6 already fixed the per-purchase functions: net out
 * `CreditAllocation` too. Every supplier that predates Part 6 (zero
 * credits) sees a byte-identical `outstandingInPaise` as before.
 */
export async function getSupplierPaymentSummary(supplierId: string): Promise<SupplierPaymentSummary> {
  const [purchaseTotal, allocatedTotal, creditAllocatedTotal, paymentTotal, paymentCount, latestPayment] = await Promise.all([
    db.supplierPurchase.aggregate({ where: { supplierId }, _sum: { totalInPaise: true } }),
    db.paymentAllocation.aggregate({ where: { purchase: { supplierId } }, _sum: { amountInPaise: true } }),
    db.creditAllocation.aggregate({ where: { purchase: { supplierId } }, _sum: { amountInPaise: true } }),
    db.supplierPayment.aggregate({ where: { supplierId }, _sum: { amountInPaise: true } }),
    db.supplierPayment.count({ where: { supplierId } }),
    db.supplierPayment.findFirst({ where: { supplierId }, orderBy: { paymentDate: "desc" }, select: { paymentDate: true } }),
  ]);

  const totalPurchasesInPaise = purchaseTotal._sum.totalInPaise ?? 0;
  const totalPaidInPaise = allocatedTotal._sum.amountInPaise ?? 0;
  const creditsAppliedInPaise = creditAllocatedTotal._sum.amountInPaise ?? 0;
  const totalReceivedInPaise = paymentTotal._sum.amountInPaise ?? 0;

  return {
    totalPurchasesInPaise,
    totalPaidInPaise,
    creditsAppliedInPaise,
    outstandingInPaise: totalPurchasesInPaise - totalPaidInPaise - creditsAppliedInPaise,
    paymentCount,
    latestPaymentDate: latestPayment?.paymentDate ?? null,
    creditInPaise: totalReceivedInPaise - totalPaidInPaise,
  };
}

export type SupplierPaymentHistoryRow = {
  id: string;
  paymentDate: Date;
  amountInPaise: number;
  paymentMethod: string;
  collectedByName: string;
  reference: string | null;
  allocatedInPaise: number;
  unallocatedInPaise: number;
};

export type SupplierPaymentHistoryResult = {
  payments: SupplierPaymentHistoryRow[];
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
};

export async function getSupplierPaymentHistory(params: {
  supplierId: string;
  page?: number;
}): Promise<SupplierPaymentHistoryResult> {
  const pageSize = SUPPLIER_PAYMENT_HISTORY_PAGE_SIZE;
  const page = Math.max(1, params.page ?? 1);

  const [totalCount, payments] = await Promise.all([
    db.supplierPayment.count({ where: { supplierId: params.supplierId } }),
    db.supplierPayment.findMany({
      where: { supplierId: params.supplierId },
      orderBy: { paymentDate: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize,
      select: {
        id: true,
        paymentDate: true,
        amountInPaise: true,
        paymentMethod: true,
        collectedByName: true,
        reference: true,
        allocations: { select: { amountInPaise: true } },
      },
    }),
  ]);

  return {
    payments: payments.map((payment) => {
      const allocatedInPaise = payment.allocations.reduce((sum, a) => sum + a.amountInPaise, 0);
      return {
        id: payment.id,
        paymentDate: payment.paymentDate,
        amountInPaise: payment.amountInPaise,
        paymentMethod: payment.paymentMethod,
        collectedByName: payment.collectedByName,
        reference: payment.reference,
        allocatedInPaise,
        unallocatedInPaise: payment.amountInPaise - allocatedInPaise,
      };
    }),
    page,
    pageSize,
    totalCount,
    totalPages: Math.max(1, Math.ceil(totalCount / pageSize)),
  };
}

export type PurchasePaymentHistoryRow = {
  allocationId: string;
  amountInPaise: number;
  payment: {
    id: string;
    paymentDate: Date;
    paymentMethod: string;
    collectedByName: string;
  };
};

/**
 * Newest-first, unpaginated (Part 26 only requires ordering here, not
 * pagination — the number of payments that ever touch a single purchase
 * is naturally small, unlike a supplier's full history across every
 * purchase).
 */
export async function getPurchasePaymentHistory(purchaseId: string): Promise<PurchasePaymentHistoryRow[]> {
  const allocations = await db.paymentAllocation.findMany({
    where: { purchaseId },
    orderBy: { payment: { paymentDate: "desc" } },
    select: {
      id: true,
      amountInPaise: true,
      payment: { select: { id: true, paymentDate: true, paymentMethod: true, collectedByName: true } },
    },
  });
  return allocations.map((a) => ({ allocationId: a.id, amountInPaise: a.amountInPaise, payment: a.payment }));
}

/**
 * Scoped to `supplierId` too (not just `id`), same "the route param and
 * the record must agree" rule `getSupplierPurchaseDetail` (Phase 4 Part
 * 2) already establishes.
 */
export async function getSupplierPaymentDetail(supplierId: string, paymentId: string) {
  const payment = await db.supplierPayment.findFirst({
    where: { id: paymentId, supplierId },
    include: {
      supplier: { select: { id: true, name: true } },
      createdByAdminUser: { select: { name: true } },
      attachments: { orderBy: { createdAt: "asc" } },
      allocations: {
        orderBy: { createdAt: "asc" },
        include: { purchase: { select: { id: true, purchaseDate: true, reference: true, totalInPaise: true } } },
      },
    },
  });
  if (!payment) return null;

  // Current outstanding per referenced purchase, computed fresh (never
  // trusted from a stale snapshot) — one aggregate per distinct
  // purchase referenced by this payment's own allocations, which is
  // always a small number.
  const purchaseIds = [...new Set(payment.allocations.map((a) => a.purchase.id))];
  const paidByPurchase = await Promise.all(
    purchaseIds.map(async (purchaseId) => {
      const aggregate = await db.paymentAllocation.aggregate({ where: { purchaseId }, _sum: { amountInPaise: true } });
      return [purchaseId, aggregate._sum.amountInPaise ?? 0] as const;
    }),
  );
  const paidByPurchaseMap = new Map(paidByPurchase);

  return {
    ...payment,
    allocations: payment.allocations.map((allocation) => {
      const totalPaid = paidByPurchaseMap.get(allocation.purchase.id) ?? allocation.amountInPaise;
      return {
        ...allocation,
        purchaseOutstandingAfterInPaise: allocation.purchase.totalInPaise - totalPaid,
      };
    }),
  };
}
