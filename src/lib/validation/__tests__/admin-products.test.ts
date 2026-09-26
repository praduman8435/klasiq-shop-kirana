import { describe, expect, it } from "vitest";
import { checkPriceAgainstMrp, productFormSchema, variantFormSchema } from "@/lib/validation/admin-products";

describe("productFormSchema", () => {
  function base(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name: "Toor Dal",
      slug: "toor-dal",
      categoryId: "cat_123",
      isActive: true,
      ...overrides,
    };
  }

  it("accepts a valid product with no brand (loose/unbranded goods)", () => {
    expect(productFormSchema.safeParse(base()).success).toBe(true);
  });

  it("accepts an uploaded or bundled photo path as the image", () => {
    for (const imageUrl of ["/api/product-photos/cm1abc", "/products/toor-dal.webp", "https://cdn.example/a.jpg", ""]) {
      expect(productFormSchema.safeParse(base({ imageUrl })).success).toBe(true);
    }
  });

  it("rejects a protocol-relative or non-URL image", () => {
    for (const imageUrl of ["//evil.example/a.jpg", "javascript:alert(1)", "not a url"]) {
      expect(productFormSchema.safeParse(base({ imageUrl })).success).toBe(false);
    }
  });

  it("rejects an uppercase slug", () => {
    expect(productFormSchema.safeParse(base({ slug: "Toor-Dal" })).success).toBe(false);
  });

  it("rejects a slug with spaces", () => {
    expect(productFormSchema.safeParse(base({ slug: "toor dal" })).success).toBe(false);
  });

  it("rejects a missing category", () => {
    expect(productFormSchema.safeParse(base({ categoryId: "" })).success).toBe(false);
  });

  it("accepts and trims a brand", () => {
    const result = productFormSchema.safeParse(base({ brand: "  Tata  " }));
    expect(result.success && result.data.brand).toBe("Tata");
  });

  it("rejects an over-long brand", () => {
    expect(productFormSchema.safeParse(base({ brand: "x".repeat(61) })).success).toBe(false);
  });
});

describe("variantFormSchema", () => {
  function base(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      size: "1 kg",
      sku: "TD-1KG",
      priceInRupees: 350,
      stockQuantity: 10,
      ...overrides,
    };
  }

  it("accepts a valid variant", () => {
    expect(variantFormSchema.safeParse(base()).success).toBe(true);
  });

  it("rejects a negative price", () => {
    const result = variantFormSchema.safeParse(base({ priceInRupees: -50 }));
    expect(result.success).toBe(false);
  });

  it("accepts a zero price (e.g. a promotional giveaway item)", () => {
    expect(variantFormSchema.safeParse(base({ priceInRupees: 0 })).success).toBe(true);
  });

  it("rejects negative stock", () => {
    const result = variantFormSchema.safeParse(base({ stockQuantity: -1 }));
    expect(result.success).toBe(false);
  });

  it("rejects a fractional stock quantity", () => {
    const result = variantFormSchema.safeParse(base({ stockQuantity: 2.5 }));
    expect(result.success).toBe(false);
  });

  it("allows a blank SKU (one is generated) but caps its length", () => {
    expect(variantFormSchema.safeParse(base({ sku: "" })).success).toBe(true);
    expect(variantFormSchema.safeParse(base({ sku: undefined })).success).toBe(true);
    expect(variantFormSchema.safeParse(base({ sku: "X".repeat(61) })).success).toBe(false);
  });

  it("accepts an MRP, a null MRP (clear it), or no MRP at all", () => {
    expect(variantFormSchema.safeParse(base({ mrpInRupees: 380 })).success).toBe(true);
    expect(variantFormSchema.safeParse(base({ mrpInRupees: null })).success).toBe(true);
    const omitted = variantFormSchema.safeParse(base());
    expect(omitted.success && omitted.data.mrpInRupees).toBeUndefined();
  });

  it("rejects a zero or negative MRP", () => {
    expect(variantFormSchema.safeParse(base({ mrpInRupees: 0 })).success).toBe(false);
    expect(variantFormSchema.safeParse(base({ mrpInRupees: -10 })).success).toBe(false);
  });
});

describe("checkPriceAgainstMrp", () => {
  it("allows a price below or equal to MRP", () => {
    expect(checkPriceAgainstMrp(35000, 38000)).toBeNull();
    expect(checkPriceAgainstMrp(38000, 38000)).toBeNull();
  });

  it("rejects a price above MRP, even by one paisa", () => {
    expect(checkPriceAgainstMrp(38001, 38000)).toMatch(/MRP/);
  });

  it("allows any price when there is no MRP (loose goods)", () => {
    expect(checkPriceAgainstMrp(999999, null)).toBeNull();
  });
});
