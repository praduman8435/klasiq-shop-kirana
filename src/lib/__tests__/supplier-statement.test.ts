import { describe, expect, it } from "vitest";
import { buildSupplierStatementText, khataEntryLabel, telLink, whatsAppLink } from "@/lib/supplier-statement";

const bill = { date: new Date("2026-09-20T06:00:00Z"), type: "PURCHASE" as const, reference: "A-123", description: "1 bill", debitInPaise: 500000, creditInPaise: 0 };
const paid = { date: new Date("2026-09-22T06:00:00Z"), type: "PAYMENT" as const, reference: null, description: "UPI · Ramesh", debitInPaise: 0, creditInPaise: 200000 };

describe("khataEntryLabel", () => {
  it("reads like a shopkeeper's khata", () => {
    expect(khataEntryLabel(bill)).toBe("Bill #A-123");
    expect(khataEntryLabel(paid)).toBe("Paid · UPI");
    expect(khataEntryLabel({ ...bill, reference: "Opening balance" })).toBe("Opening balance");
    expect(khataEntryLabel({ ...bill, reference: null })).toBe("Bill");
  });
});

describe("buildSupplierStatementText", () => {
  it("lists entries oldest first with totals and the balance", () => {
    const text = buildSupplierStatementText({
      shopName: "Muskan General Store",
      supplierName: "Ramesh",
      entries: [paid, bill],
      balanceInPaise: 300000,
      totalBillsInPaise: 500000,
      totalPaidInPaise: 200000,
      now: new Date("2026-09-24T06:00:00Z"),
    });
    expect(text).toContain("Namaste Ramesh ji,");
    expect(text).toContain("up to 24 Sept 2026");
    expect(text.indexOf("Bill #A-123")).toBeLessThan(text.indexOf("Paid · UPI"));
    expect(text).toContain("Balance: ₹3,000 payable to you");
  });

  it("says settled or advance when nothing is owed", () => {
    const base = { shopName: "S", supplierName: "R", entries: [], totalBillsInPaise: 0, totalPaidInPaise: 0 };
    expect(buildSupplierStatementText({ ...base, balanceInPaise: 0 })).toContain("Balance: all settled");
    expect(buildSupplierStatementText({ ...base, balanceInPaise: -5000 })).toContain("₹50 advance with you");
  });
});

describe("whatsAppLink / telLink", () => {
  it("targets the supplier's number when it's a valid mobile", () => {
    expect(whatsAppLink("98765 43210", "hi there")).toBe("https://wa.me/919876543210?text=hi%20there");
    expect(whatsAppLink("0542-222333")).toBe("https://wa.me/");
    expect(telLink("98765 43210")).toBe("tel:+919876543210");
    expect(telLink(null)).toBeNull();
  });
});
