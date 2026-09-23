import { describe, expect, it } from "vitest";
import { maskPhoneForLogging, normalizePhoneNumber } from "@/lib/phone";

describe("normalizePhoneNumber", () => {
  it("normalizes all documented equivalent formats to the same value", () => {
    const inputs = ["9876543210", "+91 9876543210", "+919876543210", "98765 43210", "98765-43210"];
    const results = inputs.map((input) => normalizePhoneNumber(input));

    for (const result of results) {
      expect(result.valid).toBe(true);
    }
    const normalizedValues = results.map((r) => (r.valid ? r.normalized : null));
    expect(new Set(normalizedValues).size).toBe(1);
    expect(normalizedValues[0]).toBe("+919876543210");
  });

  it("handles a bare 91-prefixed number with no plus sign", () => {
    const result = normalizePhoneNumber("919876543210");
    expect(result).toEqual({ valid: true, normalized: "+919876543210" });
  });

  it("does not misinterpret a 10-digit number that happens to start with 91", () => {
    // 9187654321 is a complete, valid 10-digit local number (starts with 9,
    // second digit 1) — must NOT be treated as "91" + 8 remaining digits.
    const result = normalizePhoneNumber("9187654321");
    expect(result).toEqual({ valid: true, normalized: "+919187654321" });
  });

  it("rejects a number starting with a digit below 6", () => {
    expect(normalizePhoneNumber("5876543210").valid).toBe(false);
  });

  it("rejects too few digits", () => {
    expect(normalizePhoneNumber("987654321").valid).toBe(false);
  });

  it("rejects too many digits", () => {
    expect(normalizePhoneNumber("98765432109").valid).toBe(false);
  });

  it("rejects non-numeric input", () => {
    expect(normalizePhoneNumber("not-a-phone").valid).toBe(false);
  });

  it("rejects an empty string", () => {
    expect(normalizePhoneNumber("").valid).toBe(false);
  });
});

describe("maskPhoneForLogging — personal-data audit (2026-08-10)", () => {
  it("masks a normalized number to country code + last 2 digits only", () => {
    expect(maskPhoneForLogging("+919876543210")).toBe("+91••••••10");
  });

  it("never contains the full original number", () => {
    const masked = maskPhoneForLogging("+919876543210");
    expect(masked).not.toContain("9876543210");
    expect(masked).not.toBe("+919876543210");
  });

  it("two different numbers still produce two DIFFERENT masked values (last 2 digits differ)", () => {
    expect(maskPhoneForLogging("+919876543210")).not.toBe(maskPhoneForLogging("+919876543299"));
  });

  it("falls back to a fixed placeholder for a garbage/too-short value, never a partial leak", () => {
    expect(maskPhoneForLogging("abc")).toBe("+••••••••••");
    expect(maskPhoneForLogging("")).toBe("+••••••••••");
  });
});
