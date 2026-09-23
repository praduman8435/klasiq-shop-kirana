import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { deleteProductPhotoIfUnused, getProductPhoto, saveProductPhoto } = await import("@/server/product-photos");
const { productPhotoIdFromUrl, PRODUCT_PHOTO_MAX_BYTES } = await import("@/lib/product-photos");

const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);
const savedIds: string[] = [];

afterAll(async () => {
  await db.productPhoto.deleteMany({ where: { id: { in: savedIds } } });
  await db.$disconnect();
});

describe("saveProductPhoto", () => {
  it("stores the bytes with the sniffed type and returns its URL", async () => {
    const result = await saveProductPhoto(jpeg);
    expect(result.success).toBe(true);
    if (!result.success) return;
    const id = productPhotoIdFromUrl(result.url)!;
    savedIds.push(id);

    const photo = await getProductPhoto(id);
    expect(photo?.contentType).toBe("image/jpeg");
    expect(new Uint8Array(photo!.data)).toEqual(jpeg);
  });

  it("refuses non-images and oversized files", async () => {
    expect((await saveProductPhoto(new TextEncoder().encode("<svg/>"))).success).toBe(false);
    expect((await saveProductPhoto(new Uint8Array(0))).success).toBe(false);
    const big = new Uint8Array(PRODUCT_PHOTO_MAX_BYTES + 1);
    big.set(jpeg);
    expect((await saveProductPhoto(big)).success).toBe(false);
  });
});

describe("deleteProductPhotoIfUnused", () => {
  it("deletes a photo no product uses any more", async () => {
    const result = await saveProductPhoto(jpeg);
    if (!result.success) throw new Error(result.message);
    const id = productPhotoIdFromUrl(result.url)!;
    savedIds.push(id);

    await deleteProductPhotoIfUnused(result.url);
    expect(await getProductPhoto(id)).toBeNull();
  });

  it("leaves bundled images alone", async () => {
    await expect(deleteProductPhotoIfUnused("/products/toor-dal.webp")).resolves.toBeUndefined();
  });
});
