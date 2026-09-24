import { db } from "@/lib/db";
import { netSupplierBalanceInPaise } from "@/lib/supplier-balance";
import { getSupplierPaymentSummary } from "@/server/queries/admin/supplier-payments";
import { getSupplierCreditSummary } from "@/server/queries/admin/supplier-credits";
import { getSupplierRefundHistory } from "@/server/queries/admin/supplier-refunds";

export const LEDGER_EVENT_TYPE_VALUES = ["PURCHASE", "PAYMENT", "CREDIT", "REFUND"] as const;
export type LedgerEventType = (typeof LEDGER_EVENT_TYPE_VALUES)[number];

const LEDGER_PAGE_SIZE = 25;

/**
 * Section 7 — same-day tiebreak order. Chosen to match the natural
 * lifecycle of a supplier relationship: a purchase is the event that
 * creates payable in the first place, so it reads first if it lands on
 * the same day as money moving the other way; payments (money actually
 * leaving) come before the more administrative credit/refund entries,
 * which themselves follow the "credit recorded, then any refund drawn
 * from it" order. `createdAt` is the final tiebreaker within one type on
 * one day — a real, precise timestamp every one of these four models
 * already has, so it's a genuinely stable, reproducible sort key rather
 * than relying on whatever order Postgres happens to return rows in.
 */
const TYPE_PRIORITY: Record<LedgerEventType, number> = { PURCHASE: 0, PAYMENT: 1, CREDIT: 2, REFUND: 3 };

const REFUND_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

const CREDIT_REASON_LABEL: Record<string, string> = {
  SUPPLIER_RETURN: "Supplier return",
  OVERPAYMENT: "Overpayment",
  PRICE_ADJUSTMENT: "Price adjustment",
  QUALITY_ADJUSTMENT: "Quality adjustment",
  COMMERCIAL_ADJUSTMENT: "Commercial adjustment",
  OTHER: "Other",
};

type RawEvent = {
  key: string;
  date: Date;
  createdAt: Date;
  type: LedgerEventType;
  reference: string | null;
  description: string;
  debitInPaise: number;
  creditInPaise: number;
  href: string;
  searchText: string;
};

export type LedgerEvent = {
  key: string;
  date: Date;
  type: LedgerEventType;
  reference: string | null;
  description: string;
  debitInPaise: number;
  creditInPaise: number;
  balanceInPaise: number;
  href: string;
};

function dateRangeWhere(from?: Date, to?: Date) {
  if (!from && !to) return undefined;
  return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
}

/**
 * Section 23 — the query strategy: exactly FOUR batched queries
 * (purchases/payments/credits/refunds), each already scoped by
 * `supplierId` and the date range, never one query per row and never
 * per-type queries repeated for pagination. The four result sets are
 * merged, sorted, and reduced to a running balance in JS — appropriate
 * at the expected scale (a single small retail shop's supplier history:
 * tens to low hundreds of events over its lifetime, not millions), and
 * unavoidable in principle: a running balance across four heterogeneous
 * tables has no single-query SQL equivalent without a real UNION view,
 * which would be exactly the kind of new persistent ledger
 * infrastructure Part 7's brief explicitly forbids introducing.
 */
async function fetchRawEvents(supplierId: string, from?: Date, to?: Date): Promise<RawEvent[]> {
  const purchaseWhere = dateRangeWhere(from, to);
  const [purchases, payments, credits, refunds] = await Promise.all([
    db.supplierPurchase.findMany({
      where: { supplierId, ...(purchaseWhere ? { purchaseDate: purchaseWhere } : {}) },
      select: { id: true, purchaseDate: true, totalInPaise: true, reference: true, createdAt: true, _count: { select: { bills: true } } },
    }),
    db.supplierPayment.findMany({
      where: { supplierId, ...(purchaseWhere ? { paymentDate: purchaseWhere } : {}) },
      select: { id: true, paymentDate: true, amountInPaise: true, paymentMethod: true, collectedByName: true, reference: true, createdAt: true },
    }),
    db.supplierCredit.findMany({
      where: { supplierId, ...(purchaseWhere ? { creditDate: purchaseWhere } : {}) },
      select: { id: true, creditDate: true, amountInPaise: true, creditNumber: true, reason: true, reference: true, createdAt: true },
    }),
    db.supplierRefund.findMany({
      where: { supplierId, ...(purchaseWhere ? { refundDate: purchaseWhere } : {}) },
      select: { id: true, refundDate: true, amountInPaise: true, refundNumber: true, refundMethod: true, receivedByName: true, reference: true, createdAt: true },
    }),
  ]);

  const events: RawEvent[] = [];

  for (const p of purchases) {
    const billCount = p._count.bills;
    events.push({
      key: `PURCHASE:${p.id}`,
      date: p.purchaseDate,
      createdAt: p.createdAt,
      type: "PURCHASE",
      reference: p.reference,
      description: `${billCount} bill${billCount === 1 ? "" : "s"}`,
      debitInPaise: p.totalInPaise,
      creditInPaise: 0,
      href: `/admin/suppliers/${supplierId}/purchases/${p.id}`,
      searchText: [p.reference ?? "", "purchase"].join(" ").toLowerCase(),
    });
  }

  for (const payment of payments) {
    const methodLabel = REFUND_METHOD_LABEL[payment.paymentMethod] ?? payment.paymentMethod;
    events.push({
      key: `PAYMENT:${payment.id}`,
      date: payment.paymentDate,
      createdAt: payment.createdAt,
      type: "PAYMENT",
      reference: payment.reference,
      description: `${methodLabel} · ${payment.collectedByName}`,
      debitInPaise: 0,
      creditInPaise: payment.amountInPaise,
      href: `/admin/suppliers/${supplierId}/payments/${payment.id}`,
      searchText: [payment.reference ?? "", payment.collectedByName, methodLabel].join(" ").toLowerCase(),
    });
  }

  for (const credit of credits) {
    const reasonLabel = CREDIT_REASON_LABEL[credit.reason] ?? credit.reason;
    events.push({
      key: `CREDIT:${credit.id}`,
      date: credit.creditDate,
      createdAt: credit.createdAt,
      type: "CREDIT",
      reference: `#${credit.creditNumber}`,
      description: credit.reference ? `${reasonLabel} · ${credit.reference}` : reasonLabel,
      debitInPaise: 0,
      creditInPaise: credit.amountInPaise,
      href: `/admin/suppliers/${supplierId}/credits/${credit.id}`,
      searchText: [credit.creditNumber, credit.reference ?? "", reasonLabel].join(" ").toLowerCase(),
    });
  }

  for (const refund of refunds) {
    const methodLabel = REFUND_METHOD_LABEL[refund.refundMethod] ?? refund.refundMethod;
    events.push({
      key: `REFUND:${refund.id}`,
      date: refund.refundDate,
      createdAt: refund.createdAt,
      type: "REFUND",
      reference: `#${refund.refundNumber}`,
      description: `${methodLabel} · ${refund.receivedByName}`,
      // Money the supplier sent BACK to the shop: it raises the balance
      // (back towards zero from an advance/credit), so it's a debit —
      // the opposite direction from a payment the shop makes.
      debitInPaise: refund.amountInPaise,
      creditInPaise: 0,
      href: `/admin/suppliers/${supplierId}/refunds/${refund.id}`,
      searchText: [refund.refundNumber, refund.reference ?? "", refund.receivedByName, methodLabel].join(" ").toLowerCase(),
    });
  }

  events.sort((a, b) => {
    const dateDiff = a.date.getTime() - b.date.getTime();
    if (dateDiff !== 0) return dateDiff;
    const typeDiff = TYPE_PRIORITY[a.type] - TYPE_PRIORITY[b.type];
    if (typeDiff !== 0) return typeDiff;
    return a.createdAt.getTime() - b.createdAt.getTime();
  });

  return events;
}

/**
 * Section 8 — opening balance is the sum of every event strictly BEFORE
 * `before`, using the same debit-increases/credit-decreases direction as
 * the main ledger. A single set of 4 lightweight aggregates (not full
 * row fetches — nothing about a "sum of everything before this date"
 * needs per-row detail).
 */
export async function getSupplierLedgerOpeningBalance(supplierId: string, before: Date): Promise<number> {
  const [purchaseTotal, paymentTotal, creditTotal, refundTotal] = await Promise.all([
    db.supplierPurchase.aggregate({ where: { supplierId, purchaseDate: { lt: before } }, _sum: { totalInPaise: true } }),
    db.supplierPayment.aggregate({ where: { supplierId, paymentDate: { lt: before } }, _sum: { amountInPaise: true } }),
    db.supplierCredit.aggregate({ where: { supplierId, creditDate: { lt: before } }, _sum: { amountInPaise: true } }),
    db.supplierRefund.aggregate({ where: { supplierId, refundDate: { lt: before } }, _sum: { amountInPaise: true } }),
  ]);

  return netSupplierBalanceInPaise({
    purchasesInPaise: purchaseTotal._sum.totalInPaise ?? 0,
    paymentsInPaise: paymentTotal._sum.amountInPaise ?? 0,
    creditsInPaise: creditTotal._sum.amountInPaise ?? 0,
    refundsInPaise: refundTotal._sum.amountInPaise ?? 0,
  });
}

export type SupplierLedgerResult = {
  events: LedgerEvent[];
  openingBalanceInPaise: number;
  closingBalanceInPaise: number;
  page: number;
  pageSize: number;
  totalCount: number;
  totalPages: number;
  hasAnyActivityInRange: boolean;
};

export async function getSupplierLedger(params: {
  supplierId: string;
  from?: Date;
  to?: Date;
  types?: LedgerEventType[];
  query?: string;
  page?: number;
}): Promise<SupplierLedgerResult> {
  const { supplierId, from, to, query } = params;
  const page = Math.max(1, params.page ?? 1);
  const typeSet = params.types && params.types.length > 0 ? new Set(params.types) : null;
  const trimmedQuery = query?.trim().toLowerCase();

  const rawEvents = await fetchRawEvents(supplierId, from, to);
  const openingBalanceInPaise = from ? await getSupplierLedgerOpeningBalance(supplierId, from) : 0;

  // Running balance computed across EVERY event in the date range,
  // before type/search narrows what's actually shown — a filtered view
  // must still show each row's TRUE overall account balance at that
  // point in time, not a recomputed "purchases-only" or "payments-only"
  // running total (Section 7/13).
  let runningBalance = openingBalanceInPaise;
  const withBalance: LedgerEvent[] = rawEvents.map((event) => {
    runningBalance += event.debitInPaise - event.creditInPaise;
    return {
      key: event.key,
      date: event.date,
      type: event.type,
      reference: event.reference,
      description: event.description,
      debitInPaise: event.debitInPaise,
      creditInPaise: event.creditInPaise,
      balanceInPaise: runningBalance,
      href: event.href,
    };
  });

  const filtered = withBalance.filter((event, index) => {
    if (typeSet && !typeSet.has(event.type)) return false;
    if (trimmedQuery) {
      const raw = rawEvents[index];
      if (!raw.searchText.includes(trimmedQuery)) return false;
    }
    return true;
  });

  const totalCount = filtered.length;
  const pageSize = LEDGER_PAGE_SIZE;
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));
  const pageEvents = filtered.slice((page - 1) * pageSize, page * pageSize);

  return {
    events: pageEvents,
    openingBalanceInPaise,
    closingBalanceInPaise: withBalance.length > 0 ? withBalance[withBalance.length - 1].balanceInPaise : openingBalanceInPaise,
    page,
    pageSize,
    totalCount,
    totalPages,
    hasAnyActivityInRange: rawEvents.length > 0,
  };
}

export type SupplierLedgerSummary = {
  totalPurchasesInPaise: number;
  totalPaymentsInPaise: number;
  totalCreditsInPaise: number;
  totalRefundsInPaise: number;
  /** Section 17 — reconciles EXACTLY with Supplier Detail's own
   *  Purchase Outstanding: total purchases - payments allocated -
   *  credits allocated. Reuses the existing Part 3/6 aggregate
   *  functions rather than re-deriving this from scratch, so it can
   *  never drift from what Supplier Detail itself shows. */
  purchaseOutstandingInPaise: number;
  unallocatedCreditInPaise: number;
  hasAnyActivity: boolean;
};

export async function getSupplierLedgerSummary(supplierId: string): Promise<SupplierLedgerSummary> {
  const [paymentSummary, creditSummary, refundHistory] = await Promise.all([
    getSupplierPaymentSummary(supplierId),
    getSupplierCreditSummary(supplierId),
    getSupplierRefundHistory({ supplierId, page: 1 }),
  ]);

  return {
    totalPurchasesInPaise: paymentSummary.totalPurchasesInPaise,
    totalPaymentsInPaise: paymentSummary.totalPaidInPaise,
    totalCreditsInPaise: creditSummary.totalCreditedInPaise,
    totalRefundsInPaise: refundHistory.totalAmountInPaise,
    purchaseOutstandingInPaise: paymentSummary.totalPurchasesInPaise - paymentSummary.totalPaidInPaise - creditSummary.totalAllocatedInPaise,
    unallocatedCreditInPaise: creditSummary.unallocatedCreditInPaise,
    hasAnyActivity:
      paymentSummary.totalPurchasesInPaise > 0 ||
      paymentSummary.paymentCount > 0 ||
      creditSummary.creditCount > 0 ||
      refundHistory.totalCount > 0,
  };
}

export type SupplierKhata = {
  /** Newest first, each with the running balance right after it. */
  entries: LedgerEvent[];
  /** Every entry ever, for "View full khata (N)". */
  totalCount: number;
  balanceInPaise: number;
  totalBillsInPaise: number;
  totalPaidInPaise: number;
};

/**
 * The supplier page's khata: the same events and running balance as the
 * full ledger (so the two can never disagree), newest first and capped
 * at `limit` rows.
 */
export async function getSupplierKhata(supplierId: string, limit = 30): Promise<SupplierKhata> {
  const rawEvents = await fetchRawEvents(supplierId);
  let running = 0;
  let totalBillsInPaise = 0;
  let totalPaidInPaise = 0;
  const withBalance: LedgerEvent[] = rawEvents.map((event) => {
    running += event.debitInPaise - event.creditInPaise;
    if (event.type === "PURCHASE") totalBillsInPaise += event.debitInPaise;
    if (event.type === "PAYMENT") totalPaidInPaise += event.creditInPaise;
    return {
      key: event.key,
      date: event.date,
      type: event.type,
      reference: event.reference,
      description: event.description,
      debitInPaise: event.debitInPaise,
      creditInPaise: event.creditInPaise,
      balanceInPaise: running,
      href: event.href,
    };
  });

  return {
    entries: withBalance.slice(-limit).reverse(),
    totalCount: withBalance.length,
    balanceInPaise: running,
    totalBillsInPaise,
    totalPaidInPaise,
  };
}
