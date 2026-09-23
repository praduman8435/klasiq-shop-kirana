"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { rupeesToPaise } from "@/lib/money";
import {
  addSupplierPaymentAttachmentSchema,
  createSupplierPaymentSchema,
  removeSupplierPaymentAttachmentSchema,
  updateSupplierPaymentDetailsSchema,
} from "@/lib/validation/admin-supplier-payments";

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

function revalidateSupplierPaymentViews(supplierId: string, paymentId?: string, purchaseIds: string[] = []) {
  revalidatePath(`/admin/suppliers/${supplierId}`);
  if (paymentId) revalidatePath(`/admin/suppliers/${supplierId}/payments/${paymentId}`);
  for (const purchaseId of purchaseIds) revalidatePath(`/admin/suppliers/${supplierId}/purchases/${purchaseId}`);
}

/** Thrown only for accounting rules that require a FRESH read inside the
 *  transaction (cross-supplier allocation, allocation > current
 *  outstanding) — caught outside and mapped back to a VALIDATION result,
 *  the same "domain error aborts the transaction, then gets translated"
 *  shape `CounterSaleDomainError` already establishes
 *  (src/server/commerce/counter-sale.ts). */
class SupplierPaymentValidationError extends Error {}

export type CreateSupplierPaymentResult = { success: true; id: string };

/**
 * Section 10/11/18 — the single most important invariant in this file:
 * this action creates ONLY a SupplierPayment + its PaymentAllocation(s)
 * + SupplierPaymentAttachment(s), all in one transaction. There is
 * deliberately no ProductVariant/InventoryAdjustment read or write
 * anywhere here, matching `createSupplierPurchaseAction`'s own identical
 * guarantee (Phase 4 Part 2) — supplier accounting stays completely
 * independent of inventory.
 */
export async function createSupplierPaymentAction(input: unknown): Promise<AdminActionResult<CreateSupplierPaymentResult>> {
  const { admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSupplierPaymentSchema.safeParse(input);
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

  const amountInPaise = rupeesToPaise(parsed.data.amountInRupees);
  const allocationInputs = parsed.data.allocations.map((allocation) => ({
    purchaseId: allocation.purchaseId,
    amountInPaise: rupeesToPaise(allocation.amountInRupees),
  }));

  // The allocation UI offers exactly one row per outstanding purchase —
  // a duplicate purchaseId here can only mean a malformed/tampered
  // submission, never a legitimate "split allocation" (that's just one
  // larger allocation amount on the same row).
  const uniquePurchaseIds = [...new Set(allocationInputs.map((a) => a.purchaseId))];
  if (uniquePurchaseIds.length !== allocationInputs.length) {
    return { success: false, error: { type: "VALIDATION", message: "Each purchase can only be allocated once per payment." } };
  }

  const allocatedTotalInPaise = allocationInputs.reduce((sum, a) => sum + a.amountInPaise, 0);
  if (allocatedTotalInPaise > amountInPaise) {
    return { success: false, error: { type: "VALIDATION", message: "Allocated amount cannot exceed the payment amount." } };
  }

  try {
    const payment = await db.$transaction(async (tx) => {
      if (allocationInputs.length > 0) {
        // One query for every referenced purchase (with its own
        // existing payment AND credit allocations nested) — not one
        // query per allocation — to both validate and compute fresh
        // outstanding at once. Phase 4 Part 6 — `creditAllocations` was
        // added here so a payment can never be allocated past the TRUE
        // remaining balance once a SupplierCredit has also been applied
        // to this purchase; see `getPurchasePaymentInfo`'s own doc
        // comment (src/server/queries/admin/supplier-payments.ts) for
        // the full reasoning. Every purchase with no credits (the only
        // case that existed before Part 6) sees byte-identical behavior.
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
            throw new SupplierPaymentValidationError("One of the selected purchases could not be found.");
          }
          if (purchase.supplierId !== parsed.data.supplierId) {
            throw new SupplierPaymentValidationError("A payment can only be allocated to purchases from the same supplier.");
          }
          const alreadyPaidInPaise = purchase.allocations.reduce((sum, a) => sum + a.amountInPaise, 0);
          const alreadyCreditedInPaise = purchase.creditAllocations.reduce((sum, a) => sum + a.amountInPaise, 0);
          const outstandingInPaise = purchase.totalInPaise - alreadyPaidInPaise - alreadyCreditedInPaise;
          if (allocation.amountInPaise > outstandingInPaise) {
            throw new SupplierPaymentValidationError("Allocation cannot exceed that purchase's remaining outstanding amount.");
          }
        }
      }

      return tx.supplierPayment.create({
        data: {
          supplierId: parsed.data.supplierId,
          paymentDate: parsed.data.paymentDate,
          amountInPaise,
          paymentMethod: parsed.data.paymentMethod,
          collectedByName: parsed.data.collectedByName,
          reference: parsed.data.reference || null,
          notes: parsed.data.notes || null,
          createdByAdminUserId: admin.id,
          allocations: { create: allocationInputs },
          attachments: {
            create: parsed.data.attachments.map((attachment) => ({
              url: attachment.url,
              originalFilename: attachment.originalFilename || null,
            })),
          },
        },
      });
    });

    revalidateSupplierPaymentViews(parsed.data.supplierId, payment.id, uniquePurchaseIds);
    return { success: true, id: payment.id };
  } catch (error) {
    if (error instanceof SupplierPaymentValidationError) {
      return { success: false, error: { type: "VALIDATION", message: error.message } };
    }
    throw error;
  }
}

/**
 * Section 17 — deliberately does NOT touch `amountInPaise` or
 * `allocations`. Payments are financial records; this phase keeps the
 * amount and its allocations immutable once created (the brief's own
 * fallback for anything "too large for this phase": document as
 * deferred rather than build partial, riskier edit support). Only the
 * descriptive/audit fields below are editable.
 */
export async function updateSupplierPaymentDetailsAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateSupplierPaymentDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const current = await db.supplierPayment.findUnique({ where: { id: parsed.data.id }, select: { supplierId: true } });
  if (!current) {
    return { success: false, error: { type: "NOT_FOUND", message: "Payment not found." } };
  }

  await db.supplierPayment.update({
    where: { id: parsed.data.id },
    data: {
      paymentDate: parsed.data.paymentDate,
      paymentMethod: parsed.data.paymentMethod,
      collectedByName: parsed.data.collectedByName,
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
    },
  });

  revalidateSupplierPaymentViews(current.supplierId, parsed.data.id);
  return { success: true };
}

export type AddSupplierPaymentAttachmentResult = { success: true; id: string };

export async function addSupplierPaymentAttachmentAction(
  input: unknown,
): Promise<AdminActionResult<AddSupplierPaymentAttachmentResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = addSupplierPaymentAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const payment = await db.supplierPayment.findUnique({ where: { id: parsed.data.paymentId }, select: { supplierId: true } });
  if (!payment) {
    return { success: false, error: { type: "NOT_FOUND", message: "Payment not found." } };
  }

  const attachment = await db.supplierPaymentAttachment.create({
    data: {
      paymentId: parsed.data.paymentId,
      url: parsed.data.url,
      originalFilename: parsed.data.originalFilename || null,
    },
  });

  revalidateSupplierPaymentViews(payment.supplierId, parsed.data.paymentId);
  return { success: true, id: attachment.id };
}

export async function removeSupplierPaymentAttachmentAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = removeSupplierPaymentAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const attachment = await db.supplierPaymentAttachment.findUnique({
    where: { id: parsed.data.id },
    select: { paymentId: true, payment: { select: { supplierId: true } } },
  });
  if (!attachment) {
    return { success: false, error: { type: "NOT_FOUND", message: "Attachment not found." } };
  }

  await db.supplierPaymentAttachment.delete({ where: { id: parsed.data.id } });

  revalidateSupplierPaymentViews(attachment.payment.supplierId, attachment.paymentId);
  return { success: true };
}
