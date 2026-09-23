import { describe, expect, it } from "vitest";
import {
  formatInvoiceDate,
  getInvoiceAddressLines,
  getInvoiceDiscountLabel,
  getInvoiceNumber,
  getInvoiceSourceLabel,
} from "@/lib/invoice-presentation";

describe("getInvoiceNumber", () => {
  it("is exactly the order number — section 9's decision, no independent sequence", () => {
    expect(getInvoiceNumber({ orderNumber: "ORD-TEST-1234" })).toBe("ORD-TEST-1234");
  });
});

describe("formatInvoiceDate", () => {
  it("formats as a full en-IN date", () => {
    expect(formatInvoiceDate(new Date("2026-08-09T10:00:00Z"))).toBe("9 August 2026");
  });
});

describe("getInvoiceSourceLabel", () => {
  it("labels ONLINE and COUNTER distinctly from both the admin badge and the portal label sets", () => {
    expect(getInvoiceSourceLabel("ONLINE")).toBe("Online Order");
    expect(getInvoiceSourceLabel("COUNTER")).toBe("In-Store Purchase");
  });
});

describe("getInvoiceDiscountLabel", () => {
  it("returns null when no discount applied", () => {
    expect(
      getInvoiceDiscountLabel({ discountType: null, discountValue: null, discountReason: null, discountInPaise: 0 }),
    ).toBeNull();
  });

  it("formats a percentage discount with its reason", () => {
    expect(
      getInvoiceDiscountLabel({
        discountType: "PERCENTAGE",
        discountValue: 10,
        discountReason: "Festival",
        discountInPaise: 10000,
      }),
    ).toBe("10% off — Festival");
  });

  it("formats a flat discount without a reason", () => {
    expect(
      getInvoiceDiscountLabel({
        discountType: "FLAT",
        discountValue: null,
        discountReason: null,
        discountInPaise: 10000,
      }),
    ).toBe("Flat ₹100 off");
  });
});

describe("getInvoiceAddressLines", () => {
  it("returns an empty array for null address", () => {
    expect(getInvoiceAddressLines(null)).toEqual([]);
  });

  it("returns an empty array for a fully-blank address", () => {
    expect(getInvoiceAddressLines({ addressLine: null, city: null, state: null, pincode: null })).toEqual([]);
  });

  it("returns the address line and a comma-joined city/state/pincode line", () => {
    expect(
      getInvoiceAddressLines({ addressLine: "12 Guest Lane", city: "Mumbai", state: "MH", pincode: "400001" }),
    ).toEqual(["12 Guest Lane", "Mumbai, MH, 400001"]);
  });

  it("omits missing pieces of the city/state/pincode line rather than leaving blank commas", () => {
    expect(getInvoiceAddressLines({ addressLine: null, city: "Pune", state: null, pincode: "411001" })).toEqual([
      "Pune, 411001",
    ]);
  });
});
