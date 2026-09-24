"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/session";
import { quickBillSchema, quickPaymentSchema, quickSupplierSchema } from "@/lib/validation/admin-supplier-quick";
import { db } from "@/lib/db";
import { billPhotoUrl, saveBillPhoto } from "@/server/supplier-bill-photos";
import {
  QuickEntryError,
  createQuickSupplier,
  recordQuickBill,
  recordQuickPayment,
} from "@/server/suppliers/quick-entry";

type Failure = { success: false; message: string };

const SIGN_IN_AGAIN: Failure = { success: false, message: "Please sign in again." };

function firstIssue(error: { issues: { message: string }[] }): Failure {
  return { success: false, message: error.issues[0]?.message ?? "Please check the form." };
}

function revalidateSupplier(supplierId: string) {
  revalidatePath("/admin/suppliers");
  revalidatePath(`/admin/suppliers/${supplierId}`);
}

/** Upload one bill photo (already shrunk on the phone). */
export async function uploadBillPhotoAction(formData: FormData): Promise<{ success: true; id: string } | Failure> {
  if (!(await getAdminSession())) return SIGN_IN_AGAIN;
  const file = formData.get("photo");
  if (!(file instanceof File)) return { success: false, message: "Please choose a photo." };
  return saveBillPhoto(new Uint8Array(await file.arrayBuffer()));
}

export async function quickCreateSupplierAction(input: unknown): Promise<{ success: true; id: string } | Failure> {
  if (!(await getAdminSession())) return SIGN_IN_AGAIN;
  const parsed = quickSupplierSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  const supplier = await createQuickSupplier(parsed.data);
  revalidatePath("/admin/suppliers");
  return { success: true, id: supplier.id };
}

export async function quickRecordBillAction(input: unknown): Promise<{ success: true; purchaseId: string } | Failure> {
  const admin = await getAdminSession();
  if (!admin) return SIGN_IN_AGAIN;
  const parsed = quickBillSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  try {
    const result = await recordQuickBill(parsed.data, admin);
    revalidateSupplier(parsed.data.supplierId);
    return { success: true, purchaseId: result.purchaseId };
  } catch (error) {
    if (error instanceof QuickEntryError) return { success: false, message: error.message };
    throw error;
  }
}

export async function quickRecordPaymentAction(
  input: unknown,
): Promise<{ success: true; billsPaidCount: number; advanceInPaise: number } | Failure> {
  const admin = await getAdminSession();
  if (!admin) return SIGN_IN_AGAIN;
  const parsed = quickPaymentSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);

  try {
    const result = await recordQuickPayment(parsed.data, admin);
    revalidateSupplier(parsed.data.supplierId);
    return { success: true, billsPaidCount: result.billsPaidCount, advanceInPaise: result.advanceInPaise };
  } catch (error) {
    if (error instanceof QuickEntryError) return { success: false, message: error.message };
    throw error;
  }
}

/** Bill page: photograph a bill that's already saved and attach it. */
export async function addPhotoToBillAction(formData: FormData): Promise<{ success: true } | Failure> {
  if (!(await getAdminSession())) return SIGN_IN_AGAIN;
  const billId = formData.get("billId");
  const file = formData.get("photo");
  if (typeof billId !== "string" || !(file instanceof File)) return { success: false, message: "Please choose a photo." };

  const bill = await db.supplierPurchaseBill.findUnique({
    where: { id: billId },
    select: { purchase: { select: { id: true, supplierId: true } }, _count: { select: { attachments: true } } },
  });
  if (!bill) return { success: false, message: "That bill no longer exists." };
  if (bill._count.attachments >= 10) return { success: false, message: "A bill can have up to 10 photos." };

  const saved = await saveBillPhoto(new Uint8Array(await file.arrayBuffer()));
  if (!saved.success) return saved;
  await db.supplierPurchaseBillAttachment.create({
    data: { billId, url: billPhotoUrl(saved.id), originalFilename: "Bill photo" },
  });

  revalidatePath(`/admin/suppliers/${bill.purchase.supplierId}/purchases/${bill.purchase.id}`);
  return { success: true };
}
