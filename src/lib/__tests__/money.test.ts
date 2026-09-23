import { describe, expect, it } from "vitest";
import { formatPaise, rupeesToPaise } from "@/lib/money";

describe("formatPaise", () => {
  it("formats whole rupees without decimals", () => {
    expect(formatPaise(35000)).toBe("₹350");
  });

  it("rounds to the nearest rupee for display", () => {
    expect(formatPaise(35050)).toBe("₹351");
  });

  it("formats zero", () => {
    expect(formatPaise(0)).toBe("₹0");
  });
});

describe("rupeesToPaise", () => {
  it("converts rupees to integer paise", () => {
    expect(rupeesToPaise(350)).toBe(35000);
  });

  it("rounds fractional paise", () => {
    expect(rupeesToPaise(350.005)).toBe(35001);
  });
});
