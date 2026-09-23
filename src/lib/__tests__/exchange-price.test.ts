import { describe, expect, it } from "vitest";
import { getExchangePriceDifference } from "@/lib/exchange-price";

describe("getExchangePriceDifference", () => {
  it("returns EQUAL_VALUE when the replacement costs the same", () => {
    const result = getExchangePriceDifference({
      originalValueInPaise: 100000,
      replacementValueInPaise: 100000,
    });
    expect(result.type).toBe("EQUAL_VALUE");
    expect(result.differenceInPaise).toBe(0);
    expect(result.originalValueInPaise).toBe(100000);
    expect(result.replacementValueInPaise).toBe(100000);
  });

  it("returns CUSTOMER_PAYS when the replacement is more expensive", () => {
    const result = getExchangePriceDifference({
      originalValueInPaise: 40000,
      replacementValueInPaise: 55000,
    });
    expect(result.type).toBe("CUSTOMER_PAYS");
    expect(result.differenceInPaise).toBe(15000);
  });

  it("returns REFUND_DUE when the replacement is cheaper", () => {
    const result = getExchangePriceDifference({
      originalValueInPaise: 60000,
      replacementValueInPaise: 45000,
    });
    expect(result.type).toBe("REFUND_DUE");
    expect(result.differenceInPaise).toBe(-15000);
  });

  it("takes already-computed values, not a unit price × quantity, so it correctly reflects a discounted original value", () => {
    // The brief's own exchange example: original effective price ₹270
    // (a ₹300 belt discounted by 10%), replacement ₹350 — customer pays ₹80.
    const result = getExchangePriceDifference({
      originalValueInPaise: 27000,
      replacementValueInPaise: 35000,
    });
    expect(result.type).toBe("CUSTOMER_PAYS");
    expect(result.differenceInPaise).toBe(8000);
  });

  it("scales correctly when the caller has already multiplied by quantity", () => {
    const result = getExchangePriceDifference({
      originalValueInPaise: 90000, // 30000 * 3
      replacementValueInPaise: 105000, // 35000 * 3
    });
    expect(result.type).toBe("CUSTOMER_PAYS");
    expect(result.differenceInPaise).toBe(15000);
  });
});
