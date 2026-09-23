import { describe, expect, it } from "vitest";
import { productFormSchema, variantFormSchema } from "@/lib/validation/admin-products";

describe("productFormSchema", () => {
  function base(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name: "White Shirt",
      slug: "white-shirt",
      categoryId: "cat_123",
      schoolId: null,
      isActive: true,
      ...overrides,
    };
  }

  it("accepts a valid generic product", () => {
    expect(productFormSchema.safeParse(base()).success).toBe(true);
  });

  it("rejects an uppercase slug", () => {
    expect(productFormSchema.safeParse(base({ slug: "White-Shirt" })).success).toBe(false);
  });

  it("rejects a slug with spaces", () => {
    expect(productFormSchema.safeParse(base({ slug: "white shirt" })).success).toBe(false);
  });

  it("rejects a missing category", () => {
    expect(productFormSchema.safeParse(base({ categoryId: "" })).success).toBe(false);
  });

  it("accepts a school-specific product (schoolId set)", () => {
    expect(productFormSchema.safeParse(base({ schoolId: "school_1" })).success).toBe(true);
  });
});

describe("variantFormSchema", () => {
  function base(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      size: "28",
      sku: "WS-28",
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

  it("rejects a missing SKU", () => {
    expect(variantFormSchema.safeParse(base({ sku: "" })).success).toBe(false);
  });
});
