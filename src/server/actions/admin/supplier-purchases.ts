"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { rupeesToPaise } from "@/lib/money";
import {
  addSupplierPurchaseBillAttachmentSchema,
  createSupplierPurchaseSchema,
  removeSupplierPurchaseBillAttachmentSchema,
  updateSupplierPurchaseBillSchema,
  updateSupplierPurchaseDetailsSchema,
} from "@/lib/validation/admin-supplier-purchases";

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

function revalidateSupplierPurchaseViews(supplierId: string, purchaseId?: string) {
  revalidatePath(`/admin/suppliers/${supplierId}`);
  if (purchaseId) revalidatePath(`/admin/suppliers/${supplierId}/purchases/${purchaseId}`);
}

export type CreateSupplierPurchaseResult = { success: true; id: string };

/**
 * Section 8/12 — Part 2's single most important invariant: this action
 * creates ONLY a SupplierPurchase + its SupplierPurchaseBill(s) +
 * SupplierPurchaseBillAttachment(s). There is deliberately no
 * ProductVariant/InventoryAdjustment read or write anywhere in this
 * file — a purchase is a pure accounting/record-keeping event until a
 * separate, later "inventory receiving" phase exists. `totalInPaise` is
 * never taken from the client; it is always the freshly-summed
 * `amountInPaise` of the bills being persisted IN THIS SAME
 * transaction, so the stored total can never drift from its bills (Part
 * 2's "purchase total = sum of bills" requirement).
 */
export async function createSupplierPurchaseAction(
  input: unknown,
): Promise<AdminActionResult<CreateSupplierPurchaseResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createSupplierPurchaseSchema.safeParse(input);
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

  const billsData = parsed.data.bills.map((bill) => ({
    billNumber: bill.billNumber || null,
    billDate: bill.billDate,
    amountInPaise: rupeesToPaise(bill.amountInRupees),
    notes: bill.notes || null,
    attachments: {
      create: bill.attachments.map((attachment) => ({
        url: attachment.url,
        originalFilename: attachment.originalFilename || null,
      })),
    },
  }));
  const totalInPaise = billsData.reduce((sum, bill) => sum + bill.amountInPaise, 0);

  const purchase = await db.$transaction(async (tx) => {
    return tx.supplierPurchase.create({
      data: {
        supplierId: parsed.data.supplierId,
        purchaseDate: parsed.data.purchaseDate,
        reference: parsed.data.reference || null,
        notes: parsed.data.notes || null,
        totalInPaise,
        bills: { create: billsData },
      },
    });
  });

  revalidateSupplierPurchaseViews(parsed.data.supplierId, purchase.id);
  return { success: true, id: purchase.id };
}

export async function updateSupplierPurchaseDetailsAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateSupplierPurchaseDetailsSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const current = await db.supplierPurchase.findUnique({ where: { id: parsed.data.id }, select: { supplierId: true } });
  if (!current) {
    return { success: false, error: { type: "NOT_FOUND", message: "Purchase not found." } };
  }

  await db.supplierPurchase.update({
    where: { id: parsed.data.id },
    data: {
      purchaseDate: parsed.data.purchaseDate,
      reference: parsed.data.reference || null,
      notes: parsed.data.notes || null,
    },
  });

  revalidateSupplierPurchaseViews(current.supplierId, parsed.data.id);
  return { success: true };
}

/**
 * Editing a bill's amount changes the accounting total for its parent
 * purchase — both writes happen in one transaction so the purchase's
 * `totalInPaise` can never end up out of sync with its bills, the same
 * "recompute the derived total from the bills actually being persisted"
 * rule `createSupplierPurchaseAction` establishes at creation time.
 */
export async function updateSupplierPurchaseBillAction(input: unknown): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateSupplierPurchaseBillSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const bill = await db.supplierPurchaseBill.findUnique({
    where: { id: parsed.data.id },
    select: { purchaseId: true, purchase: { select: { supplierId: true } } },
  });
  if (!bill) {
    return { success: false, error: { type: "NOT_FOUND", message: "Bill not found." } };
  }

  await db.$transaction(async (tx) => {
    await tx.supplierPurchaseBill.update({
      where: { id: parsed.data.id },
      data: {
        billNumber: parsed.data.billNumber || null,
        billDate: parsed.data.billDate,
        amountInPaise: rupeesToPaise(parsed.data.amountInRupees),
        notes: parsed.data.notes || null,
      },
    });

    const siblingBills = await tx.supplierPurchaseBill.findMany({
      where: { purchaseId: bill.purchaseId },
      select: { amountInPaise: true },
    });
    const totalInPaise = siblingBills.reduce((sum, b) => sum + b.amountInPaise, 0);
    await tx.supplierPurchase.update({ where: { id: bill.purchaseId }, data: { totalInPaise } });
  });

  revalidateSupplierPurchaseViews(bill.purchase.supplierId, bill.purchaseId);
  return { success: true };
}

export type AddSupplierPurchaseBillAttachmentResult = { success: true; id: string };

export async function addSupplierPurchaseBillAttachmentAction(
  input: unknown,
): Promise<AdminActionResult<AddSupplierPurchaseBillAttachmentResult>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = addSupplierPurchaseBillAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: parsed.error.issues[0]?.message ?? "Invalid request." },
    };
  }

  const bill = await db.supplierPurchaseBill.findUnique({
    where: { id: parsed.data.billId },
    select: { purchaseId: true, purchase: { select: { supplierId: true } } },
  });
  if (!bill) {
    return { success: false, error: { type: "NOT_FOUND", message: "Bill not found." } };
  }

  const attachment = await db.supplierPurchaseBillAttachment.create({
    data: {
      billId: parsed.data.billId,
      url: parsed.data.url,
      originalFilename: parsed.data.originalFilename || null,
    },
  });

  revalidateSupplierPurchaseViews(bill.purchase.supplierId, bill.purchaseId);
  return { success: true, id: attachment.id };
}

export async function removeSupplierPurchaseBillAttachmentAction(
  input: unknown,
): Promise<AdminActionResult<{ success: true }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = removeSupplierPurchaseBillAttachmentSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid request." } };
  }

  const attachment = await db.supplierPurchaseBillAttachment.findUnique({
    where: { id: parsed.data.id },
    select: { bill: { select: { purchaseId: true, purchase: { select: { supplierId: true } } } } },
  });
  if (!attachment) {
    return { success: false, error: { type: "NOT_FOUND", message: "Attachment not found." } };
  }

  await db.supplierPurchaseBillAttachment.delete({ where: { id: parsed.data.id } });

  revalidateSupplierPurchaseViews(attachment.bill.purchase.supplierId, attachment.bill.purchaseId);
  return { success: true };
}
