import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { WhatsAppOtpProvider } from "@/server/otp/whatsapp-provider";

const TEST_CONFIG = {
  apiToken: "test-token-never-a-real-secret",
  phoneNumberId: "1234567890",
  templateName: "klasiq_otp_verification",
  baseUrl: "https://fake-graph.example.test/v99.0",
};

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("WhatsAppOtpProvider", () => {
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

  describe("success", () => {
    it("sends a single, correctly-shaped request to Meta's Graph API", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, { messages: [{ id: "wamid.test" }] }));
      const provider = new WhatsAppOtpProvider(TEST_CONFIG);

      await provider.sendOtp({ phoneNormalized: "+919876543210", code: "042817", purpose: "CUSTOMER_PORTAL_LOGIN" });

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe(`${TEST_CONFIG.baseUrl}/${TEST_CONFIG.phoneNumberId}/messages`);
      expect(init.method).toBe("POST");
      expect(init.headers.Authorization).toBe(`Bearer ${TEST_CONFIG.apiToken}`);
      expect(init.headers["Content-Type"]).toBe("application/json");

      const body = JSON.parse(init.body as string);
      expect(body.messaging_product).toBe("whatsapp");
      // No leading "+" — Meta's Cloud API expects a bare E.164 number.
      expect(body.to).toBe("919876543210");
      expect(body.type).toBe("template");
      expect(body.template.name).toBe(TEST_CONFIG.templateName);
      expect(body.template.language.code).toBe("en_US");
      expect(body.template.components).toEqual([{ type: "body", parameters: [{ type: "text", text: "042817" }] }]);
    });

    it("honors a custom template language and API version", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
      const provider = new WhatsAppOtpProvider({
        ...TEST_CONFIG,
        baseUrl: undefined,
        apiVersion: "v20.0",
        templateLanguage: "en_IN",
        phoneNumberId: "555",
      });

      await provider.sendOtp({ phoneNormalized: "+919876543210", code: "111111", purpose: "CUSTOMER_PORTAL_LOGIN" });

      const [url, init] = fetchMock.mock.calls[0]!;
      expect(url).toBe("https://graph.facebook.com/v20.0/555/messages");
      const body = JSON.parse(init.body as string);
      expect(body.template.language.code).toBe("en_IN");
    });

    it("logs a delivery-success line containing a MASKED phone number, never the raw number or the code", async () => {
      fetchMock.mockResolvedValueOnce(jsonResponse(200, {}));
      const provider = new WhatsAppOtpProvider(TEST_CONFIG);

      await provider.sendOtp({ phoneNormalized: "+919876543210", code: "999999", purpose: "CUSTOMER_PORTAL_LOGIN" });

      const loggedText = JSON.stringify(logSpy.mock.calls);
      // Personal-data audit (2026-08-10) — masked, never the full number.
      expect(loggedText).toContain("+91••••••10");
      expect(loggedText).not.toContain("+919876543210");
      expect(loggedText).not.toContain("999999");
      const errorText = JSON.stringify(errorSpy.mock.calls);
      expect(errorText).not.toContain("999999");
    });
  });

  describe("failure — a real HTTP response is never retried", () => {
    it("throws without leaking the raw response body, and never retries a received response", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(400, {
          error: { message: "Invalid parameter", type: "OAuthException", code: 100, error_subcode: 2494010 },
        }),
      );
      const provider = new WhatsAppOtpProvider(TEST_CONFIG);

      await expect(
        provider.sendOtp({ phoneNormalized: "+919876543210", code: "042817", purpose: "CUSTOMER_PORTAL_LOGIN" }),
      ).rejects.toThrow();

      // Exactly one attempt — a real (even error) response from Meta must
      // never be retried, since the message may already have been queued.
      expect(fetchMock).toHaveBeenCalledTimes(1);

      const errorText = JSON.stringify(errorSpy.mock.calls);
      expect(errorText).not.toContain("042817");
      expect(errorText).not.toContain(TEST_CONFIG.apiToken);
      expect(errorText).not.toContain("Invalid parameter"); // raw Meta message never logged verbatim
    });

    it("surfaces only a coarse error category (http status + Meta error code), not the full body", async () => {
      fetchMock.mockResolvedValueOnce(
        jsonResponse(401, { error: { message: "secret-account-detail-should-not-leak", type: "OAuthException", code: 190 } }),
      );
      const provider = new WhatsAppOtpProvider(TEST_CONFIG);

      await expect(
        provider.sendOtp({ phoneNormalized: "+919876543210", code: "042817", purpose: "CUSTOMER_PORTAL_LOGIN" }),
      ).rejects.toThrow();

      const [, loggedArgs] = errorSpy.mock.calls[0]!;
      expect(loggedArgs.httpStatus).toBe(401);
      expect(loggedArgs.metaErrorCode).toBe(190);
      expect(JSON.stringify(errorSpy.mock.calls)).not.toContain("secret-account-detail-should-not-leak");
    });
  });

  describe("failure — network-level errors retry exactly once", () => {
    it("retries a genuine network failure once, then succeeds", async () => {
      fetchMock
        .mockRejectedValueOnce(new TypeError("fetch failed"))
        .mockResolvedValueOnce(jsonResponse(200, {}));
      const provider = new WhatsAppOtpProvider(TEST_CONFIG);

      await provider.sendOtp({ phoneNormalized: "+919876543210", code: "042817", purpose: "CUSTOMER_PORTAL_LOGIN" });

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it("retries at most once — two consecutive network failures both attempts are made, then it throws", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("fetch failed")).mockRejectedValueOnce(new TypeError("fetch failed"));
      const provider = new WhatsAppOtpProvider(TEST_CONFIG);

      await expect(
        provider.sendOtp({ phoneNormalized: "+919876543210", code: "042817", purpose: "CUSTOMER_PORTAL_LOGIN" }),
      ).rejects.toThrow();

      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });
});
