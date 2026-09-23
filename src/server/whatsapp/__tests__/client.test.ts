import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sendWhatsAppTemplateMessage, uploadWhatsAppMedia } from "@/server/whatsapp/client";

const TEST_CONFIG = {
  apiToken: "test-token-never-a-real-secret",
  phoneNumberId: "1234567890",
  baseUrl: "https://fake-graph.example.test/v99.0",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("sendWhatsAppTemplateMessage — the shared Meta Cloud API client", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("sends a multi-parameter template body correctly (order-notification shape, not just OTP's single parameter)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await sendWhatsAppTemplateMessage(TEST_CONFIG, {
      phoneNormalized: "+919876543210",
      templateName: "klasiq_order_confirmed",
      templateLanguage: "en_US",
      bodyParameters: ["Riya", "ORD-20260808-ABCDE", "Your order has been confirmed.", "https://klasiq.example/order/ORD-20260808-ABCDE/token123"],
      logLabel: "order-notification:ORDER_CONFIRMED",
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${TEST_CONFIG.baseUrl}/${TEST_CONFIG.phoneNumberId}/messages`);
    expect(init.headers.Authorization).toBe(`Bearer ${TEST_CONFIG.apiToken}`);

    const body = JSON.parse(init.body as string);
    expect(body.to).toBe("919876543210");
    expect(body.template.name).toBe("klasiq_order_confirmed");
    expect(body.template.components[0].parameters).toEqual([
      { type: "text", text: "Riya" },
      { type: "text", text: "ORD-20260808-ABCDE" },
      { type: "text", text: "Your order has been confirmed." },
      { type: "text", text: "https://klasiq.example/order/ORD-20260808-ABCDE/token123" },
    ]);
  });

  it("logs delivery success with the logLabel and a MASKED phone, never the raw number or any body parameter value", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await sendWhatsAppTemplateMessage(TEST_CONFIG, {
      phoneNormalized: "+919876543210",
      templateName: "klasiq_order_confirmed",
      templateLanguage: "en_US",
      bodyParameters: ["Secret Customer Name", "ORD-SECRET-NUMBER", "context", "https://tracking-link"],
      logLabel: "order-notification:ORDER_CONFIRMED",
    });

    const loggedText = JSON.stringify(logSpy.mock.calls);
    expect(loggedText).toContain("order-notification:ORDER_CONFIRMED");
    // Personal-data audit (2026-08-10) — masked (country code + last 2
    // digits only), never the full, contactable phone number.
    expect(loggedText).toContain("+91••••••10");
    expect(loggedText).not.toContain("+919876543210");
    expect(loggedText).not.toContain("Secret Customer Name");
    expect(loggedText).not.toContain("ORD-SECRET-NUMBER");
    expect(loggedText).not.toContain("tracking-link");
  });

  it("never retries a real HTTP response, even a 5xx, and never leaks the raw body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(500, { error: { message: "internal detail that must not leak", type: "ServerException", code: 1 } }),
    );

    await expect(
      sendWhatsAppTemplateMessage(TEST_CONFIG, {
        phoneNormalized: "+919876543210",
        templateName: "klasiq_order_confirmed",
        templateLanguage: "en_US",
        bodyParameters: ["Riya", "ORD-1", "context", "https://link"],
        logLabel: "order-notification:ORDER_CONFIRMED",
      }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("internal detail that must not leak");
  });

  it("retries exactly once on a genuine network-level failure, then succeeds", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(jsonResponse(200, {}));

    await sendWhatsAppTemplateMessage(TEST_CONFIG, {
      phoneNormalized: "+919876543210",
      templateName: "klasiq_order_confirmed",
      templateLanguage: "en_US",
      bodyParameters: ["Riya", "ORD-1", "context", "https://link"],
      logLabel: "order-notification:ORDER_CONFIRMED",
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exactly one retry on repeated network failures", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(
      sendWhatsAppTemplateMessage(TEST_CONFIG, {
        phoneNormalized: "+919876543210",
        templateName: "klasiq_order_confirmed",
        templateLanguage: "en_US",
        bodyParameters: ["Riya", "ORD-1", "context", "https://link"],
        logLabel: "order-notification:ORDER_CONFIRMED",
      }),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("Phase 3.6.6 Part 3 — includes a document header component only when headerDocument is passed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await sendWhatsAppTemplateMessage(TEST_CONFIG, {
      phoneNormalized: "+919876543210",
      templateName: "klasiq_invoice",
      templateLanguage: "en_US",
      bodyParameters: ["Riya", "ORD-1", "₹500", "Thank you for shopping with us!"],
      headerDocument: { mediaId: "media-abc-123", filename: "Invoice-ORD-1.pdf" },
      logLabel: "invoice-whatsapp",
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.template.components[0]).toEqual({
      type: "header",
      parameters: [{ type: "document", document: { id: "media-abc-123", filename: "Invoice-ORD-1.pdf" } }],
    });
    expect(body.template.components[1].type).toBe("body");
  });

  it("regression: omitting headerDocument produces the exact same components shape as before this field existed", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await sendWhatsAppTemplateMessage(TEST_CONFIG, {
      phoneNormalized: "+919876543210",
      templateName: "klasiq_order_confirmed",
      templateLanguage: "en_US",
      bodyParameters: ["Riya", "ORD-1", "context", "https://link"],
      logLabel: "order-notification:ORDER_CONFIRMED",
    });

    const [, init] = fetchMock.mock.calls[0]!;
    const body = JSON.parse(init.body as string);
    expect(body.template.components).toHaveLength(1);
    expect(body.template.components[0].type).toBe("body");
  });
});

describe("uploadWhatsAppMedia — Meta Cloud API media upload", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let logSpy: ReturnType<typeof vi.spyOn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    logSpy.mockRestore();
    errorSpy.mockRestore();
  });

  it("uploads to the correct endpoint with the correct auth header and multipart fields, returning the media id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "media-xyz-789" }));

    const mediaId = await uploadWhatsAppMedia(TEST_CONFIG, Buffer.from("%PDF-fake"), "Invoice-ORD-1.pdf", "application/pdf");

    expect(mediaId).toBe("media-xyz-789");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe(`${TEST_CONFIG.baseUrl}/${TEST_CONFIG.phoneNumberId}/media`);
    expect(init.headers.Authorization).toBe(`Bearer ${TEST_CONFIG.apiToken}`);
    expect(init.body).toBeInstanceOf(FormData);
    const form = init.body as FormData;
    expect(form.get("messaging_product")).toBe("whatsapp");
    expect(form.get("type")).toBe("application/pdf");
    expect((form.get("file") as File).name).toBe("Invoice-ORD-1.pdf");
  });

  it("never logs the file's own bytes, only filename and size", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { id: "media-xyz-789" }));

    await uploadWhatsAppMedia(TEST_CONFIG, Buffer.from("super secret pdf bytes"), "Invoice-ORD-1.pdf", "application/pdf");

    const loggedText = JSON.stringify(logSpy.mock.calls);
    expect(loggedText).toContain("Invoice-ORD-1.pdf");
    expect(loggedText).not.toContain("super secret pdf bytes");
  });

  it("never retries a real HTTP error response, and never leaks the raw error body", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, { error: { message: "internal detail that must not leak", type: "OAuthException", code: 100 } }),
    );

    await expect(
      uploadWhatsAppMedia(TEST_CONFIG, Buffer.from("data"), "Invoice-ORD-1.pdf", "application/pdf"),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("internal detail that must not leak");
  });

  it("retries exactly once on a genuine network-level failure, then succeeds", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(jsonResponse(200, { id: "media-1" }));

    const mediaId = await uploadWhatsAppMedia(TEST_CONFIG, Buffer.from("data"), "Invoice-ORD-1.pdf", "application/pdf");

    expect(mediaId).toBe("media-1");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exactly one retry on repeated network failures", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockRejectedValueOnce(new TypeError("fetch failed"));

    await expect(
      uploadWhatsAppMedia(TEST_CONFIG, Buffer.from("data"), "Invoice-ORD-1.pdf", "application/pdf"),
    ).rejects.toThrow();

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws if Meta responds 200 with no media id (defensive — should never happen in practice)", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));

    await expect(
      uploadWhatsAppMedia(TEST_CONFIG, Buffer.from("data"), "Invoice-ORD-1.pdf", "application/pdf"),
    ).rejects.toThrow();
  });
});
