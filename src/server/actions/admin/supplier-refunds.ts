"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { rupeesToPaise } from "@/lib/money";
import { generateSupplierRefundNumber } from "@/lib/supplier-refund-number";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import {
  addSupplierRefundAttachmentSchema,
  createSupplierRefundSchema,
  removeSupplierRefundAttachmentSchema,
} from "@/lib/validation/admin-supplier-refunds";

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

function revalidateRefundViews(supplierId: string, refundId?: string) {
  revalidatePath(`/admin/suppliers/${supplierId}`);
  if (refundId) revalidatePath(`/admin/suppliers/${supplierId}/refunds/${refundId}`);
}

/** Thrown only for the one accounting rule that requires a FRESH read
 *  inside the transaction — a credit's remaining balance — same
 *  domain-error shape as `SupplierCreditValidationError`. */
class SupplierRefundValidationError extends Error {}

const MAX_REFUND_NUMBER_ATTEMPTS = 5;

export type CreateSupplierRefundResult = { success: true; id: string; refundNumber: string };

/**
 * Section 6/19 — creates ONLY a SupplierRefund + its attachments, in
 * one transaction. Never touches inventory, Purchase/Bill totals, or
 * Payment/PaymentAllocation. When `sourceCreditId` is set, validates
 * (with a fresh in-transaction read) that this refund does not draw the
 * linked credit's balance below zero — `credit.amountInPaise -
 * sum(existing allocations) - sum(existing refunds already linked to
 * it)` — so the same credit can never be spent twice across the two
 * possible paths (allocate to a purchase, or pay back as a refund). A
 * refund with no `sourceCreditId` at all skips this check entirely —
 * Part 6's own "a refund can exist independently" requirement.
 */
export async function createSupplierRefundAction(input: unknown): Promise<AdminActionResult<CreateSupplierRefundResult>> {
  const { admin, unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSupplierRefundSchema.safeParse(input);
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

  if (parsed.data.sourceCreditId) {
    const credit = await db.supplierCredit.findUnique({ where: { id: parsed.data.sourceCreditId }, select: { supplierId: true } });
    if (!credit) {
      return { success: false, error: { type: "NOT_FOUND", message: "Linked supplier credit not found." } };
    }
    if (credit.supplierId !== parsed.data.supplierId) {
      return { success: false, error: { type: "VALIDATION", message: "The linked credit must belong to the same supplier." } };
    }
  }

  try {
    const created = await db.$transaction(async (tx) => {
      if (parsed.data.sourceCreditId) {
        const credit = await tx.supplierCredit.findUniqueOrThrow({
          where: { id: parsed.data.sourceCreditId! },
          select: {
            amountInPaise: true,
            allocations: { select: { amountInPaise: true } },
            refunds: { select: { amountInPaise: true } },
          },
        });
        const allocatedInPaise = credit.allocations.reduce((sum, a) => sum + a.amountInPaise, 0);
        const refundedInPaise = credit.refunds.reduce((sum, r) => sum + r.amountInPaise, 0);
        const remainingInPaise = credit.amountInPaise - allocatedInPaise - refundedInPaise;
        if (amountInPaise > remainingInPaise) {
          throw new SupplierRefundValidationError("Refund cannot exceed the linked credit's remaining unallocated balance.");
        }
      }

      let refundRow: { id: string; refundNumber: string } | null = null;
      for (let attempt = 0; attempt < MAX_REFUND_NUMBER_ATTEMPTS; attempt++) {
        const refundNumber = generateSupplierRefundNumber(parsed.data.refundDate);
        try {
          refundRow = await tx.supplierRefund.create({
            data: {
              supplierId: parsed.data.supplierId,
              refundNumber,
              refundDate: parsed.data.refundDate,
              amountInPaise,
              refundMethod: parsed.data.refundMethod,
              receivedByName: parsed.data.receivedByName,
              reference: parsed.data.reference || null,
              notes: parsed.data.notes || null,
              sourceCreditId: parsed.data.sourceCreditId || null,
              sourceReturnId: parsed.data.sourceReturnId || null,
              createdByAdminUserId: admin.id,
              attachments: {
                create: parsed.data.attachments.map((attachment) => ({
                  url: attachment.url,
                  originalFilename: attachment.originalFilename || null,
                })),
              },
            },
            select: { id: true, refundNumber: true },
          });
          break;
        } catch (err) {
          if (isUniqueConstraintErrorOn(err, "refundNumber")) continue; // astronomically unlikely collision — try a fresh number
          throw err;
        }
      }
      if (!refundRow) throw new Error("Could not generate a unique supplier refund number.");

      return refundRow;
    });

    revalidateRefundViews(parsed.data.supplierId, created.id);
    return { success: true, id: created.id, refundNumber: created.refundNumber };
  } catch (error) {
    if (error instanceof SupplierRefundValidationError) {
      return { success: false, error: { type: "VALIDATION", message: error.message } };
    }
    throw error;
  }
}

export type AddSupplierRefundAttachmentResult = { success: true; id: string };

export async function addSupplierRefundAttachmentAction(
  input: unknown,
): Promise<AdminActionResult<AddSupplierRefundAttachmentResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = addSupplierRefundAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const refund = await db.supplierRefund.findUnique({ where: { id: parsed.data.refundId }, select: { supplierId: true } });
  if (!refund) {
    return { success: false, error: { type: "NOT_FOUND", message: "Refund not found." } };
  }

  const attachment = await db.supplierRefundAttachment.create({
    data: {
      refundId: parsed.data.refundId,
      url: parsed.data.url,
      originalFilename: parsed.data.originalFilename || null,
    },
  });

  revalidateRefundViews(refund.supplierId, parsed.data.refundId);
  return { success: true, id: attachment.id };
}

export async function removeSupplierRefundAttachmentAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = removeSupplierRefundAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const attachment = await db.supplierRefundAttachment.findUnique({
    where: { id: parsed.data.id },
    select: { refundId: true, refund: { select: { supplierId: true } } },
  });
  if (!attachment) {
    return { success: false, error: { type: "NOT_FOUND", message: "Attachment not found." } };
  }

  await db.supplierRefundAttachment.delete({ where: { id: parsed.data.id } });

  revalidateRefundViews(attachment.refund.supplierId, attachment.refundId);
  return { success: true };
}
