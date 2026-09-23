import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyReturnEvent, type ReturnRequestForNotification } from "@/server/whatsapp/return-notification-service";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function baseRequest(overrides: Partial<ReturnRequestForNotification> = {}): ReturnRequestForNotification {
  return {
    returnNumber: "RET-20260808-ABCDE",
    returnType: "RETURN",
    rejectionReason: null,
    orderNumber: "ORD-20260801-XYZ12",
    accessToken: "test-access-token",
    fulfillmentType: "LOCAL_DELIVERY",
    customerName: "Riya Sharma",
    customerMobile: "9876543210",
    customerWhatsapp: "9876543210",
    ...overrides,
  };
}

describe("notifyReturnEvent", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NOTIFICATION_PROVIDER", "whatsapp");
    vi.stubEnv("WHATSAPP_API_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("WHATSAPP_RETURN_REQUESTED_TEMPLATE_NAME", "klasiq_return_requested");
    vi.stubEnv("WHATSAPP_RETURN_APPROVED_TEMPLATE_NAME", "klasiq_return_approved");
    vi.stubEnv("WHATSAPP_EXCHANGE_APPROVED_TEMPLATE_NAME", "klasiq_exchange_approved");
    vi.stubEnv("WHATSAPP_RETURN_REJECTED_TEMPLATE_NAME", "klasiq_return_rejected");
    vi.stubEnv("WHATSAPP_RETURN_ITEM_RECEIVED_TEMPLATE_NAME", "klasiq_return_item_received");
    vi.stubEnv("WHATSAPP_RETURN_COMPLETED_TEMPLATE_NAME", "klasiq_return_completed");
    vi.stubEnv("WHATSAPP_EXCHANGE_COMPLETED_TEMPLATE_NAME", "klasiq_exchange_completed");
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

  describe("the seven events", () => {
    it("RETURN_REQUESTED uses its own template and a 'return' wording for a RETURN request", async () => {
      await notifyReturnEvent(baseRequest({ returnType: "RETURN" }), "RETURN_REQUESTED");
      const body = lastRequestBody();
      expect(body.template.name).toBe("klasiq_return_requested");
      expect(body.template.components[0].parameters[3].text).toMatch(/return request/i);
    });

    it("RETURN_REQUESTED uses an 'exchange' wording for an EXCHANGE request, same template", async () => {
      await notifyReturnEvent(baseRequest({ returnType: "EXCHANGE" }), "RETURN_REQUESTED");
      const body = lastRequestBody();
      expect(body.template.name).toBe("klasiq_return_requested");
      expect(body.template.components[0].parameters[3].text).toMatch(/exchange request/i);
    });

    it("RETURN_APPROVED uses its own template", async () => {
      await notifyReturnEvent(baseRequest({ returnType: "RETURN" }), "RETURN_APPROVED");
      expect(lastRequestBody().template.name).toBe("klasiq_return_approved");
    });

    it("EXCHANGE_APPROVED uses its own, distinct template", async () => {
      await notifyReturnEvent(baseRequest({ returnType: "EXCHANGE" }), "EXCHANGE_APPROVED");
      expect(lastRequestBody().template.name).toBe("klasiq_exchange_approved");
    });

    it("RETURN_REJECTED includes the rejection reason when present", async () => {
      await notifyReturnEvent(baseRequest({ rejectionReason: "Item shows signs of wear" }), "RETURN_REJECTED");
      const body = lastRequestBody();
      expect(body.template.name).toBe("klasiq_return_rejected");
      expect(body.template.components[0].parameters[3].text).toContain("Item shows signs of wear");
    });

    it("RETURN_REJECTED uses a generic message when no reason is present", async () => {
      await notifyReturnEvent(baseRequest({ rejectionReason: null }), "RETURN_REJECTED");
      const text = lastRequestBody().template.components[0].parameters[3].text;
      expect(text).toMatch(/could not be approved at this time/i);
    });

    it("ITEM_RECEIVED uses its own template regardless of type", async () => {
      await notifyReturnEvent(baseRequest({ returnType: "EXCHANGE" }), "ITEM_RECEIVED");
      expect(lastRequestBody().template.name).toBe("klasiq_return_item_received");
    });

    it("RETURN_COMPLETED uses its own template", async () => {
      await notifyReturnEvent(baseRequest({ returnType: "RETURN" }), "RETURN_COMPLETED");
      expect(lastRequestBody().template.name).toBe("klasiq_return_completed");
    });

    it("EXCHANGE_COMPLETED says 'ready for collection' for Store Pickup and 'completed' for Local Delivery", async () => {
      await notifyReturnEvent(baseRequest({ fulfillmentType: "STORE_PICKUP" }), "EXCHANGE_COMPLETED");
      expect(lastRequestBody().template.components[0].parameters[3].text).toMatch(/ready for collection/i);

      await notifyReturnEvent(baseRequest({ fulfillmentType: "LOCAL_DELIVERY" }), "EXCHANGE_COMPLETED");
      expect(lastRequestBody().template.components[0].parameters[3].text).toMatch(/has been completed/i);
    });
  });

  it("builds the body with returnNumber and orderNumber as distinct parameters", async () => {
    await notifyReturnEvent(baseRequest({ returnNumber: "RET-ABC", orderNumber: "ORD-XYZ" }), "RETURN_APPROVED");
    const params = lastRequestBody().template.components[0].parameters;
    expect(params[1].text).toBe("RET-ABC");
    expect(params[2].text).toBe("ORD-XYZ");
  });

  it("builds the tracking link from the order's own secure access token", async () => {
    await notifyReturnEvent(baseRequest({ orderNumber: "ORD-XYZ", accessToken: "abc123token" }), "RETURN_APPROVED");
    const trackingUrl = lastRequestBody().template.components[0].parameters[4].text;
    expect(trackingUrl).toContain("/order/ORD-XYZ/abc123token");
  });

  it("never logs the rejection reason on either success or failure", async () => {
    await notifyReturnEvent(baseRequest({ rejectionReason: "Sensitive customer complaint detail" }), "RETURN_REJECTED");
    const allLogs = JSON.stringify(errorSpy.mock.calls);
    expect(allLogs).not.toContain("Sensitive customer complaint detail");
  });

  describe("phone selection (section 10 — reused from Part 2, no new rules)", () => {
    it("prefers customerWhatsapp over customerMobile when both are present", async () => {
      await notifyReturnEvent(baseRequest({ customerWhatsapp: "9111111111", customerMobile: "9222222222" }), "RETURN_APPROVED");
      expect(lastRequestBody().to).toBe("919111111111");
    });

    it("falls back to customerMobile when customerWhatsapp is null", async () => {
      await notifyReturnEvent(baseRequest({ customerWhatsapp: null, customerMobile: "9333333333" }), "RETURN_APPROVED");
      expect(lastRequestBody().to).toBe("919333333333");
    });

    it("skips (no send attempted) when neither phone is present, and logs the skip", async () => {
      await notifyReturnEvent(baseRequest({ customerWhatsapp: null, customerMobile: null }), "RETURN_APPROVED");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).toContain("no phone on file");
    });

    it("skips (no send attempted) when the phone on file is malformed, and logs the skip — never guessed or sent as-is", async () => {
      await notifyReturnEvent(baseRequest({ customerWhatsapp: "not-a-phone-number", customerMobile: null }), "RETURN_APPROVED");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).toContain("invalid phone on file");
    });
  });

  describe("missing template configuration", () => {
    it("skips gracefully (no throw, no send) when that event's template env var isn't set", async () => {
      vi.stubEnv("WHATSAPP_RETURN_APPROVED_TEMPLATE_NAME", "");
      await expect(notifyReturnEvent(baseRequest(), "RETURN_APPROVED")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).toContain("template not configured");
    });
  });

  describe("failure handling — never throws (section 9)", () => {
    it("swallows a real delivery failure and never rejects", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: "boom", type: "ServerException", code: 1 } }));
      await expect(notifyReturnEvent(baseRequest(), "RETURN_APPROVED")).resolves.toBeUndefined();
    });

    it("swallows a transport configuration failure (missing credentials) and never rejects", async () => {
      vi.stubEnv("WHATSAPP_API_TOKEN", "");
      await expect(notifyReturnEvent(baseRequest(), "RETURN_APPROVED")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("retry policy (reused from Part 1/2)", () => {
    it("retries once on a genuine network failure before giving up silently", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(jsonResponse(200, {}));
      await notifyReturnEvent(baseRequest(), "RETURN_APPROVED");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("notifyReturnEvent — development default (console stand-in)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NOTIFICATION_PROVIDER", "");
    vi.stubEnv("WHATSAPP_RETURN_APPROVED_TEMPLATE_NAME", "klasiq_return_approved");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("never calls fetch outside production unless NOTIFICATION_PROVIDER=whatsapp is set", async () => {
    await notifyReturnEvent(baseRequest(), "RETURN_APPROVED");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shares the SAME NOTIFICATION_PROVIDER toggle as order notifications — no second engine/toggle", async () => {
    vi.stubEnv("NOTIFICATION_PROVIDER", "whatsapp");
    vi.stubEnv("WHATSAPP_API_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    fetchMock.mockResolvedValue(new Response(JSON.stringify({}), { status: 200 }));
    await notifyReturnEvent(baseRequest(), "RETURN_APPROVED");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
