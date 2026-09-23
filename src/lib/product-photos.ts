/** Where uploaded product photos are served: `/api/product-photos/{id}`. */
export const PRODUCT_PHOTO_PATH = "/api/product-photos/";

/** The phone shrinks every photo to 800x800 before upload (~50–150 KB),
 * so anything near this is not a photo we produced. Kept well under the
 * 1 MB Server Action body limit. */
export const PRODUCT_PHOTO_MAX_BYTES = 800 * 1024;

export const PRODUCT_PHOTO_TYPES = ["image/webp", "image/jpeg", "image/png"] as const;
export type ProductPhotoType = (typeof PRODUCT_PHOTO_TYPES)[number];

export function productPhotoUrl(id: string): string {
  return `${PRODUCT_PHOTO_PATH}${id}`;
}

/** The photo id inside a Product.imageUrl, or null when the image is
 * something else (a bundled /products/… file, an external link, none). */
export function productPhotoIdFromUrl(url: string | null | undefined): string | null {
  if (!url?.startsWith(PRODUCT_PHOTO_PATH)) return null;
  const id = url.slice(PRODUCT_PHOTO_PATH.length);
  return /^[a-z0-9]{1,40}$/.test(id) ? id : null;
}

/** What the bytes actually are, from their magic numbers — never trust the
 * browser-supplied MIME type alone. */
export function sniffProductPhotoType(bytes: Uint8Array): ProductPhotoType | null {
  const at = (i: number) => bytes[i];
  if (at(0) === 0xff && at(1) === 0xd8 && at(2) === 0xff) return "image/jpeg";
  if (at(0) === 0x89 && at(1) === 0x50 && at(2) === 0x4e && at(3) === 0x47) return "image/png";
  const ascii = (start: number, end: number) => String.fromCharCode(...bytes.slice(start, end));
  if (bytes.length >= 12 && ascii(0, 4) === "RIFF" && ascii(8, 12) === "WEBP") return "image/webp";
  return null;
}
