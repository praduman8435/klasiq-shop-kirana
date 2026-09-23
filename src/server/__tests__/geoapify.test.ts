import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// The whole point of this module (see src/server/geoapify.ts's doc comment)
// is that nothing else in the codebase ever depends on a live network call
// to Geoapify — every scenario here drives that boundary through a mocked
// global fetch, never a real request. See docs/PHASE_3_3_REPORT.md Part 2
// "Tests".

const ORIGINAL_API_KEY = process.env.GEOAPIFY_API_KEY;

function jsonResponse(status: number, body: unknown) {
  return {
    status,
    ok: status >= 200 && status < 300,
    json: async () => body,
  } as Response;
}

describe("geoapify", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubGlobal("fetch", vi.fn());
    process.env.GEOAPIFY_API_KEY = "test-key-do-not-log";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    if (ORIGINAL_API_KEY === undefined) {
      delete process.env.GEOAPIFY_API_KEY;
    } else {
      process.env.GEOAPIFY_API_KEY = ORIGINAL_API_KEY;
    }
  });

  describe("NOT_CONFIGURED", () => {
    it("searchDeliveryAddresses fails NOT_CONFIGURED without calling fetch when no key is set", async () => {
      delete process.env.GEOAPIFY_API_KEY;
      const { searchDeliveryAddresses } = await import("@/server/geoapify");

      const result = await searchDeliveryAddresses("123 Main St");
      expect(result).toEqual({
        success: false,
        error: { type: "NOT_CONFIGURED", message: "Address lookup is not configured." },
      });
      expect(fetch).not.toHaveBeenCalled();
    });

    it("calculateRouteDistanceMeters fails NOT_CONFIGURED without calling fetch when no key is set", async () => {
      delete process.env.GEOAPIFY_API_KEY;
      const { calculateRouteDistanceMeters } = await import("@/server/geoapify");

      const result = await calculateRouteDistanceMeters({ lat: 25.96, lon: 83.27 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe("NOT_CONFIGURED");
      expect(fetch).not.toHaveBeenCalled();
    });

    it("isGeoapifyConfigured reflects whether GEOAPIFY_API_KEY is set", async () => {
      delete process.env.GEOAPIFY_API_KEY;
      const { isGeoapifyConfigured } = await import("@/server/geoapify");
      expect(isGeoapifyConfigured()).toBe(false);
    });
  });

  it("empty search queries return an empty suggestion list without calling fetch", async () => {
    const { searchDeliveryAddresses } = await import("@/server/geoapify");
    const result = await searchDeliveryAddresses("   ");
    expect(result).toEqual({ success: true, suggestions: [] });
    expect(fetch).not.toHaveBeenCalled();
  });

  it("maps a successful autocomplete response into suggestions, filtering out entries missing coordinates", async () => {
    vi.mocked(fetch).mockResolvedValue(
      jsonResponse(200, {
        results: [
          {
            place_id: "abc123",
            formatted: "12 Market Road, Sector 5, Varanasi, Uttar Pradesh, 221001",
            city: "Varanasi",
            county: "Varanasi",
            state: "Uttar Pradesh",
            postcode: "221001",
            lat: 25.96,
            lon: 83.27,
          },
          // Missing lat/lon — must be filtered out, never passed through
          // with a guessed location.
          { formatted: "Somewhere with no coordinates" },
        ],
      }),
    );
    const { searchDeliveryAddresses } = await import("@/server/geoapify");

    const result = await searchDeliveryAddresses("12 Market Road");
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.suggestions).toHaveLength(1);
    expect(result.suggestions[0]).toEqual({
      id: "abc123",
      formattedAddress: "12 Market Road, Sector 5, Varanasi, Uttar Pradesh, 221001",
      city: "Varanasi",
      county: "Varanasi",
      state: "Uttar Pradesh",
      postcode: "221001",
      lat: 25.96,
      lon: 83.27,
    });
  });

  it("never sends the API key anywhere but as a request param, and never logs it", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { results: [] }));
    const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { searchDeliveryAddresses } = await import("@/server/geoapify");

    await searchDeliveryAddresses("Test Query");

    const [calledUrl] = vi.mocked(fetch).mock.calls[0]!;
    expect(String(calledUrl)).toContain("apiKey=test-key-do-not-log");
    for (const call of consoleErrorSpy.mock.calls) {
      expect(JSON.stringify(call)).not.toContain("test-key-do-not-log");
    }
  });

  it("maps HTTP 429 to RATE_LIMITED", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(429, {}));
    const { searchDeliveryAddresses } = await import("@/server/geoapify");

    const result = await searchDeliveryAddresses("Test Query");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("RATE_LIMITED");
  });

  it("maps a non-ok HTTP response to PROVIDER_ERROR", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(500, {}));
    const { searchDeliveryAddresses } = await import("@/server/geoapify");

    const result = await searchDeliveryAddresses("Test Query");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PROVIDER_ERROR");
  });

  it("maps a timeout (AbortError) to TIMEOUT", async () => {
    vi.mocked(fetch).mockImplementation(() => {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      return Promise.reject(err);
    });
    const { searchDeliveryAddresses } = await import("@/server/geoapify");

    const result = await searchDeliveryAddresses("Test Query");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("TIMEOUT");
  });

  it("maps a generic network failure to NETWORK_ERROR without leaking the raw error", async () => {
    vi.mocked(fetch).mockRejectedValue(new Error("getaddrinfo ENOTFOUND api.geoapify.com"));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { searchDeliveryAddresses } = await import("@/server/geoapify");

    const result = await searchDeliveryAddresses("Test Query");
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("NETWORK_ERROR");
      expect(result.error.message).not.toContain("ENOTFOUND");
    }
  });

  it("maps a malformed (unparseable-shape) autocomplete response to PROVIDER_ERROR", async () => {
    vi.mocked(fetch).mockResolvedValue(jsonResponse(200, null));
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { searchDeliveryAddresses } = await import("@/server/geoapify");

    const result = await searchDeliveryAddresses("Test Query");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PROVIDER_ERROR");
  });

  describe("calculateRouteDistanceMeters", () => {
    it("returns a rounded route distance on success — never straight-line, only Geoapify's routing result", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, {
          features: [{ properties: { distance: 3204.6 } }],
        }),
      );
      const { calculateRouteDistanceMeters } = await import("@/server/geoapify");

      const result = await calculateRouteDistanceMeters({ lat: 25.96, lon: 83.27 });
      expect(result).toEqual({ success: true, distanceMeters: 3205 });

      const [calledUrl] = vi.mocked(fetch).mock.calls[0]!;
      expect(String(calledUrl)).toContain("mode=drive");
    });

    it("returns NO_ROUTE when Geoapify finds no route, never guessing a distance", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, { features: [] }));
      const { calculateRouteDistanceMeters } = await import("@/server/geoapify");

      const result = await calculateRouteDistanceMeters({ lat: 25.96, lon: 83.27 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe("NO_ROUTE");
    });

    it("returns NO_ROUTE when the distance field is missing or not a finite number", async () => {
      vi.mocked(fetch).mockResolvedValue(
        jsonResponse(200, { features: [{ properties: { distance: Number.NaN } }] }),
      );
      const { calculateRouteDistanceMeters } = await import("@/server/geoapify");

      const result = await calculateRouteDistanceMeters({ lat: 25.96, lon: 83.27 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe("NO_ROUTE");
    });

    it("maps a malformed routing response to PROVIDER_ERROR", async () => {
      vi.mocked(fetch).mockResolvedValue(jsonResponse(200, null));
      vi.spyOn(console, "error").mockImplementation(() => {});
      const { calculateRouteDistanceMeters } = await import("@/server/geoapify");

      const result = await calculateRouteDistanceMeters({ lat: 25.96, lon: 83.27 });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe("PROVIDER_ERROR");
    });
  });
});
