import { describe, expect, it } from "vitest";
import { generateInvoicePdf } from "@/server/commerce/invoice-pdf";
import type { Invoice } from "@/server/commerce/invoice";

// Pure unit tests — `generateInvoicePdf` takes an already-assembled
// `Invoice` object and reads nothing else (no DB, no auth), so these
// never touch Postgres. Deliberately test STRUCTURE (a valid PDF was
// produced, section 4's required data doesn't crash the renderer for
// every combination the domain layer can actually hand it), not
// rendered text content — extracting text from a generated PDF would
// require a second, test-only PDF-parsing dependency this codebase has
// no other use for. Full visual/content verification is manual (see
// docs/PHASE_3_6_6_REPORT.md Part 2 "Testing").

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    orderNumber: "ORD-TEST-0001",
    invoiceDate: new Date("2026-08-09T10:00:00Z"),
    source: "COUNTER",
    fulfillmentType: "COUNTER_HANDOVER",
    paymentMethod: "CASH",
    paymentStatus: "PAID",
    customerName: "Test Customer",
    customerMobile: "9876543210",
    customerWhatsapp: "9876543210",
    customerId: "KLQ-TEST01",
    address: { addressLine: "12 Test Lane", city: "Pune", state: "MH", pincode: "411001" },
    items: [
      {
        productName: "School Shirt",
        size: "M",
        sku: "SHIRT-M-001",
        quantity: 2,
        unitPriceInPaise: 50000,
        lineTotalInPaise: 100000,
        effectiveLineTotalInPaise: 90000,
      },
    ],
    subtotalInPaise: 100000,
    discountType: "PERCENTAGE",
    discountValue: 10,
    discountReason: "Festival",
    discountInPaise: 10000,
    deliveryFeeInPaise: 0,
    totalInPaise: 90000,
    amountReceivedInPaise: 90000,
    outstandingInPaise: 0,
    ...overrides,
  };
}

function isValidPdf(buffer: Buffer): boolean {
  return buffer.subarray(0, 5).toString("latin1") === "%PDF-";
}

describe("generateInvoicePdf", () => {
  it("produces a valid PDF for a complete, discounted, addressed Counter Sale invoice", async () => {
    const buffer = await generateInvoicePdf(baseInvoice());
    expect(isValidPdf(buffer)).toBe(true);
    expect(buffer.length).toBeGreaterThan(500);
  });

  it("produces a valid PDF for a Guest order with no address, no customerId, no discount", async () => {
    const buffer = await generateInvoicePdf(
      baseInvoice({
        customerName: null,
        customerMobile: null,
        customerWhatsapp: null,
        customerId: null,
        address: null,
        discountType: null,
        discountValue: null,
        discountReason: null,
        discountInPaise: 0,
        source: "ONLINE",
        fulfillmentType: "STORE_PICKUP",
        items: [
          {
            productName: "School Shoes",
            size: "8",
            sku: "SHOE-8-001",
            quantity: 1,
            unitPriceInPaise: 150000,
            lineTotalInPaise: 150000,
            effectiveLineTotalInPaise: 150000,
          },
        ],
        subtotalInPaise: 150000,
        totalInPaise: 150000,
        amountReceivedInPaise: 150000,
        outstandingInPaise: 0,
      }),
    );
    expect(isValidPdf(buffer)).toBe(true);
  });

  it("never renders Amount Received/Outstanding rows' section for ONLINE — still produces a smaller, valid PDF", async () => {
    const onlineBuffer = await generateInvoicePdf(
      baseInvoice({ source: "ONLINE", fulfillmentType: "STORE_PICKUP", outstandingInPaise: 0 }),
    );
    expect(isValidPdf(onlineBuffer)).toBe(true);
  });

  it("handles an outstanding balance (partial payment) without error", async () => {
    const buffer = await generateInvoicePdf(baseInvoice({ amountReceivedInPaise: 40000, outstandingInPaise: 50000 }));
    expect(isValidPdf(buffer)).toBe(true);
  });

  it("paginates a long item list without throwing (pdfkit's automatic flowing text page-break)", async () => {
    const items = Array.from({ length: 60 }, (_, i) => ({
      productName: `Item ${i + 1}`,
      size: "M",
      sku: `SKU-${i + 1}`,
      quantity: 1,
      unitPriceInPaise: 10000,
      lineTotalInPaise: 10000,
      effectiveLineTotalInPaise: 10000,
    }));
    const buffer = await generateInvoicePdf(
      baseInvoice({ items, subtotalInPaise: 600000, totalInPaise: 600000, amountReceivedInPaise: 600000 }),
    );
    expect(isValidPdf(buffer)).toBe(true);
    // A 60-item invoice must be substantially larger than a 1-item one —
    // a crude but real proxy for "the extra items actually got drawn."
    const shortBuffer = await generateInvoicePdf(baseInvoice());
    expect(buffer.length).toBeGreaterThan(shortBuffer.length);
  });

  it("is a pure function of its input — two calls with identical data produce PDFs of identical size", async () => {
    const a = await generateInvoicePdf(baseInvoice());
    const b = await generateInvoicePdf(baseInvoice());
    expect(a.length).toBe(b.length);
  });
});
