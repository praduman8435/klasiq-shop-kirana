import { describe, expect, it } from "vitest";
import { productPhotoIdFromUrl, productPhotoUrl, sniffProductPhotoType } from "@/lib/product-photos";

describe("sniffProductPhotoType", () => {
  it("detects JPEG, PNG and WebP from their magic bytes", () => {
    expect(sniffProductPhotoType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffProductPhotoType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]))).toBe("image/png");
    expect(sniffProductPhotoType(new TextEncoder().encode("RIFF\0\0\0\0WEBPVP8 "))).toBe("image/webp");
  });

  it("rejects anything else, whatever it claims to be", () => {
    expect(sniffProductPhotoType(new TextEncoder().encode("<svg onload=alert(1)>"))).toBeNull();
    expect(sniffProductPhotoType(new Uint8Array([]))).toBeNull();
  });
});

describe("productPhotoIdFromUrl", () => {
  it("round-trips an uploaded photo URL", () => {
    expect(productPhotoIdFromUrl(productPhotoUrl("cm1abc23"))).toBe("cm1abc23");
  });

  it("ignores bundled, external and malformed images", () => {
    expect(productPhotoIdFromUrl("/products/toor-dal.webp")).toBeNull();
    expect(productPhotoIdFromUrl("https://cdn.example/a.jpg")).toBeNull();
    expect(productPhotoIdFromUrl("/api/product-photos/../secrets")).toBeNull();
    expect(productPhotoIdFromUrl(null)).toBeNull();
  });
});
