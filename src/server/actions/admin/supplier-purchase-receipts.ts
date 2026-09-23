"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { rupeesToPaise } from "@/lib/money";
import { applyInventoryDelta } from "@/server/commerce/inventory";
import { createSupplierPurchaseReceiptSchema } from "@/lib/validation/admin-supplier-purchase-receipts";

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

function revalidateReceivingViews(supplierId: string, purchaseId: string, receiptId?: string) {
  revalidatePath(`/admin/suppliers/${supplierId}`);
  revalidatePath(`/admin/suppliers/${supplierId}/purchases/${purchaseId}`);
  if (receiptId) revalidatePath(`/admin/suppliers/${supplierId}/purchases/${purchaseId}/receive/${receiptId}`);
  // The one and only place this phase's inventory movement is visible
  // outside the supplier area — same revalidation targets
  // `adjustInventoryByDeltaAction` itself already uses
  // (src/server/actions/admin/inventory.ts) for every other stock
  // change, so /admin/inventory reflects the increase without a manual
  // refresh.
  revalidatePath("/admin/inventory");
  revalidatePath("/admin");
}

/** Thrown only for accounting-adjacent validation that requires a FRESH
 *  read inside the transaction (variant existence) — same
 *  domain-error-aborts-the-transaction shape as
 *  `SupplierPaymentValidationError` (Phase 4 Part 3). */
class ReceiptValidationError extends Error {}

export type CreateSupplierPurchaseReceiptResult = { success: true; id: string };

/**
 * Section 9/25/26 — the single most important invariant in this file:
 * inventory ONLY ever moves through this one explicit action. Purchase
 * creation (Part 2) and Payment creation (Part 3) never call this or
 * touch ProductVariant/InventoryAdjustment at all — there is no
 * "onPurchaseCreated" hook anywhere in this codebase, by construction.
 * This action creates the SupplierPurchaseReceipt + its line items +
 * one InventoryAdjustment per line, all inside ONE transaction, reusing
 * `applyInventoryDelta` (src/server/commerce/inventory.ts) — the SAME
 * guarded delta-update + audit-row primitive every other stock increase
 * in this codebase already goes through (return restores, exchange
 * issues) — rather than inventing a second stock-mutation mechanism.
 * Purchase/Bill totals and Payment/Allocation amounts are never read or
 * written here — inventory valuation and accounting stay fully
 * independent, exactly as Part 26 requires.
 */
export async function createSupplierPurchaseReceiptAction(
  input: unknown,
): Promise<AdminActionResult<CreateSupplierPurchaseReceiptResult>> {
  const { admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSupplierPurchaseReceiptSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const variantIds = parsed.data.items.map((item) => item.productVariantId);
  const uniqueVariantIds = [...new Set(variantIds)];
  if (uniqueVariantIds.length !== variantIds.length) {
    return { success: false, error: { type: "VALIDATION", message: "Each pack size can only appear once per receipt." } };
  }

  const purchase = await db.supplierPurchase.findUnique({
    where: { id: parsed.data.purchaseId },
    select: { id: true, supplierId: true },
  });
  if (!purchase) {
    return { success: false, error: { type: "NOT_FOUND", message: "Purchase not found." } };
  }

  try {
    const receipt = await db.$transaction(async (tx) => {
      // One query for every referenced variant — not one per line —
      // purely to validate existence before creating anything; the
      // actual stock write below re-reads each row fresh inside
      // `applyInventoryDelta` itself.
      const variants = await tx.productVariant.findMany({
        where: { id: { in: uniqueVariantIds } },
        select: { id: true },
      });
      if (variants.length !== uniqueVariantIds.length) {
        throw new ReceiptValidationError("One of the selected pack sizes could not be found.");
      }

      const created = await tx.supplierPurchaseReceipt.create({
        data: {
          purchaseId: parsed.data.purchaseId,
          receivedAt: parsed.data.receivedAt,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          createdByAdminUserId: admin.id,
          items: {
            create: parsed.data.items.map((item) => ({
              productVariantId: item.productVariantId,
              quantity: item.quantity,
              unitCostInPaise: item.unitCostInRupees !== undefined ? rupeesToPaise(item.unitCostInRupees) : null,
            })),
          },
        },
      });

      for (const item of parsed.data.items) {
        await applyInventoryDelta(tx, {
          productVariantId: item.productVariantId,
          delta: item.quantity,
          reason: "STOCK_RECEIVED",
          adminUserId: admin.id,
          supplierPurchaseReceiptId: created.id,
        });
      }

      return created;
    });

    revalidateReceivingViews(purchase.supplierId, purchase.id, receipt.id);
    return { success: true, id: receipt.id };
  } catch (error) {
    if (error instanceof ReceiptValidationError) {
      return { success: false, error: { type: "VALIDATION", message: error.message } };
    }
    throw error;
  }
}
