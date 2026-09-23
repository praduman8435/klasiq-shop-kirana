import { describe, expect, it } from "vitest";
import { generateOrderNumber, isValidOrderNumberFormat } from "@/lib/order-number";

describe("generateOrderNumber", () => {
  it("embeds the date as YYYYMMDD", () => {
    const orderNumber = generateOrderNumber(new Date("2026-08-04T12:00:00Z"));
    expect(orderNumber.startsWith("ORD-20260804-")).toBe(true);
  });

  it("produces a value that passes isValidOrderNumberFormat", () => {
    const orderNumber = generateOrderNumber(new Date("2026-01-01T00:00:00Z"));
    expect(isValidOrderNumberFormat(orderNumber)).toBe(true);
  });

  it("never includes visually-confusable characters (0, O, 1, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      const orderNumber = generateOrderNumber(new Date());
      const suffix = orderNumber.split("-")[2];
      expect(suffix).toBeDefined();
      expect(/[01IOL]/.test(suffix!)).toBe(false);
    }
  });

  it("is not practically likely to collide across repeated calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      seen.add(generateOrderNumber(new Date("2026-08-04T00:00:00Z")));
    }
    // Statistical sanity check, not a uniqueness guarantee — the real
    // guarantee is the DB unique constraint + retry loop in place-order.ts.
    expect(seen.size).toBe(500);
  });
});

describe("isValidOrderNumberFormat", () => {
  it("rejects a raw database id", () => {
    expect(isValidOrderNumberFormat("cmsdm9avx0004xum7onnefe0o")).toBe(false);
  });

  it("rejects a malformed prefix", () => {
    expect(isValidOrderNumberFormat("ORDER-20260804-K7M3P")).toBe(false);
  });

  it("rejects the wrong suffix length", () => {
    expect(isValidOrderNumberFormat("ORD-20260804-K7M3")).toBe(false);
  });
});
