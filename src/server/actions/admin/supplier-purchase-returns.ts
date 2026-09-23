"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { generateSupplierPurchaseReturnNumber } from "@/lib/supplier-purchase-return-number";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import { applyInventoryDelta, InsufficientStockError } from "@/server/commerce/inventory";
import { createSupplierPurchaseReturnSchema } from "@/lib/validation/admin-supplier-purchase-returns";

export type AdminActionResult<T> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND"; message: string } };

async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      admin: null,
      unauthorized: {
        success: false as const,
        error: { type: "UNAUTHORIZED" as const, message: "Please sign in again." },
      },
    };
  }
  return { admin, unauthorized: null };
}

function revalidateReturnViews(supplierId: string, purchaseId: string, returnId?: string) {
  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath(`/admin/suppliers/${supplierId}/purchases/${purchaseId}`);
  if (returnId) revalidatePath(`/admin/suppliers/${supplierId}/purchases/${purchaseId}/returns/${returnId}`);
  // Same targets `adjustInventoryByDeltaAction`/`createSupplierPurchaseReceiptAction`
  // already revalidate — /admin/inventory reflects the stock reduction
  // without a manual refresh.
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
}

/** Thrown only for accounting/inventory rules that require a FRESH read
 *  inside the transaction (returnable quantity, current stock) — same
 *  domain-error-aborts-the-transaction shape as
 *  `SupplierPaymentValidationError`/`ReceiptValidationError` (Phase 4
 *  Parts 3/4). */
class SupplierReturnValidationError extends Error {}

const MAX_RETURN_NUMBER_ATTEMPTS = 5;

export type CreateSupplierPurchaseReturnResult = { success: true; id: string; returnNumber: string };

/**
 * Section 9/10/11/15 — the single most important invariant in this
 * file: a supplier return reduces inventory ONLY through this one
 * explicit, atomic action, and ONLY the moment it is confirmed — there
 * is no separate "save as draft" step anywhere that could reduce stock
 * before an admin actually means it to (see SupplierPurchaseReturnStatus's
 * own schema doc comment for why). Reuses `applyInventoryDelta`
 * (src/server/commerce/inventory.ts) — the SAME guarded delta-update +
 * audit-row primitive every other stock movement in this codebase goes
 * through — with a NEGATIVE delta, never a second stock-mutation
 * mechanism. Financial records (SupplierPurchase.totalInPaise,
 * SupplierPayment, PaymentAllocation) are never read or written here —
 * a supplier return only ever affects inventory, exactly as Part 15 of
 * this phase's brief requires.
 *
 * Idempotent by `idempotencyKey`: a repeat submission with the same key
 * (a stale network retry, a double-click that got past the disabled
 * button) returns the SAME return instead of reducing stock a second
 * time — checked before any validation or transaction work, the same
 * "look up by key first, short-circuit on a hit" shape
 * `placeOrderForBasket` already establishes for Order.idempotencyKey.
 */
export async function createSupplierPurchaseReturnAction(
  input: unknown,
): Promise<AdminActionResult<CreateSupplierPurchaseReturnResult>> {
  const { admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSupplierPurchaseReturnSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const existing = await db.supplierPurchaseReturn.findUnique({
    where: { idempotencyKey: parsed.data.idempotencyKey },
    select: { id: true, returnNumber: true },
  });
  if (existing) {
    return { success: true, id: existing.id, returnNumber: existing.returnNumber };
  }

  const purchase = await db.supplierPurchase.findUnique({
    where: { id: parsed.data.purchaseId },
    select: { id: true, supplierId: true },
  });
  if (!purchase) {
    return { success: false, error: { type: "NOT_FOUND", message: "Purchase not found." } };
  }

  const variantIds = parsed.data.items.map((item) => item.productVariantId);
  const uniqueVariantIds = [...new Set(variantIds)];
  if (uniqueVariantIds.length !== variantIds.length) {
    return { success: false, error: { type: "VALIDATION", message: "Each size can only appear once per return." } };
  }

  try {
    const created = await db.$transaction(async (tx) => {
      // Fresh, in-transaction reads for every rule that can't be a
      // plain database constraint: received quantity, already-returned
      // quantity, and current stock, all recomputed from the
      // underlying rows rather than trusted from any prior read —
      // never a stored "remaining returnable" column (Part 5).
      const [variants, receiptItems, returnItems] = await Promise.all([
        tx.productVariant.findMany({ where: { id: { in: uniqueVariantIds } }, select: { id: true, stockQuantity: true } }),
        tx.supplierPurchaseReceiptItem.findMany({
          where: { receipt: { purchaseId: parsed.data.purchaseId }, productVariantId: { in: uniqueVariantIds } },
          select: { productVariantId: true, quantity: true },
        }),
        tx.supplierPurchaseReturnItem.findMany({
          where: { return: { purchaseId: parsed.data.purchaseId, status: "COMPLETED" }, productVariantId: { in: uniqueVariantIds } },
          select: { productVariantId: true, quantity: true },
        }),
      ]);

      const variantMap = new Map(variants.map((v) => [v.id, v]));
      const receivedByVariant = new Map<string, number>();
      for (const item of receiptItems) receivedByVariant.set(item.productVariantId, (receivedByVariant.get(item.productVariantId) ?? 0) + item.quantity);
      const returnedByVariant = new Map<string, number>();
      for (const item of returnItems) returnedByVariant.set(item.productVariantId, (returnedByVariant.get(item.productVariantId) ?? 0) + item.quantity);

      for (const item of parsed.data.items) {
        const variant = variantMap.get(item.productVariantId);
        if (!variant) {
          throw new SupplierReturnValidationError("One of the selected sizes could not be found.");
        }
        const receivedQuantity = receivedByVariant.get(item.productVariantId) ?? 0;
        const alreadyReturnedQuantity = returnedByVariant.get(item.productVariantId) ?? 0;
        const returnableQuantity = receivedQuantity - alreadyReturnedQuantity;
        if (item.quantity > returnableQuantity) {
          throw new SupplierReturnValidationError(
            `Cannot return ${item.quantity} — only ${Math.max(0, returnableQuantity)} of ${receivedQuantity} received are still returnable.`,
          );
        }
        if (item.quantity > variant.stockQuantity) {
          throw new SupplierReturnValidationError(
            `Cannot return ${item.quantity} — only ${variant.stockQuantity} currently in stock.`,
          );
        }
      }

      let returnRow: { id: string; returnNumber: string } | null = null;
      for (let attempt = 0; attempt < MAX_RETURN_NUMBER_ATTEMPTS; attempt++) {
        const returnNumber = generateSupplierPurchaseReturnNumber(parsed.data.returnDate);
        try {
          const now = new Date();
          returnRow = await tx.supplierPurchaseReturn.create({
            data: {
              purchaseId: parsed.data.purchaseId,
              returnNumber,
              returnDate: parsed.data.returnDate,
              status: "COMPLETED",
              reason: parsed.data.reason,
              reasonNote: parsed.data.reasonNote || null,
              reference: parsed.data.reference || null,
              notes: parsed.data.notes || null,
              createdByAdminUserId: admin.id,
              confirmedByAdminUserId: admin.id,
              confirmedAt: now,
              idempotencyKey: parsed.data.idempotencyKey,
              items: { create: parsed.data.items.map((item) => ({ productVariantId: item.productVariantId, quantity: item.quantity })) },
            },
            select: { id: true, returnNumber: true },
          });
          break;
        } catch (err) {
          if (isUniqueConstraintErrorOn(err, "returnNumber")) continue; // astronomically unlikely collision — try a fresh number
          throw err;
        }
      }
      if (!returnRow) throw new Error("Could not generate a unique supplier return number.");

      for (const item of parsed.data.items) {
        await applyInventoryDelta(tx, {
          productVariantId: item.productVariantId,
          delta: -item.quantity,
          reason: "SUPPLIER_RETURN",
          adminUserId: admin.id,
          supplierPurchaseReturnId: returnRow.id,
        });
      }

      return returnRow;
    });

    revalidateReturnViews(purchase.supplierId, purchase.id, created.id);
    return { success: true, id: created.id, returnNumber: created.returnNumber };
  } catch (error) {
    if (error instanceof SupplierReturnValidationError) {
      return { success: false, error: { type: "VALIDATION", message: error.message } };
    }
    if (error instanceof InsufficientStockError) {
      return { success: false, error: { type: "VALIDATION", message: "Stock changed since this page loaded — reload and try again." } };
    }
    throw error;
  }
}
