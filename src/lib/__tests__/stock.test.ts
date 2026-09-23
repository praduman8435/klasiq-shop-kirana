import { describe, expect, it } from "vitest";
import { deriveStockStatus, isOrderable } from "@/lib/stock";

describe("deriveStockStatus", () => {
  it("is OUT_OF_STOCK at zero quantity", () => {
    expect(deriveStockStatus(0, 5)).toBe("OUT_OF_STOCK");
  });

  it("is OUT_OF_STOCK for negative quantity (defensive)", () => {
    expect(deriveStockStatus(-1, 5)).toBe("OUT_OF_STOCK");
  });

  it("is LOW_STOCK at or below the threshold", () => {
    expect(deriveStockStatus(5, 5)).toBe("LOW_STOCK");
    expect(deriveStockStatus(1, 5)).toBe("LOW_STOCK");
  });

  it("is IN_STOCK above the threshold", () => {
    expect(deriveStockStatus(6, 5)).toBe("IN_STOCK");
  });
});

describe("isOrderable", () => {
  it("allows IN_STOCK and LOW_STOCK", () => {
    expect(isOrderable("IN_STOCK")).toBe(true);
    expect(isOrderable("LOW_STOCK")).toBe(true);
  });

  it("blocks OUT_OF_STOCK", () => {
    expect(isOrderable("OUT_OF_STOCK")).toBe(false);
  });
});
