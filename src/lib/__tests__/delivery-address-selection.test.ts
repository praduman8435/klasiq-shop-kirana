import { describe, expect, it } from "vitest";
import { shouldInvalidateSelection } from "@/lib/delivery-address-selection";

describe("shouldInvalidateSelection — address state correctness (Phase 3.3 Part 3 audit)", () => {
  it("does not invalidate when nothing has been selected yet", () => {
    expect(shouldInvalidateSelection(null, "12 Market Road")).toBe(false);
    expect(shouldInvalidateSelection(null, "")).toBe(false);
  });

  it("does not invalidate when the query still matches exactly what was selected", () => {
    expect(shouldInvalidateSelection("12 Market Road, Test City", "12 Market Road, Test City")).toBe(
      false,
    );
  });

  it("invalidates on any material edit after a selection — even one character", () => {
    expect(shouldInvalidateSelection("12 Market Road, Test City", "12 Market Road, Test Cit")).toBe(
      true,
    );
    expect(shouldInvalidateSelection("12 Market Road, Test City", "12 Market Road, Test City ")).toBe(
      true,
    );
  });

  it("invalidates when the field is cleared entirely after a selection", () => {
    expect(shouldInvalidateSelection("12 Market Road, Test City", "")).toBe(true);
  });

  it("invalidates when the customer replaces the selected address with a completely different one", () => {
    expect(shouldInvalidateSelection("12 Market Road, Test City", "45 Different Street")).toBe(true);
  });
});
