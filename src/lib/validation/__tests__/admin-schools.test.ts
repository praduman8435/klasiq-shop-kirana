import { describe, expect, it } from "vitest";
import { schoolFormSchema, addSetItemSchema } from "@/lib/validation/admin-schools";

describe("schoolFormSchema", () => {
  function base(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      name: "Demo Sunrise Public School",
      slug: "demo-sunrise-public-school",
      isActive: true,
      isVerifiedPartner: false,
      ...overrides,
    };
  }

  it("accepts a valid school", () => {
    expect(schoolFormSchema.safeParse(base()).success).toBe(true);
  });

  it("rejects a slug with uppercase letters", () => {
    expect(schoolFormSchema.safeParse(base({ slug: "Demo-Sunrise" })).success).toBe(false);
  });

  it("rejects a slug with consecutive hyphens", () => {
    expect(schoolFormSchema.safeParse(base({ slug: "demo--sunrise" })).success).toBe(false);
  });

  it("rejects a name that's too short", () => {
    expect(schoolFormSchema.safeParse(base({ name: "A" })).success).toBe(false);
  });

  it("rejects an invalid logo URL", () => {
    expect(schoolFormSchema.safeParse(base({ logoUrl: "not-a-url" })).success).toBe(false);
  });

  it("accepts an empty logo URL", () => {
    expect(schoolFormSchema.safeParse(base({ logoUrl: "" })).success).toBe(true);
  });
});

describe("addSetItemSchema", () => {
  it("rejects a zero quantity", () => {
    expect(
      addSetItemSchema.safeParse({ setId: "set_1", productId: "prod_1", quantity: 0 }).success,
    ).toBe(false);
  });

  it("accepts a positive quantity", () => {
    expect(
      addSetItemSchema.safeParse({ setId: "set_1", productId: "prod_1", quantity: 2 }).success,
    ).toBe(true);
  });
});
