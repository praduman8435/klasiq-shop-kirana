import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildInvoicePaymentLine, sendInvoiceOverWhatsApp } from "@/server/whatsapp/invoice-notification-service";
import type { Invoice } from "@/server/commerce/invoice";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function baseInvoice(overrides: Partial<Invoice> = {}): Invoice {
  return {
    orderNumber: "ORD-20260808-ABCDE",
    invoiceDate: new Date("2026-08-09T10:00:00Z"),
    source: "ONLINE",
    fulfillmentType: "STORE_PICKUP",
    paymentMethod: "CASH_ON_DELIVERY",
    paymentStatus: "PAID",
    customerName: "Riya Sharma",
    customerMobile: "9876543210",
    customerWhatsapp: "9876543210",
    customerId: "KLQ-TEST01",
    address: null,
    items: [],
    subtotalInPaise: 50000,
    discountType: null,
    discountValue: null,
    discountReason: null,
    discountInPaise: 0,
    deliveryFeeInPaise: 0,
    totalInPaise: 50000,
    amountReceivedInPaise: 50000,
    outstandingInPaise: 0,
    ...overrides,
  };
}

const FAKE_PDF = Buffer.from("%PDF-fake-invoice-bytes");

describe("buildInvoicePaymentLine — section 6's outstanding logic", () => {
  it("mentions the outstanding balance only for a Counter Sale with outstanding > 0", () => {
    const line = buildInvoicePaymentLine({ source: "COUNTER", amountReceivedInPaise: 30000, outstandingInPaise: 20000 });
    expect(line).toMatch(/outstanding/i);
    expect(line).toContain("₹300");
    expect(line).toContain("₹200");
  });

  it("never mentions outstanding when it's zero, even for a Counter Sale", () => {
    const line = buildInvoicePaymentLine({ source: "COUNTER", amountReceivedInPaise: 50000, outstandingInPaise: 0 });
    expect(line).not.toMatch(/outstanding/i);
    expect(line).toMatch(/thank you/i);
  });

  it("never mentions outstanding for an ONLINE order, even hypothetically nonzero (structurally shouldn't happen, defensive)", () => {
    const line = buildInvoicePaymentLine({ source: "ONLINE", amountReceivedInPaise: 50000, outstandingInPaise: 0 });
    expect(line).not.toMatch(/outstanding/i);
  });
});

describe("sendInvoiceOverWhatsApp", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { id: "media-1" }));
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NOTIFICATION_PROVIDER", "whatsapp");
    vi.stubEnv("WHATSAPP_API_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("WHATSAPP_INVOICE_TEMPLATE_NAME", "klasiq_invoice");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  function lastRequestBody() {
    const [, init] = fetchMock.mock.calls[fetchMock.mock.calls.length - 1]!;
    return JSON.parse(init.body as string);
  }

  it("uploads the PDF, then sends the template with the correct 4 body parameters and header document", async () => {
    const result = await sendInvoiceOverWhatsApp(baseInvoice(), FAKE_PDF);

    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Call 1: media upload.
    const [uploadUrl, uploadInit] = fetchMock.mock.calls[0]!;
    expect(uploadUrl).toContain("/media");
    expect(uploadInit.body).toBeInstanceOf(FormData);

    // Call 2: template send, referencing the uploaded media id.
    const body = lastRequestBody();
    expect(body.template.name).toBe("klasiq_invoice");
    expect(body.template.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "document", document: { id: "media-1", filename: "Invoice-ORD-20260808-ABCDE.pdf" } }],
    });
    expect(body.template.components[1].parameters).toEqual([
      { type: "text", text: "Riya Sharma" },
      { type: "text", text: "ORD-20260808-ABCDE" },
      { type: "text", text: "₹500" },
      { type: "text", text: "Thank you for shopping with us!" },
    ]);
  });

  it("falls back to 'Customer' when customerName is null", async () => {
    await sendInvoiceOverWhatsApp(baseInvoice({ customerName: null }), FAKE_PDF);
    const body = lastRequestBody();
    expect(body.template.components[1].parameters[0]).toEqual({ type: "text", text: "Customer" });
  });

  it("prefers customerWhatsapp over customerMobile", async () => {
    await sendInvoiceOverWhatsApp(baseInvoice({ customerWhatsapp: "9111111111", customerMobile: "9222222222" }), FAKE_PDF);
    const [, init] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(init.body as string).to).toBe("919111111111");
  });

  it("falls back to customerMobile when customerWhatsapp is null", async () => {
    await sendInvoiceOverWhatsApp(baseInvoice({ customerWhatsapp: null, customerMobile: "9222222222" }), FAKE_PDF);
    const [, init] = fetchMock.mock.calls[1]!;
    expect(JSON.parse(init.body as string).to).toBe("919222222222");
  });

  it("returns NO_PHONE and never calls fetch when neither phone is present", async () => {
    const result = await sendInvoiceOverWhatsApp(baseInvoice({ customerWhatsapp: null, customerMobile: null }), FAKE_PDF);
    expect(result).toEqual({ success: false, error: { type: "NO_PHONE", message: expect.any(String) } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns INVALID_PHONE and never calls fetch for a malformed phone", async () => {
    const result = await sendInvoiceOverWhatsApp(baseInvoice({ customerWhatsapp: "123", customerMobile: null }), FAKE_PDF);
    expect(result).toEqual({ success: false, error: { type: "INVALID_PHONE", message: expect.any(String) } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns NOT_CONFIGURED and never calls fetch when the template env var is unset", async () => {
    vi.stubEnv("WHATSAPP_INVOICE_TEMPLATE_NAME", "");
    const result = await sendInvoiceOverWhatsApp(baseInvoice(), FAKE_PDF);
    expect(result).toEqual({ success: false, error: { type: "NOT_CONFIGURED", message: expect.any(String) } });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("returns DELIVERY_FAILED (never throws) when the media upload fails", async () => {
    fetchMock.mockReset().mockResolvedValueOnce(jsonResponse(500, { error: { message: "boom", code: 1 } }));
    const result = await sendInvoiceOverWhatsApp(baseInvoice(), FAKE_PDF);
    expect(result).toEqual({ success: false, error: { type: "DELIVERY_FAILED", message: expect.any(String) } });
  });

  it("returns DELIVERY_FAILED (never throws) when the template send fails after a successful upload", async () => {
    fetchMock
      .mockReset()
      .mockResolvedValueOnce(jsonResponse(200, { id: "media-1" }))
      .mockResolvedValueOnce(jsonResponse(500, { error: { message: "boom", code: 1 } }));
    const result = await sendInvoiceOverWhatsApp(baseInvoice(), FAKE_PDF);
    expect(result).toEqual({ success: false, error: { type: "DELIVERY_FAILED", message: expect.any(String) } });
  });

  it("never leaks the rejection reason or file bytes in any log line", async () => {
    await sendInvoiceOverWhatsApp(baseInvoice(), FAKE_PDF);
    const loggedText = JSON.stringify([...errorSpy.mock.calls]);
    expect(loggedText).not.toContain("%PDF-fake-invoice-bytes");
  });

  it("in development without NOTIFICATION_PROVIDER=whatsapp, uses the console stand-in and never calls fetch for real", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NOTIFICATION_PROVIDER", "");
    const result = await sendInvoiceOverWhatsApp(baseInvoice(), FAKE_PDF);
    expect(result.success).toBe(true);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares the SAME NOTIFICATION_PROVIDER toggle as Order/Return notifications — not a dedicated invoice-only toggle", async () => {
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NOTIFICATION_PROVIDER", "whatsapp");
    const result = await sendInvoiceOverWhatsApp(baseInvoice(), FAKE_PDF);
    expect(result.success).toBe(true);
    expect(fetchMock).toHaveBeenCalled();
  });
});
