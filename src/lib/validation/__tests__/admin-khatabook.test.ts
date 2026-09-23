import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { khataBookSearchSchema, receivePaymentSchema } from "@/lib/validation/admin-khatabook";

describe("khataBookSearchSchema", () => {
  it("accepts an omitted query (the default landing view)", () => {
    const result = khataBookSearchSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it("trims a query string", () => {
    const result = khataBookSearchSchema.safeParse({ q: "  Priya  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.q).toBe("Priya");
  });

  it("rejects a query longer than 100 characters", () => {
    const result = khataBookSearchSchema.safeParse({ q: "a".repeat(101) });
    expect(result.success).toBe(false);
  });
});

const validReceivePaymentInput = {
  orderNumber: "ORD-20260808-K7M3P",
  customerId: "KLQ-7A41K2",
  amountInPaise: 5000,
  paymentMethod: "CASH" as const,
  idempotencyKey: randomUUID(),
};

describe("receivePaymentSchema", () => {
  it("accepts a valid payload", () => {
    expect(receivePaymentSchema.safeParse(validReceivePaymentInput).success).toBe(true);
  });

  it("accepts an optional note, trimmed", () => {
    const result = receivePaymentSchema.safeParse({ ...validReceivePaymentInput, note: "  paid at pickup  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.note).toBe("paid at pickup");
  });

  it("rejects a zero amount", () => {
    expect(receivePaymentSchema.safeParse({ ...validReceivePaymentInput, amountInPaise: 0 }).success).toBe(false);
  });

  it("rejects a negative amount", () => {
    expect(receivePaymentSchema.safeParse({ ...validReceivePaymentInput, amountInPaise: -500 }).success).toBe(false);
  });

  it("rejects CASH_ON_DELIVERY — reuses Counter Sale's own payment-method subset, never the Online-only enum value", () => {
    const result = receivePaymentSchema.safeParse({ ...validReceivePaymentInput, paymentMethod: "CASH_ON_DELIVERY" });
    expect(result.success).toBe(false);
  });

  it("accepts UPI and CARD", () => {
    expect(receivePaymentSchema.safeParse({ ...validReceivePaymentInput, paymentMethod: "UPI" }).success).toBe(true);
    expect(receivePaymentSchema.safeParse({ ...validReceivePaymentInput, paymentMethod: "CARD" }).success).toBe(true);
  });

  it("rejects a malformed idempotency key", () => {
    const result = receivePaymentSchema.safeParse({ ...validReceivePaymentInput, idempotencyKey: "not-a-uuid" });
    expect(result.success).toBe(false);
  });

  it("rejects a note longer than 200 characters", () => {
    const result = receivePaymentSchema.safeParse({ ...validReceivePaymentInput, note: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects a missing orderNumber or customerId", () => {
    expect(receivePaymentSchema.safeParse({ ...validReceivePaymentInput, orderNumber: "" }).success).toBe(false);
    expect(receivePaymentSchema.safeParse({ ...validReceivePaymentInput, customerId: "" }).success).toBe(false);
  });
});
