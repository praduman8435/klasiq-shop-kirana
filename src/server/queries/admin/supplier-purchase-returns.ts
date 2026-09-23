import { db } from "@/lib/db";

export type ReturnableVariant = {
  productVariantId: string;
  productName: string;
  size: string;
  sku: string;
  receivedQuantity: number;
  alreadyReturnedQuantity: number;
  returnableQuantity: number;
  currentStock: number;
};

/**
 * Part 5/6 — the single source of truth for "how much of this variant
 * can still be returned against this purchase." Never a stored/cached
 * column: `receivedQuantity` is summed fresh from
 * SupplierPurchaseReceiptItem, `alreadyReturnedQuantity` fresh from
 * SupplierPurchaseReturnItem (COMPLETED returns only), and
 * `returnableQuantity` is `max(0, received - alreadyReturned)` further
 * capped by `currentStock` at the UI/action layer (Part 6) — capping
 * here too would hide the true received/returned figures the admin
 * needs to see, so this function reports both numbers uncapped and lets
 * the caller decide the effective ceiling.
 *
 * Only variants with `receivedQuantity > 0` are returned — nothing can
 * ever be returned that was never received against this purchase (Part
 * 4's "do not allow returning arbitrary stock").
 */
export async function getReturnableVariantsForPurchase(purchaseId: string): Promise<ReturnableVariant[]> {
  const [receiptItems, returnItems] = await Promise.all([
    db.supplierPurchaseReceiptItem.findMany({
      where: { receipt: { purchaseId } },
      select: { productVariantId: true, quantity: true },
    }),
    db.supplierPurchaseReturnItem.findMany({
      where: { return: { purchaseId, status: "COMPLETED" } },
      select: { productVariantId: true, quantity: true },
    }),
  ]);

  const receivedByVariant = new Map<string, number>();
  for (const item of receiptItems) {
    receivedByVariant.set(item.productVariantId, (receivedByVariant.get(item.productVariantId) ?? 0) + item.quantity);
  }
  const returnedByVariant = new Map<string, number>();
  for (const item of returnItems) {
    returnedByVariant.set(item.productVariantId, (returnedByVariant.get(item.productVariantId) ?? 0) + item.quantity);
  }

  const variantIds = [...receivedByVariant.keys()];
  if (variantIds.length === 0) return [];

  const variants = await db.productVariant.findMany({
    where: { id: { in: variantIds } },
    select: { id: true, size: true, sku: true, stockQuantity: true, product: { select: { name: true } } },
  });

  return variants.map((variant) => {
    const receivedQuantity = receivedByVariant.get(variant.id) ?? 0;
    const alreadyReturnedQuantity = returnedByVariant.get(variant.id) ?? 0;
    return {
      productVariantId: variant.id,
      productName: variant.product.name,
      size: variant.size,
      sku: variant.sku,
      receivedQuantity,
      alreadyReturnedQuantity,
      returnableQuantity: Math.max(0, receivedQuantity - alreadyReturnedQuantity),
      currentStock: variant.stockQuantity,
    };
  });
}

export type PurchaseReturnSummary = {
  totalReturnedUnits: number;
  returnCount: number;
  lastReturnedAt: Date | null;
};

export async function getPurchaseReturnSummary(purchaseId: string): Promise<PurchaseReturnSummary> {
  const [itemsAggregate, returnCount, lastReturn] = await Promise.all([
    db.supplierPurchaseReturnItem.aggregate({
      where: { return: { purchaseId, status: "COMPLETED" } },
      _sum: { quantity: true },
    }),
    db.supplierPurchaseReturn.count({ where: { purchaseId, status: "COMPLETED" } }),
    db.supplierPurchaseReturn.findFirst({
      where: { purchaseId, status: "COMPLETED" },
      orderBy: { returnDate: "desc" },
      select: { returnDate: true },
    }),
  ]);

  return {
    totalReturnedUnits: itemsAggregate._sum.quantity ?? 0,
    returnCount,
    lastReturnedAt: lastReturn?.returnDate ?? null,
  };
}

export type PurchaseReturnHistoryRow = {
  id: string;
  returnNumber: string;
  returnDate: Date;
  reason: string;
  status: string;
  totalUnits: number;
};

/** Newest-first, unpaginated — same reasoning as
 *  `getPurchaseReceiptHistory`/`getPurchasePaymentHistory` (Phase 4
 *  Parts 3/4): the number of returns against a single purchase is
 *  naturally small. */
export async function getPurchaseReturnHistory(purchaseId: string): Promise<PurchaseReturnHistoryRow[]> {
  const returns = await db.supplierPurchaseReturn.findMany({
    where: { purchaseId },
    orderBy: { returnDate: "desc" },
    select: { id: true, returnNumber: true, returnDate: true, reason: true, status: true, items: { select: { quantity: true } } },
  });

  return returns.map((r) => ({
    id: r.id,
    returnNumber: r.returnNumber,
    returnDate: r.returnDate,
    reason: r.reason,
    status: r.status,
    totalUnits: r.items.reduce((sum, item) => sum + item.quantity, 0),
  }));
}

export type SupplierRecentReturnRow = {
  id: string;
  purchaseId: string;
  returnNumber: string;
  returnDate: Date;
  reason: string;
  status: string;
  totalUnits: number;
};

/** Part 13 — Supplier Detail's compact "Supplier Returns" section shows
 *  only the last few returns across every purchase, never a full
 *  paginated history inline. */
export async function getSupplierRecentReturns(supplierId: string, limit = 5): Promise<SupplierRecentReturnRow[]> {
  const returns = await db.supplierPurchaseReturn.findMany({
    where: { purchase: { supplierId } },
    orderBy: { returnDate: "desc" },
    take: limit,
    select: {
      id: true,
      purchaseId: true,
      returnNumber: true,
      returnDate: true,
      reason: true,
      status: true,
      items: { select: { quantity: true } },
    },
  });

  return returns.map((r) => ({
    id: r.id,
    purchaseId: r.purchaseId,
    returnNumber: r.returnNumber,
    returnDate: r.returnDate,
    reason: r.reason,
    status: r.status,
    totalUnits: r.items.reduce((sum, item) => sum + item.quantity, 0),
  }));
}

/**
 * Scoped to `purchaseId` too (not just `id`), same "the route param and
 * the record must agree" rule every other nested detail query in this
 * phase establishes (getSupplierPurchaseReceiptDetail,
 * getSupplierPaymentDetail).
 */
export async function getSupplierPurchaseReturnDetail(purchaseId: string, returnId: string) {
  return db.supplierPurchaseReturn.findFirst({
    where: { id: returnId, purchaseId },
    include: {
      purchase: { select: { id: true, purchaseDate: true, supplier: { select: { id: true, name: true } } } },
      createdByAdminUser: { select: { name: true } },
      confirmedByAdminUser: { select: { name: true } },
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          productVariant: { select: { id: true, size: true, sku: true, product: { select: { name: true } } } },
        },
      },
    },
  });
}
