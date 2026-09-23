import { describe, expect, it } from "vitest";
import {
  counterSaleAddressSchema,
  createCounterSaleCustomerSchema,
  createCounterSaleSchema,
} from "@/lib/validation/admin-counter-sale";

const validBase = {
  lines: [{ productVariantId: "variant-1", quantity: 2 }],
  paymentMethod: "CASH" as const,
  idempotencyKey: "550e8400-e29b-41d4-a716-446655440000",
};

describe("createCounterSaleSchema", () => {
  it("accepts a guest sale", () => {
    const result = createCounterSaleSchema.safeParse({ ...validBase, customer: { mode: "GUEST" } });
    expect(result.success).toBe(true);
  });

  it("accepts an existing-customer sale", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "EXISTING", customerId: "cust-1" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a new-customer sale with only a phone", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "NEW", primaryPhone: "9876543210" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an empty lines array", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      lines: [],
      customer: { mode: "GUEST" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a zero or negative quantity", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      lines: [{ productVariantId: "variant-1", quantity: 0 }],
      customer: { mode: "GUEST" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a new-customer entry with no phone", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "NEW", displayName: "No Phone" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an existing-customer entry with no customerId", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "EXISTING" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown payment method", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      paymentMethod: "CASH_ON_DELIVERY",
    });
    expect(result.success).toBe(false);
  });

  it("rejects a malformed idempotency key", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      idempotencyKey: "not-a-uuid",
    });
    expect(result.success).toBe(false);
  });

  it("accepts an omitted payment field (defaults to Full Payment downstream)", () => {
    const result = createCounterSaleSchema.safeParse({ ...validBase, customer: { mode: "GUEST" } });
    expect(result.success).toBe(true);
  });

  it("accepts an explicit Full Payment", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      payment: { mode: "FULL" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a Partial Payment with a non-negative amount", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "EXISTING", customerId: "cust-1" },
      payment: { mode: "PARTIAL", amountReceivedInPaise: 4000 },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a zero-amount Partial Payment (full credit)", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "EXISTING", customerId: "cust-1" },
      payment: { mode: "PARTIAL", amountReceivedInPaise: 0 },
    });
    expect(result.success).toBe(true);
  });

  it("rejects a Partial Payment with a negative amount", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "EXISTING", customerId: "cust-1" },
      payment: { mode: "PARTIAL", amountReceivedInPaise: -1 },
    });
    expect(result.success).toBe(false);
  });

  it("rejects a Partial Payment with no amount at all", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "EXISTING", customerId: "cust-1" },
      payment: { mode: "PARTIAL" },
    });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown payment mode", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      payment: { mode: "INSTALLMENT" },
    });
    expect(result.success).toBe(false);
  });

  it("accepts an omitted address field (defaults to no address downstream)", () => {
    const result = createCounterSaleSchema.safeParse({ ...validBase, customer: { mode: "GUEST" } });
    expect(result.success).toBe(true);
  });

  it("accepts an explicit address of mode NONE", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      address: { mode: "NONE" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts an address of mode SAVED", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "EXISTING", customerId: "cust-1" },
      address: { mode: "SAVED" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fully-populated ONE_TIME address", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      address: { mode: "ONE_TIME", addressLine: "12 Guest Lane", city: "Mumbai", state: "MH", pincode: "400001" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a fully-blank ONE_TIME address — section 3's 'no validation'", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      address: { mode: "ONE_TIME" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an unknown address mode", () => {
    const result = createCounterSaleSchema.safeParse({
      ...validBase,
      customer: { mode: "GUEST" },
      address: { mode: "PERMANENT" },
    });
    expect(result.success).toBe(false);
  });
});

describe("counterSaleAddressSchema", () => {
  it("rejects an over-length address line", () => {
    const result = counterSaleAddressSchema.safeParse({ mode: "ONE_TIME", addressLine: "a".repeat(201) });
    expect(result.success).toBe(false);
  });

  it("rejects an over-length pincode", () => {
    const result = counterSaleAddressSchema.safeParse({ mode: "ONE_TIME", pincode: "1".repeat(21) });
    expect(result.success).toBe(false);
  });

  it("trims whitespace from every field", () => {
    const result = counterSaleAddressSchema.safeParse({
      mode: "ONE_TIME",
      addressLine: "  12 Guest Lane  ",
      city: "  Mumbai  ",
    });
    expect(result.success).toBe(true);
    if (result.success && result.data.mode === "ONE_TIME") {
      expect(result.data.addressLine).toBe("12 Guest Lane");
      expect(result.data.city).toBe("Mumbai");
    }
  });

  it("SAVED carries no address fields — extra fields are simply ignored, not rejected", () => {
    const result = counterSaleAddressSchema.safeParse({ mode: "SAVED", addressLine: "should be ignored" });
    expect(result.success).toBe(true);
  });
});

describe("createCounterSaleCustomerSchema", () => {
  const validCustomerBase = { primaryPhone: "9876543210" };

  it("accepts no address at all (unchanged default behaviour)", () => {
    expect(createCounterSaleCustomerSchema.safeParse(validCustomerBase).success).toBe(true);
  });

  it("accepts a fully-populated optional address", () => {
    const result = createCounterSaleCustomerSchema.safeParse({
      ...validCustomerBase,
      address: { addressLine: "12 New Customer Road", city: "Pune", state: "Maharashtra", pincode: "411001" },
    });
    expect(result.success).toBe(true);
  });

  it("accepts a partial address (only some fields given)", () => {
    const result = createCounterSaleCustomerSchema.safeParse({
      ...validCustomerBase,
      address: { city: "Pune" },
    });
    expect(result.success).toBe(true);
  });

  it("rejects an over-length address field", () => {
    const result = createCounterSaleCustomerSchema.safeParse({
      ...validCustomerBase,
      address: { addressLine: "a".repeat(201) },
    });
    expect(result.success).toBe(false);
  });
});
