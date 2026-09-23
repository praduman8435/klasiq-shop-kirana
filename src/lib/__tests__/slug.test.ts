import { describe, expect, it } from "vitest";
import { isValidSlug, slugify } from "@/lib/slug";

describe("isValidSlug", () => {
  it("accepts lowercase hyphenated slugs", () => {
    expect(isValidSlug("demo-sunrise-public-school")).toBe(true);
  });

  it("rejects uppercase", () => {
    expect(isValidSlug("Demo-Sunrise")).toBe(false);
  });

  it("rejects spaces", () => {
    expect(isValidSlug("demo sunrise")).toBe(false);
  });

  it("rejects leading/trailing hyphens", () => {
    expect(isValidSlug("-demo-sunrise")).toBe(false);
    expect(isValidSlug("demo-sunrise-")).toBe(false);
  });

  it("rejects double hyphens", () => {
    expect(isValidSlug("demo--sunrise")).toBe(false);
  });

  it("rejects empty string", () => {
    expect(isValidSlug("")).toBe(false);
  });
});

describe("slugify", () => {
  it("lowercases and hyphenates", () => {
    expect(slugify("Demo Sunrise Public School")).toBe(
      "demo-sunrise-public-school",
    );
  });

  it("collapses non-alphanumeric runs into a single hyphen", () => {
    expect(slugify("St. Mary's   School!!")).toBe("st-mary-s-school");
  });

  it("trims leading/trailing separators", () => {
    expect(slugify("  -Demo School-  ")).toBe("demo-school");
  });

  it("produces a slug that isValidSlug accepts", () => {
    expect(isValidSlug(slugify("St. Mary's School (Branch 2)"))).toBe(true);
  });
});
