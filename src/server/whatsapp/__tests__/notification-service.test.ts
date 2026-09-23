import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyOrderEvent, type OrderForNotification } from "@/server/whatsapp/notification-service";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function baseOrder(overrides: Partial<OrderForNotification> = {}): OrderForNotification {
  return {
    orderNumber: "ORD-20260808-ABCDE",
    accessToken: "test-access-token",
    source: "ONLINE",
    fulfillmentType: "LOCAL_DELIVERY",
    customerName: "Riya Sharma",
    customerMobile: "9876543210",
    customerWhatsapp: "9876543210",
    schoolName: null,
    ...overrides,
  };
}

describe("notifyOrderEvent", () => {
  let fetchMock: ReturnType<typeof vi.fn>;
  let errorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, {}));
    vi.stubGlobal("fetch", fetchMock);
    errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "log").mockImplementation(() => {});

    // Force the real WhatsApp path (never the console dev stand-in) so
    // these tests exercise the actual send attempt via mocked fetch.
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NOTIFICATION_PROVIDER", "whatsapp");
    vi.stubEnv("WHATSAPP_API_TOKEN", "test-token");
    vi.stubEnv("WHATSAPP_PHONE_NUMBER_ID", "1234567890");
    vi.stubEnv("WHATSAPP_ORDER_PLACED_TEMPLATE_NAME", "klasiq_order_placed");
    vi.stubEnv("WHATSAPP_ORDER_CONFIRMED_TEMPLATE_NAME", "klasiq_order_confirmed");
    vi.stubEnv("WHATSAPP_ORDER_PREPARING_TEMPLATE_NAME", "klasiq_order_preparing");
    vi.stubEnv("WHATSAPP_ORDER_READY_TEMPLATE_NAME", "klasiq_order_ready");
    vi.stubEnv("WHATSAPP_ORDER_DELIVERED_TEMPLATE_NAME", "klasiq_order_delivered");
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

  describe("the five events", () => {
    it("ORDER_PLACED uses its own template and a placed-context line", async () => {
      await notifyOrderEvent(baseOrder(), "ORDER_PLACED");
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const body = lastRequestBody();
      expect(body.template.name).toBe("klasiq_order_placed");
      expect(body.template.components[0].parameters[2].text).toMatch(/placed/i);
    });

    it("ORDER_CONFIRMED uses its own template and a confirmed-context line", async () => {
      await notifyOrderEvent(baseOrder(), "ORDER_CONFIRMED");
      const body = lastRequestBody();
      expect(body.template.name).toBe("klasiq_order_confirmed");
      expect(body.template.components[0].parameters[2].text).toMatch(/confirmed/i);
    });

    it("PREPARING uses its own template and a preparing-context line", async () => {
      await notifyOrderEvent(baseOrder(), "PREPARING");
      const body = lastRequestBody();
      expect(body.template.name).toBe("klasiq_order_preparing");
      expect(body.template.components[0].parameters[2].text).toMatch(/prepared/i);
    });

    it("READY_FOR_PICKUP uses its own template and mentions the pickup location", async () => {
      await notifyOrderEvent(baseOrder({ fulfillmentType: "STORE_PICKUP" }), "READY_FOR_PICKUP");
      const body = lastRequestBody();
      expect(body.template.name).toBe("klasiq_order_ready");
      expect(body.template.components[0].parameters[2].text).toMatch(/ready for pickup/i);
    });

    it("DELIVERED says 'collected' for Store Pickup and 'delivered' for Local Delivery", async () => {
      await notifyOrderEvent(baseOrder({ fulfillmentType: "STORE_PICKUP" }), "DELIVERED");
      expect(lastRequestBody().template.components[0].parameters[2].text).toMatch(/collected/i);

      await notifyOrderEvent(baseOrder({ fulfillmentType: "LOCAL_DELIVERY" }), "DELIVERED");
      expect(lastRequestBody().template.components[0].parameters[2].text).toMatch(/delivered/i);
    });
  });

  it("includes the school name in the context line when present, omits it when absent", async () => {
    await notifyOrderEvent(baseOrder({ schoolName: "Demo Sunrise Public School" }), "ORDER_CONFIRMED");
    expect(lastRequestBody().template.components[0].parameters[2].text).toContain("Demo Sunrise Public School");

    await notifyOrderEvent(baseOrder({ schoolName: null }), "ORDER_CONFIRMED");
    expect(lastRequestBody().template.components[0].parameters[2].text).not.toContain("for ");
  });

  it("builds the tracking link from the order's own secure access token", async () => {
    await notifyOrderEvent(baseOrder({ orderNumber: "ORD-XYZ", accessToken: "abc123token" }), "ORDER_CONFIRMED");
    const trackingUrl = lastRequestBody().template.components[0].parameters[3].text;
    expect(trackingUrl).toContain("/order/ORD-XYZ/abc123token");
  });

  describe("Counter exclusion (section 13)", () => {
    it("never sends any of the five events for a COUNTER-sourced order", async () => {
      for (const event of ["ORDER_PLACED", "ORDER_CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "DELIVERED"] as const) {
        await notifyOrderEvent(baseOrder({ source: "COUNTER" }), event);
      }
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("phone selection (section 12)", () => {
    it("prefers customerWhatsapp over customerMobile when both are present", async () => {
      await notifyOrderEvent(baseOrder({ customerWhatsapp: "9111111111", customerMobile: "9222222222" }), "ORDER_CONFIRMED");
      expect(lastRequestBody().to).toBe("919111111111");
    });

    it("falls back to customerMobile when customerWhatsapp is null", async () => {
      await notifyOrderEvent(baseOrder({ customerWhatsapp: null, customerMobile: "9333333333" }), "ORDER_CONFIRMED");
      expect(lastRequestBody().to).toBe("919333333333");
    });

    it("skips (no send attempted) when neither phone is present, and logs the skip", async () => {
      await notifyOrderEvent(baseOrder({ customerWhatsapp: null, customerMobile: null }), "ORDER_CONFIRMED");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).toContain("no phone on file");
    });

    it("skips (no send attempted) when the phone on file is malformed, and logs the skip — never guessed or sent as-is", async () => {
      await notifyOrderEvent(baseOrder({ customerWhatsapp: "not-a-phone-number", customerMobile: null }), "ORDER_CONFIRMED");
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).toContain("invalid phone on file");
    });
  });

  describe("missing template configuration", () => {
    it("skips gracefully (no throw, no send) when that event's template env var isn't set", async () => {
      vi.stubEnv("WHATSAPP_ORDER_CONFIRMED_TEMPLATE_NAME", "");
      await expect(notifyOrderEvent(baseOrder(), "ORDER_CONFIRMED")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
      expect(JSON.stringify(errorSpy.mock.calls)).toContain("template not configured");
    });
  });

  describe("failure handling — never throws (section 9)", () => {
    it("swallows a real delivery failure and never rejects", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(500, { error: { message: "boom", type: "ServerException", code: 1 } }));
      await expect(notifyOrderEvent(baseOrder(), "ORDER_CONFIRMED")).resolves.toBeUndefined();
    });

    it("swallows a transport configuration failure (missing credentials) and never rejects", async () => {
      vi.stubEnv("WHATSAPP_API_TOKEN", "");
      await expect(notifyOrderEvent(baseOrder(), "ORDER_CONFIRMED")).resolves.toBeUndefined();
      expect(fetchMock).not.toHaveBeenCalled();
    });
  });

  describe("retry policy (reused from Part 1)", () => {
    it("retries once on a genuine network failure before giving up silently", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(jsonResponse(200, {}));
      await notifyOrderEvent(baseOrder(), "ORDER_CONFIRMED");
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});

describe("notifyOrderEvent — development default (console stand-in)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.spyOn(console, "log").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.stubEnv("NODE_ENV", "test");
    vi.stubEnv("NOTIFICATION_PROVIDER", "");
    vi.stubEnv("WHATSAPP_ORDER_CONFIRMED_TEMPLATE_NAME", "klasiq_order_confirmed");
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("never calls fetch outside production unless NOTIFICATION_PROVIDER=whatsapp is set", async () => {
    await notifyOrderEvent(baseOrder(), "ORDER_CONFIRMED");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
