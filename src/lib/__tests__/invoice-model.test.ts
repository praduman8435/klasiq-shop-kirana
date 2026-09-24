import { describe, expect, it } from "vitest";
import { buildInvoiceModel, buildInvoiceShareText, parseInvoiceDesign } from "@/lib/invoice-model";
import type { Invoice } from "@/server/commerce/invoice";

const base: Invoice = {
  orderNumber: "ORD-20260925-AB12C",
  invoiceDate: new Date("2026-09-25T13:00:00Z"),
  source: "COUNTER",
  fulfillmentType: "COUNTER_HANDOVER",
  paymentMethod: "UPI",
  paymentStatus: "PARTIALLY_PAID",
  customerName: "Sunita Devi",
  customerMobile: "9812345670",
  customerWhatsapp: null,
  customerId: "KLQ-X",
  address: null,
  items: [
    { productName: "Basmati Rice", size: "1 kg", sku: "S1", quantity: 2, unitPriceInPaise: 13500, lineTotalInPaise: 27000, effectiveLineTotalInPaise: 27000 },
    { productName: "Salt", size: "1 kg", sku: "S2", quantity: 1, unitPriceInPaise: 2800, lineTotalInPaise: 2800, effectiveLineTotalInPaise: 2800 },
  ],
  subtotalInPaise: 29800,
  discountType: null,
  discountValue: null,
  discountReason: null,
  discountInPaise: 0,
  deliveryFeeInPaise: 0,
  totalInPaise: 29800,
  amountReceivedInPaise: 10000,
  outstandingInPaise: 19800,
};

describe("buildInvoiceModel", () => {
  it("shows a part-paid counter bill with what's on khata", () => {
    const m = buildInvoiceModel(base);
    expect(m.payment).toMatchObject({ status: "Part paid", paid: "₹100", due: "₹198", dueLabel: "Baaki (on khata)", method: "UPI" });
    expect(m.totalQuantity).toBe(3);
    expect(m.date).toBe("25 Sept 2026");
    expect(m.delivery).toBeNull();
  });

  it("marks a fully paid counter bill as paid and an unpaid pickup as pay at store", () => {
    expect(buildInvoiceModel({ ...base, amountReceivedInPaise: 29800, outstandingInPaise: 0 }).payment).toMatchObject({ status: "Paid", isPaid: true, due: null });
    const pickup = buildInvoiceModel({ ...base, source: "ONLINE", fulfillmentType: "STORE_PICKUP", paymentStatus: "UNPAID", amountReceivedInPaise: 0, outstandingInPaise: 0 });
    expect(pickup.payment).toMatchObject({ status: "Pay at store", due: "₹298", dueLabel: "To pay" });
  });

  it("writes the WhatsApp message with the bill link", () => {
    const text = buildInvoiceShareText(buildInvoiceModel(base), "https://shop.example/bill/x?design=thermal");
    expect(text).toContain("Namaste Sunita Devi ji,");
    expect(text).toContain("Baaki (on khata): ₹198");
    expect(text).toContain("Bill dekhein: https://shop.example/bill/x?design=thermal");
  });

  it("falls back to the classic design for an unknown value", () => {
    expect(parseInvoiceDesign("thermal")).toBe("thermal");
    expect(parseInvoiceDesign("fancy")).toBe("classic");
  });
});
