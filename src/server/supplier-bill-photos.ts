import "server-only";
import { db } from "@/lib/db";
import { PRODUCT_PHOTO_MAX_BYTES, sniffProductPhotoType } from "@/lib/product-photos";

/** Where a signed-in admin views a bill photo. Never public. */
export const BILL_PHOTO_PATH = "/admin/bill-photos/";

export function billPhotoUrl(id: string): string {
  return `${BILL_PHOTO_PATH}${id}`;
}

export type SaveBillPhotoResult = { success: true; id: string } | { success: false; message: string };

/** Stores one bill photo (already shrunk on the phone). Caller checks
 * admin auth. Same byte cap and magic-byte type check as product photos. */
export async function saveBillPhoto(bytes: Uint8Array): Promise<SaveBillPhotoResult> {
  if (bytes.byteLength === 0) return { success: false, message: "That photo is empty. Please try again." };
  if (bytes.byteLength > PRODUCT_PHOTO_MAX_BYTES) {
    return { success: false, message: "That photo is too large. Please try a different one." };
  }
  const contentType = sniffProductPhotoType(bytes);
  if (!contentType) return { success: false, message: "Please choose a JPEG, PNG or WebP photo." };

  const photo = await db.supplierBillPhoto.create({
    data: { contentType, byteSize: bytes.byteLength, data: Buffer.from(bytes) },
    select: { id: true },
  });
  return { success: true, id: photo.id };
}

export async function getBillPhoto(id: string) {
  return db.supplierBillPhoto.findUnique({ where: { id }, select: { contentType: true, data: true } });
}
