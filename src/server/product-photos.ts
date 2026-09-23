import "server-only";
import { db } from "@/lib/db";
import {
  PRODUCT_PHOTO_MAX_BYTES,
  productPhotoIdFromUrl,
  productPhotoUrl,
  sniffProductPhotoType,
} from "@/lib/product-photos";

export type SaveProductPhotoResult = { success: true; url: string } | { success: false; message: string };

/** Stores one uploaded photo and returns the URL to put in
 * Product.imageUrl. The caller is responsible for admin auth. */
export async function saveProductPhoto(bytes: Uint8Array): Promise<SaveProductPhotoResult> {
  if (bytes.byteLength === 0)
    return {
      success: false,
      message: "That photo is empty. Please try again.",
    };
  if (bytes.byteLength > PRODUCT_PHOTO_MAX_BYTES) {
    return {
      success: false,
      message: "That photo is too large. Please try a different one.",
    };
  }
  const contentType = sniffProductPhotoType(bytes);
  if (!contentType)
    return {
      success: false,
      message: "Please choose a JPEG, PNG or WebP photo.",
    };

  const photo = await db.productPhoto.create({
    data: { contentType, byteSize: bytes.byteLength, data: Buffer.from(bytes) },
    select: { id: true },
  });
  return { success: true, url: productPhotoUrl(photo.id) };
}

export async function getProductPhoto(id: string) {
  return db.productPhoto.findUnique({
    where: { id },
    select: { contentType: true, data: true },
  });
}

/** Deletes the stored photo behind an old Product.imageUrl, unless another
 * product still uses it. A no-op for bundled or external images. */
export async function deleteProductPhotoIfUnused(url: string | null | undefined): Promise<void> {
  const id = productPhotoIdFromUrl(url);
  if (!id) return;
  const stillUsed = await db.product.count({ where: { imageUrl: url! } });
  if (stillUsed > 0) return;
  await db.productPhoto.deleteMany({ where: { id } });
}
