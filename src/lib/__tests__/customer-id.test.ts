import { describe, expect, it } from "vitest";
import { generateCustomerId, isValidCustomerIdFormat } from "@/lib/customer-id";

describe("generateCustomerId", () => {
  it("produces a value that passes isValidCustomerIdFormat", () => {
    expect(isValidCustomerIdFormat(generateCustomerId())).toBe(true);
  });

  it("starts with the KLQ- prefix", () => {
    expect(generateCustomerId().startsWith("KLQ-")).toBe(true);
  });

  it("never includes visually-confusable characters (0, O, 1, I, L)", () => {
    for (let i = 0; i < 200; i++) {
      const suffix = generateCustomerId().split("-")[1];
      expect(suffix).toBeDefined();
      expect(/[01IOL]/.test(suffix!)).toBe(false);
    }
  });

  it("is not practically likely to collide across repeated calls", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 500; i++) {
      seen.add(generateCustomerId());
    }
    // Statistical sanity check, not a uniqueness guarantee — the real
    // guarantee is the DB unique constraint + retry loop in
    // findOrCreateCustomerByPrimaryPhone (src/server/commerce/customer.ts).
    expect(seen.size).toBe(500);
  });
});

describe("isValidCustomerIdFormat", () => {
  it("rejects a raw database id", () => {
    expect(isValidCustomerIdFormat("cmsdm9avx0004xum7onnefe0o")).toBe(false);
  });

  it("rejects an order number", () => {
    expect(isValidCustomerIdFormat("ORD-20260804-K7M3P")).toBe(false);
  });

  it("rejects the wrong suffix length", () => {
    expect(isValidCustomerIdFormat("KLQ-7A41K")).toBe(false);
  });

  it("rejects a lowercase id", () => {
    expect(isValidCustomerIdFormat("klq-7a41k2")).toBe(false);
  });

  it("accepts a well-formed id", () => {
    expect(isValidCustomerIdFormat("KLQ-7A4322")).toBe(true);
  });
});
