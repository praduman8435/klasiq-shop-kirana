import type { InventoryAdjustmentReason, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deriveStockStatus } from "@/lib/stock";

type TransactionClient = Prisma.TransactionClient;

export type InventoryAdjustError =
  | { type: "NOT_FOUND"; message: string }
  | { type: "INVALID"; message: string }
  | { type: "CONFLICT"; message: string };

export type InventoryAdjustResult =
  | { success: true; newQuantity: number }
  | { success: false; error: InventoryAdjustError };

export class InsufficientStockError extends Error {}
class ConflictError extends Error {}

/**
 * The guarded delta-update + audit-row primitive every stock-quantity
 * change in this codebase goes through — extracted (Phase 3.5 Part 4) so
 * `adjustInventoryByDelta` (below, opens its own transaction) and
 * `receiveReturnRequest` (src/server/commerce/return-fulfillment.ts,
 * composes TWO of these inside one larger transaction for atomic
 * return-restore + exchange-issue — see "Inventory atomicity" in
 * docs/PHASE_3_5_REPORT.md Part 4) share the exact same guarantee rather
 * than one of them reimplementing it. Takes an already-open `tx` — never
 * opens its own — so the caller controls the transaction boundary.
 * Throws `InsufficientStockError` (never returns a sentinel) so a caller
 * composing several calls in one transaction gets the standard
 * throw-inside-`$transaction`-to-roll-back-everything behavior for free.
 */
export async function applyInventoryDelta(
  tx: TransactionClient,
  params: {
    productVariantId: string;
    delta: number;
    reason: InventoryAdjustmentReason;
    note?: string;
    adminUserId: string | null;
    orderId?: string;
    returnRequestId?: string;
    /** Phase 4 Part 4 — set only for STOCK_RECEIVED rows created by the
     *  explicit "Receive Inventory" action, so a stock increase can be
     *  traced back to the exact SupplierPurchaseReceipt that caused it,
     *  same as `orderId`/`returnRequestId` above for their own flows. */
    supplierPurchaseReceiptId?: string;
    /** Phase 4 Part 5 — set only for SUPPLIER_RETURN rows created by the
     *  explicit "Return to Supplier" action, so a stock decrease can be
     *  traced back to the exact SupplierPurchaseReturn that caused it,
     *  same as `supplierPurchaseReceiptId` above. */
    supplierPurchaseReturnId?: string;
  },
): Promise<{ newQuantity: number }> {
  const {
    productVariantId,
    delta,
    reason,
    note,
    adminUserId,
    orderId,
    returnRequestId,
    supplierPurchaseReceiptId,
    supplierPurchaseReturnId,
  } = params;

  const updated = await tx.productVariant.updateMany({
    where: { id: productVariantId, stockQuantity: { gte: -delta } },
    data: { stockQuantity: { increment: delta } },
  });
  if (updated.count === 0) throw new InsufficientStockError();

  const fresh = await tx.productVariant.findUniqueOrThrow({ where: { id: productVariantId } });
  const newStatus = deriveStockStatus(fresh.stockQuantity, fresh.lowStockThreshold);
  if (newStatus !== fresh.stockStatus) {
    await tx.productVariant.update({ where: { id: fresh.id }, data: { stockStatus: newStatus } });
  }

  await tx.inventoryAdjustment.create({
    data: {
      productVariantId: fresh.id,
      previousQuantity: fresh.stockQuantity - delta,
      newQuantity: fresh.stockQuantity,
      delta,
      reason,
      note,
      adminUserId,
      orderId,
      returnRequestId,
      supplierPurchaseReceiptId,
      supplierPurchaseReturnId,
    },
  });

  return { newQuantity: fresh.stockQuantity };
}

/**
 * Delta-based adjustment (+1 / -1 / "received N units"). Always safe by
 * construction: the guarded `updateMany` only ever applies the increment if
 * the result won't go negative, so no separate read-then-check is needed
 * and a concurrent customer checkout decrementing the same variant can
 * never be lost — Postgres serializes the two UPDATEs at the row level,
 * exactly like the Phase 2 checkout stock decrement. See "Concurrency" in
 * docs/PHASE_3_REPORT.md. A thin `db.$transaction` wrapper around the
 * shared `applyInventoryDelta` primitive above.
 */
export async function adjustInventoryByDelta(params: {
  productVariantId: string;
  delta: number;
  reason: InventoryAdjustmentReason;
  note?: string;
  adminUserId: string;
}): Promise<InventoryAdjustResult> {
  const { productVariantId, delta, reason, note, adminUserId } = params;

  const variant = await db.productVariant.findUnique({ where: { id: productVariantId } });
  if (!variant) {
    return { success: false, error: { type: "NOT_FOUND", message: "That size no longer exists." } };
  }
  if (delta === 0) {
    return { success: true, newQuantity: variant.stockQuantity };
  }

  try {
    const { newQuantity } = await db.$transaction((tx) =>
      applyInventoryDelta(tx, { productVariantId, delta, reason, note, adminUserId }),
    );

    return { success: true, newQuantity };
  } catch (err) {
    if (err instanceof InsufficientStockError) {
      return {
        success: false,
        error: {
          type: "INVALID",
          message: `Only ${variant.stockQuantity} in stock — cannot reduce by ${-delta}.`,
        },
      };
    }
    throw err;
  }
}

/**
 * Sets stock to an absolute value (the "I counted N on the shelf" flow).
 * Unlike the delta operation, replacing an absolute value based on a
 * possibly-stale read IS a lost-update risk — so this uses optimistic
 * concurrency: the caller must pass the quantity they last saw
 * (`expectedPreviousQuantity`), and the guarded update only applies if
 * nothing else has changed the row since. If it has (e.g. a customer
 * bought one in between), this returns CONFLICT rather than silently
 * overwriting their purchase.
 */
export async function setInventoryQuantity(params: {
  productVariantId: string;
  newQuantity: number;
  expectedPreviousQuantity: number;
  reason: InventoryAdjustmentReason;
  note?: string;
  adminUserId: string;
}): Promise<InventoryAdjustResult> {
  const { productVariantId, newQuantity, expectedPreviousQuantity, reason, note, adminUserId } = params;

  if (newQuantity < 0) {
    return { success: false, error: { type: "INVALID", message: "Stock cannot be negative." } };
  }

  const variant = await db.productVariant.findUnique({ where: { id: productVariantId } });
  if (!variant) {
    return { success: false, error: { type: "NOT_FOUND", message: "That size no longer exists." } };
  }

  try {
    const finalQuantity = await db.$transaction(async (tx) => {
      const updated = await tx.productVariant.updateMany({
        where: { id: productVariantId, stockQuantity: expectedPreviousQuantity },
        data: { stockQuantity: newQuantity },
      });
      if (updated.count === 0) throw new ConflictError();

      const fresh = await tx.productVariant.findUniqueOrThrow({ where: { id: productVariantId } });
      const newStatus = deriveStockStatus(fresh.stockQuantity, fresh.lowStockThreshold);
      if (newStatus !== fresh.stockStatus) {
        await tx.productVariant.update({ where: { id: fresh.id }, data: { stockStatus: newStatus } });
      }

      await tx.inventoryAdjustment.create({
        data: {
          productVariantId: fresh.id,
          previousQuantity: expectedPreviousQuantity,
          newQuantity,
          delta: newQuantity - expectedPreviousQuantity,
          reason,
          note,
          adminUserId,
        },
      });

      return fresh.stockQuantity;
    });

    return { success: true, newQuantity: finalQuantity };
  } catch (err) {
    if (err instanceof ConflictError) {
      return {
        success: false,
        error: {
          type: "CONFLICT",
          message: "Stock changed since you loaded this page — refresh and try again.",
        },
      };
    }
    throw err;
  }
}
