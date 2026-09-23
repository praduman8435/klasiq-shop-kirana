"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { rupeesToPaise } from "@/lib/money";
import { generateSupplierCreditNumber } from "@/lib/supplier-credit-number";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import { createSupplierCreditSchema } from "@/lib/validation/admin-supplier-credits";

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

function revalidateCreditViews(supplierId: string, creditId?: string, purchaseIds: string[] = []) {
  revalidatePath(`/admin/suppliers/${supplierId}`);
  if (creditId) revalidatePath(`/admin/suppliers/${supplierId}/credits/${creditId}`);
  for (const purchaseId of purchaseIds) revalidatePath(`/admin/suppliers/${supplierId}/purchases/${purchaseId}`);
}

/** Thrown only for accounting rules that require a FRESH read inside the
 *  transaction — same domain-error-aborts-the-transaction shape as
 *  `SupplierPaymentValidationError` (Phase 4 Part 3). */
class SupplierCreditValidationError extends Error {}

const MAX_CREDIT_NUMBER_ATTEMPTS = 5;

export type CreateSupplierCreditResult = { success: true; id: string; creditNumber: string };

/**
 * Section 2/19 — the single most important invariant in this file: this
 * action creates ONLY a SupplierCredit + its CreditAllocation(s), all in
 * one transaction. There is deliberately no ProductVariant/
 * InventoryAdjustment read or write anywhere here, and no automatic
 * creation from a SupplierPurchaseReturn — `sourceReturnId` is CONTEXT
 * an admin optionally attaches by hand, never inferred. Purchase/Bill
 * totals and Payment/PaymentAllocation amounts are never mutated —
 * allocating a credit only ever changes what `getPurchasePaymentInfo`
 * DERIVES as outstanding, never a stored figure.
 */
export async function createSupplierCreditAction(input: unknown): Promise<AdminActionResult<CreateSupplierCreditResult>> {
  const { admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSupplierCreditSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const supplier = await db.supplier.findUnique({ where: { id: parsed.data.supplierId }, select: { id: true } });
  if (!supplier) {
    return { success: false, error: { type: "NOT_FOUND", message: "Supplier not found." } };
  }

  if (parsed.data.sourceReturnId) {
    const sourceReturn = await db.supplierPurchaseReturn.findUnique({
      where: { id: parsed.data.sourceReturnId },
      select: { purchase: { select: { supplierId: true } } },
    });
    if (!sourceReturn) {
      return { success: false, error: { type: "NOT_FOUND", message: "Linked supplier return not found." } };
    }
    if (sourceReturn.purchase.supplierId !== parsed.data.supplierId) {
      return { success: false, error: { type: "VALIDATION", message: "The linked return must belong to the same supplier." } };
    }
  }

  const amountInPaise = rupeesToPaise(parsed.data.amountInRupees);
  const allocationInputs = parsed.data.allocations.map((allocation) => ({
    purchaseId: allocation.purchaseId,
    amountInPaise: rupeesToPaise(allocation.amountInRupees),
  }));

  const uniquePurchaseIds = [...new Set(allocationInputs.map((a) => a.purchaseId))];
  if (uniquePurchaseIds.length !== allocationInputs.length) {
    return { success: false, error: { type: "VALIDATION", message: "Each purchase can only be allocated once per credit." } };
  }

  const allocatedTotalInPaise = allocationInputs.reduce((sum, a) => sum + a.amountInPaise, 0);
  if (allocatedTotalInPaise > amountInPaise) {
    return { success: false, error: { type: "VALIDATION", message: "Allocated amount cannot exceed the credit amount." } };
  }

  try {
    const created = await db.$transaction(async (tx) => {
      if (allocationInputs.length > 0) {
        // One query for every referenced purchase, with BOTH its
        // existing payment and credit allocations nested — the true
        // outstanding ceiling nets both, exactly like
        // `createSupplierPaymentAction`'s own identical check (Part 3,
        // updated Part 6).
        const purchases = await tx.supplierPurchase.findMany({
          where: { id: { in: uniquePurchaseIds } },
          select: {
            id: true,
            supplierId: true,
            totalInPaise: true,
            allocations: { select: { amountInPaise: true } },
            creditAllocations: { select: { amountInPaise: true } },
          },
        });
        const purchaseMap = new Map(purchases.map((p) => [p.id, p]));

        for (const allocation of allocationInputs) {
          const purchase = purchaseMap.get(allocation.purchaseId);
          if (!purchase) {
            throw new SupplierCreditValidationError("One of the selected purchases could not be found.");
          }
          if (purchase.supplierId !== parsed.data.supplierId) {
            throw new SupplierCreditValidationError("A credit can only be allocated to purchases from the same supplier.");
          }
          const alreadyPaidInPaise = purchase.allocations.reduce((sum, a) => sum + a.amountInPaise, 0);
          const alreadyCreditedInPaise = purchase.creditAllocations.reduce((sum, a) => sum + a.amountInPaise, 0);
          const outstandingInPaise = purchase.totalInPaise - alreadyPaidInPaise - alreadyCreditedInPaise;
          if (allocation.amountInPaise > outstandingInPaise) {
            throw new SupplierCreditValidationError("Allocation cannot exceed that purchase's remaining outstanding amount.");
          }
        }
      }

      let creditRow: { id: string; creditNumber: string } | null = null;
      for (let attempt = 0; attempt < MAX_CREDIT_NUMBER_ATTEMPTS; attempt++) {
        const creditNumber = generateSupplierCreditNumber(parsed.data.creditDate);
        try {
          creditRow = await tx.supplierCredit.create({
            data: {
              supplierId: parsed.data.supplierId,
              creditNumber,
              creditDate: parsed.data.creditDate,
              amountInPaise,
              reason: parsed.data.reason,
              reference: parsed.data.reference || null,
              notes: parsed.data.notes || null,
              sourceReturnId: parsed.data.sourceReturnId || null,
              createdByAdminUserId: admin.id,
              allocations: { create: allocationInputs },
            },
            select: { id: true, creditNumber: true },
          });
          break;
        } catch (err) {
          if (isUniqueConstraintErrorOn(err, "creditNumber")) continue; // astronomically unlikely collision — try a fresh number
          throw err;
        }
      }
      if (!creditRow) throw new Error("Could not generate a unique supplier credit number.");

      return creditRow;
    });

    revalidateCreditViews(parsed.data.supplierId, created.id, uniquePurchaseIds);
    return { success: true, id: created.id, creditNumber: created.creditNumber };
  } catch (error) {
    if (error instanceof SupplierCreditValidationError) {
      return { success: false, error: { type: "VALIDATION", message: error.message } };
    }
    throw error;
  }
}
