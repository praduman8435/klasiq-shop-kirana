import { db } from "@/lib/db";

export type PurchaseReceivingSummary = {
  totalReceivedUnits: number;
  receiptCount: number;
  lastReceivedAt: Date | null;
};

/**
 * Part 13 — "If quantity expectations are not available from the
 * purchase itself, do NOT fabricate a 'pending' quantity." A
 * SupplierPurchase (Part 2) has no expected-quantity concept at all
 * (it's a financial record, not a packing list) — so this deliberately
 * reports ONLY what has actually been received, never a derived
 * "pending" figure.
 */
export async function getPurchaseReceivingSummary(purchaseId: string): Promise<PurchaseReceivingSummary> {
  const [itemsAggregate, receiptCount, lastReceipt] = await Promise.all([
    db.supplierPurchaseReceiptItem.aggregate({
      where: { receipt: { purchaseId } },
      _sum: { quantity: true },
    }),
    db.supplierPurchaseReceipt.count({ where: { purchaseId } }),
    db.supplierPurchaseReceipt.findFirst({
      where: { purchaseId },
      orderBy: { receivedAt: "desc" },
      select: { receivedAt: true },
    }),
  ]);

  return {
    totalReceivedUnits: itemsAggregate._sum.quantity ?? 0,
    receiptCount,
    lastReceivedAt: lastReceipt?.receivedAt ?? null,
  };
}

export type PurchaseReceiptHistoryRow = {
  id: string;
  receivedAt: Date;
  reference: string | null;
  totalUnits: number;
  itemCount: number;
  createdByAdminUserName: string | null;
};

/** Newest-first, unpaginated — the number of receiving events against a
 *  single purchase is naturally small (staged shipments), same
 *  reasoning as `getPurchasePaymentHistory` (Phase 4 Part 3). */
export async function getPurchaseReceiptHistory(purchaseId: string): Promise<PurchaseReceiptHistoryRow[]> {
  const receipts = await db.supplierPurchaseReceipt.findMany({
    where: { purchaseId },
    orderBy: { receivedAt: "desc" },
    select: {
      id: true,
      receivedAt: true,
      reference: true,
      createdByAdminUser: { select: { name: true } },
      items: { select: { quantity: true } },
    },
  });

  return receipts.map((receipt) => ({
    id: receipt.id,
    receivedAt: receipt.receivedAt,
    reference: receipt.reference,
    totalUnits: receipt.items.reduce((sum, item) => sum + item.quantity, 0),
    itemCount: receipt.items.length,
    createdByAdminUserName: receipt.createdByAdminUser?.name ?? null,
  }));
}

/**
 * One query for every purchase's receipts+items, summed in JS per
 * purchase — not N+1 — used by Supplier Detail's purchase history
 * table (Part 16's "Received" column). `SupplierPurchaseReceiptItem`
 * has no direct `purchaseId` column (only `receiptId`), so a plain
 * `groupBy` can't do this in one query; reading the small nested shape
 * once and summing here is the efficient equivalent.
 */
export async function getReceivedUnitsByPurchaseIds(purchaseIds: string[]): Promise<Map<string, number>> {
  if (purchaseIds.length === 0) return new Map();

  const receipts = await db.supplierPurchaseReceipt.findMany({
    where: { purchaseId: { in: purchaseIds } },
    select: { purchaseId: true, items: { select: { quantity: true } } },
  });

  const totals = new Map<string, number>();
  for (const receipt of receipts) {
    const units = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
    totals.set(receipt.purchaseId, (totals.get(receipt.purchaseId) ?? 0) + units);
  }
  return totals;
}

export type SupplierRecentReceiptRow = {
  id: string;
  purchaseId: string;
  receivedAt: Date;
  totalUnits: number;
};

/** Part 16 — Supplier Detail's "Inventory / Receiving" section shows
 *  only a handful of the most recent receiving events across every
 *  purchase from this supplier, never the full history inline (avoids
 *  overcrowding an already busy page). */
export async function getSupplierRecentReceipts(supplierId: string, limit = 5): Promise<SupplierRecentReceiptRow[]> {
  const receipts = await db.supplierPurchaseReceipt.findMany({
    where: { purchase: { supplierId } },
    orderBy: { receivedAt: "desc" },
    take: limit,
    select: { id: true, purchaseId: true, receivedAt: true, items: { select: { quantity: true } } },
  });

  return receipts.map((receipt) => ({
    id: receipt.id,
    purchaseId: receipt.purchaseId,
    receivedAt: receipt.receivedAt,
    totalUnits: receipt.items.reduce((sum, item) => sum + item.quantity, 0),
  }));
}

/**
 * Scoped to `purchaseId` too (not just `id`), same "the route param and
 * the record must agree" rule every other nested detail query in this
 * phase establishes (getSupplierPurchaseDetail, getSupplierPaymentDetail).
 */
export async function getSupplierPurchaseReceiptDetail(purchaseId: string, receiptId: string) {
  return db.supplierPurchaseReceipt.findFirst({
    where: { id: receiptId, purchaseId },
    include: {
      purchase: { select: { id: true, purchaseDate: true, supplier: { select: { id: true, name: true } } } },
      createdByAdminUser: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          productVariant: {
            select: { id: true, size: true, sku: true, product: { select: { name: true } } },
          },
        },
      },
    },
  });
}
