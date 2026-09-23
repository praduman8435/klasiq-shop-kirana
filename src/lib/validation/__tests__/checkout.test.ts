import { describe, expect, it } from "vitest";
import { checkoutInputSchema } from "@/lib/validation/checkout";

const VALID_UUID = "5c4b7c2e-8b7a-4a6e-9d0c-3f2a1b6e7d8f";

function baseInput(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    customerName: "Asha Kumar",
    customerMobile: "9876543210",
    fulfillmentType: "STORE_PICKUP",
    idempotencyKey: VALID_UUID,
    ...overrides,
  };
}

function deliveryOverrides(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    fulfillmentType: "LOCAL_DELIVERY",
    deliveryAddressLine: "12 Market Road",
    destinationLat: 25.96,
    destinationLon: 83.27,
    destinationFormattedAddress: "12 Market Road, Sector 5, Test City",
    expectedDeliveryFeeInPaise: 5000,
    ...overrides,
  };
}

describe("checkoutInputSchema — Store Pickup", () => {
  it("passes without any delivery address or destination fields", () => {
    const result = checkoutInputSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
  });

  it("defaults whatsappSameAsPrimary to true when omitted", () => {
    const result = checkoutInputSchema.safeParse(baseInput());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.whatsappSameAsPrimary).toBe(true);
    }
  });
});

describe("checkoutInputSchema — Local Delivery", () => {
  it("requires an address line", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput(deliveryOverrides({ deliveryAddressLine: undefined })),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.deliveryAddressLine).toBeDefined();
    }
  });

  it("does NOT require deliveryArea — the geocoded formatted address already carries locality", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput(deliveryOverrides()),
    );
    expect(result.success).toBe(true);
  });

  it("requires a selected (geocoded) destination — a free-typed address alone is not enough", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput(
        deliveryOverrides({
          destinationLat: undefined,
          destinationLon: undefined,
          destinationFormattedAddress: undefined,
        }),
      ),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.destinationFormattedAddress).toBeDefined();
    }
  });

  it("requires expectedDeliveryFeeInPaise — the customer must have seen a preview before submitting", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput(deliveryOverrides({ expectedDeliveryFeeInPaise: undefined })),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.expectedDeliveryFeeInPaise).toBeDefined();
    }
  });

  it("rejects out-of-range latitude/longitude", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput(deliveryOverrides({ destinationLat: 999, destinationLon: 83.27 })),
    );
    expect(result.success).toBe(false);
  });

  it("passes with address, selected destination, landmark optional", () => {
    const result = checkoutInputSchema.safeParse(baseInput(deliveryOverrides()));
    expect(result.success).toBe(true);
  });
});

describe("checkoutInputSchema — WhatsApp", () => {
  it("accepts whatsappSameAsPrimary: false with a distinct WhatsApp number", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput({ whatsappSameAsPrimary: false, whatsappPhone: "9123456789" }),
    );
    expect(result.success).toBe(true);
  });

  it("rejects an invalid WhatsApp number", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput({ whatsappSameAsPrimary: false, whatsappPhone: "12345" }),
    );
    expect(result.success).toBe(false);
  });

  it("allows an empty/omitted WhatsApp number while 'same as primary' is checked — the field is irrelevant then", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ whatsappSameAsPrimary: true }));
    expect(result.success).toBe(true);
  });

  // Phase 3.3 Part 3 audit finding: unchecking "same as primary" is an
  // explicit statement that a DIFFERENT number should be used — leaving it
  // blank in that state used to be silently accepted (an earlier version of
  // this test asserted exactly that), but that's an ambiguous, half-filled
  // form state, not a valid "no WhatsApp" signal. Tightened deliberately;
  // see docs/PHASE_3_3_REPORT.md Part 3 "WhatsApp state".
  it("rejects an empty-string WhatsApp number once 'same as primary' is unchecked", () => {
    const result = checkoutInputSchema.safeParse(
      baseInput({ whatsappSameAsPrimary: false, whatsappPhone: "" }),
    );
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.whatsappPhone).toBeDefined();
    }
  });

  it("rejects a completely omitted WhatsApp number once 'same as primary' is unchecked", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ whatsappSameAsPrimary: false }));
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.flatten().fieldErrors.whatsappPhone).toBeDefined();
    }
  });
});

describe("checkoutInputSchema — field validation", () => {
  it("rejects a missing name", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ customerName: "" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid mobile number", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ customerMobile: "12345" }));
    expect(result.success).toBe(false);
  });

  it("accepts a mobile number with a +91 prefix and spaces", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ customerMobile: "+91 98765 43210" }));
    expect(result.success).toBe(true);
  });

  it("rejects a landline-looking number (invalid leading digit)", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ customerMobile: "5876543210" }));
    expect(result.success).toBe(false);
  });

  it("rejects an invalid fulfillment type — the client cannot invent one", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ fulfillmentType: "DRONE_DROP" }));
    expect(result.success).toBe(false);
  });

  it("rejects a missing idempotency key", () => {
    const input = baseInput();
    delete (input as Record<string, unknown>).idempotencyKey;
    const result = checkoutInputSchema.safeParse(input);
    expect(result.success).toBe(false);
  });

  it("rejects a non-UUID idempotency key", () => {
    const result = checkoutInputSchema.safeParse(baseInput({ idempotencyKey: "not-a-uuid" }));
    expect(result.success).toBe(false);
  });
});
