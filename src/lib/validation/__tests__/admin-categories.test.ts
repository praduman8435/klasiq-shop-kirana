import { describe, expect, it } from "vitest";
import { categoryFormSchema, createCategorySchema, updateCategorySchema } from "@/lib/validation/admin-categories";

const valid = { name: "Stationery", slug: "stationery" };

describe("categoryFormSchema", () => {
  it("accepts a minimal valid category, defaulting displayInHeader/headerOrder", () => {
    const result = categoryFormSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayInHeader).toBe(false);
      expect(result.data.headerOrder).toBe(0);
    }
  });

  it("rejects an empty name", () => {
    expect(categoryFormSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects a name that's only whitespace", () => {
    expect(categoryFormSchema.safeParse({ ...valid, name: "   " }).success).toBe(false);
  });

  it("rejects an invalid slug (uppercase, spaces, leading/trailing hyphen)", () => {
    expect(categoryFormSchema.safeParse({ ...valid, slug: "Stationery" }).success).toBe(false);
    expect(categoryFormSchema.safeParse({ ...valid, slug: "school bags" }).success).toBe(false);
    expect(categoryFormSchema.safeParse({ ...valid, slug: "-uniforms" }).success).toBe(false);
    expect(categoryFormSchema.safeParse({ ...valid, slug: "uniforms-" }).success).toBe(false);
  });

  it("accepts an explicit displayInHeader + headerOrder", () => {
    const result = categoryFormSchema.safeParse({ ...valid, displayInHeader: true, headerOrder: 3 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.displayInHeader).toBe(true);
      expect(result.data.headerOrder).toBe(3);
    }
  });

  it("rejects a negative headerOrder", () => {
    expect(categoryFormSchema.safeParse({ ...valid, headerOrder: -1 }).success).toBe(false);
  });

  it("rejects a non-integer headerOrder", () => {
    expect(categoryFormSchema.safeParse({ ...valid, headerOrder: 1.5 }).success).toBe(false);
  });

  it("coerces a string headerOrder (e.g. from a form field) to a number", () => {
    const result = categoryFormSchema.safeParse({ ...valid, headerOrder: "2" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.headerOrder).toBe(2);
  });

  it("Phase 3.6.7 Part 2, section 10 — a garbage (non-numeric) headerOrder can never coerce into a number and slip past validation", () => {
    expect(categoryFormSchema.safeParse({ ...valid, headerOrder: "not-a-number" }).success).toBe(false);
  });

  it("section 10 — a non-boolean displayInHeader is rejected outright, never coerced to truthy", () => {
    expect(categoryFormSchema.safeParse({ ...valid, displayInHeader: "yes" }).success).toBe(false);
  });
});

describe("createCategorySchema / updateCategorySchema", () => {
  it("createCategorySchema is the plain form schema, no id", () => {
    expect(createCategorySchema.safeParse(valid).success).toBe(true);
  });

  it("updateCategorySchema requires an id", () => {
    expect(updateCategorySchema.safeParse(valid).success).toBe(false);
    expect(updateCategorySchema.safeParse({ ...valid, id: "cat-1" }).success).toBe(true);
  });
});
