import "server-only";
import { FULFILLMENT_CONFIG } from "@/lib/fulfillment-config";

/**
 * The one and only boundary between Klasiq and Geoapify. Server-only —
 * `GEOAPIFY_API_KEY` never reaches a Client Component, a test, or a log
 * line. See docs/PHASE_3_3_REPORT.md Part 2 "Key security".
 *
 * Both functions here return a typed result, never throw, and never guess:
 * a timeout, network error, rate limit, malformed response, or missing API
 * key all collapse into a `success: false` result with a specific `type`,
 * so callers (src/server/actions/checkout-address.ts,
 * src/server/commerce/place-order.ts) can show a clear, honest message
 * instead of inventing a distance or fee. See docs/PHASE_3_3_REPORT.md
 * Part 2 "External API failure handling".
 */

const GEOAPIFY_BASE_URL = "https://api.geoapify.com";
const REQUEST_TIMEOUT_MS = 8000;
// A generous bias/filter radius around the shop — wide enough to never
// exclude a legitimately nearby address (delivery itself is only offered
// within a few km), narrow enough to keep autocomplete results regional
// rather than showing irrelevant results from other states/countries. See
// docs/PHASE_3_3_REPORT.md Part 2 "Address autocomplete".
const AUTOCOMPLETE_BIAS_RADIUS_METERS = 50_000;
const AUTOCOMPLETE_RESULT_LIMIT = 5;

export type GeoapifyErrorType =
  | "NOT_CONFIGURED"
  | "TIMEOUT"
  | "NETWORK_ERROR"
  | "RATE_LIMITED"
  | "PROVIDER_ERROR"
  | "NO_ROUTE";

export type GeoapifyError = { type: GeoapifyErrorType; message: string };

export type AddressSuggestion = {
  /** A stable key for this exact suggestion — Geoapify's own place id when
   * present, otherwise a coordinate-derived fallback. Client-facing, but
   * carries no sensitive data itself. */
  id: string;
  formattedAddress: string;
  city: string | null;
  county: string | null;
  state: string | null;
  postcode: string | null;
  lat: number;
  lon: number;
};

export type AddressSearchResult =
  | { success: true; suggestions: AddressSuggestion[] }
  | { success: false; error: GeoapifyError };

export type RouteDistanceResult =
  | { success: true; distanceMeters: number }
  | { success: false; error: GeoapifyError };

function isConfigured(): boolean {
  return Boolean(process.env.GEOAPIFY_API_KEY);
}

/**
 * Wraps `fetch` with a hard timeout and uniform error mapping — every
 * caller in this file goes through this instead of a bare `fetch`, so
 * "the network/provider misbehaved" is handled in exactly one place.
 * Never logs or returns the API key; never logs the full destination URL
 * either (it contains the key as a query param) — only the path.
 */
async function fetchGeoapify(path: string, params: URLSearchParams): Promise<
  { success: true; data: unknown } | { success: false; error: GeoapifyError }
> {
  const apiKey = process.env.GEOAPIFY_API_KEY;
  if (!apiKey) {
    return {
      success: false,
      error: { type: "NOT_CONFIGURED", message: "Address lookup is not configured." },
    };
  }

  params.set("apiKey", apiKey);
  const url = `${GEOAPIFY_BASE_URL}${path}?${params.toString()}`;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(url, { signal: controller.signal });

    if (response.status === 429) {
      return {
        success: false,
        error: { type: "RATE_LIMITED", message: "Address lookup is temporarily busy." },
      };
    }
    if (!response.ok) {
      return {
        success: false,
        error: { type: "PROVIDER_ERROR", message: "Address lookup failed." },
      };
    }

    const data: unknown = await response.json();
    return { success: true, data };
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      return { success: false, error: { type: "TIMEOUT", message: "Address lookup timed out." } };
    }
    // Deliberately minimal: never log the request URL (contains the API
    // key) or forward the raw error to a caller.
    console.error("geoapify: unexpected error", path, err instanceof Error ? err.message : String(err));
    return {
      success: false,
      error: { type: "NETWORK_ERROR", message: "Could not reach the address lookup service." },
    };
  } finally {
    clearTimeout(timeout);
  }
}

type GeoapifyAutocompleteFeatureProperties = {
  place_id?: string;
  formatted?: string;
  city?: string;
  county?: string;
  state?: string;
  postcode?: string;
  lat?: number;
  lon?: number;
};

/**
 * Geoapify Geocoding Autocomplete API
 * (`GET /v1/geocode/autocomplete`) — called server-side only (see
 * src/server/actions/checkout-address.ts), so the API key is never sent to
 * the browser. Biased (not hard-filtered) toward the shop's location so
 * results stay regionally relevant without excluding a legitimately nearby
 * address that happens to rank slightly further in Geoapify's own scoring.
 */
export async function searchDeliveryAddresses(query: string): Promise<AddressSearchResult> {
  const trimmed = query.trim();
  if (!trimmed) return { success: true, suggestions: [] };

  const params = new URLSearchParams({
    text: trimmed,
    format: "json",
    limit: String(AUTOCOMPLETE_RESULT_LIMIT),
    bias: `proximity:${FULFILLMENT_CONFIG.shopLongitude},${FULFILLMENT_CONFIG.shopLatitude}`,
    filter: `circle:${FULFILLMENT_CONFIG.shopLongitude},${FULFILLMENT_CONFIG.shopLatitude},${AUTOCOMPLETE_BIAS_RADIUS_METERS}`,
  });

  const result = await fetchGeoapify("/v1/geocode/autocomplete", params);
  if (!result.success) return result;

  try {
    const data = result.data as { results?: GeoapifyAutocompleteFeatureProperties[] };
    const rawResults = Array.isArray(data.results) ? data.results : [];

    const suggestions: AddressSuggestion[] = rawResults
      .filter((r): r is GeoapifyAutocompleteFeatureProperties & { lat: number; lon: number; formatted: string } =>
        typeof r.lat === "number" && typeof r.lon === "number" && typeof r.formatted === "string",
      )
      .map((r) => ({
        id: r.place_id ?? `${r.lat},${r.lon}`,
        formattedAddress: r.formatted,
        city: r.city ?? null,
        county: r.county ?? null,
        state: r.state ?? null,
        postcode: r.postcode ?? null,
        lat: r.lat,
        lon: r.lon,
      }));

    return { success: true, suggestions };
  } catch (err) {
    console.error("geoapify: malformed autocomplete response", err instanceof Error ? err.message : String(err));
    return { success: false, error: { type: "PROVIDER_ERROR", message: "Address lookup failed." } };
  }
}

/**
 * Geoapify Routing API (`GET /v1/routing`), `mode=drive` — the closest
 * available proxy for a local delivery run by scooter/bike (Geoapify has no
 * dedicated two-wheeler mode); drive-mode road routing is a reasonable
 * approximation for a small local delivery radius. Chosen over the Route
 * Matrix API because this is always exactly one origin (the shop) to one
 * destination (the customer) per checkout — the matrix API is for many
 * origins/destinations at once and would be unnecessary complexity and
 * cost here. See docs/PHASE_3_3_REPORT.md Part 2 "Routing endpoint/mode".
 */
export async function calculateRouteDistanceMeters(destination: {
  lat: number;
  lon: number;
}): Promise<RouteDistanceResult> {
  const params = new URLSearchParams({
    waypoints: `${FULFILLMENT_CONFIG.shopLatitude},${FULFILLMENT_CONFIG.shopLongitude}|${destination.lat},${destination.lon}`,
    mode: "drive",
  });

  const result = await fetchGeoapify("/v1/routing", params);
  if (!result.success) return result;

  try {
    const data = result.data as {
      features?: Array<{ properties?: { distance?: number } }>;
    };
    const distance = data.features?.[0]?.properties?.distance;

    if (typeof distance !== "number" || !Number.isFinite(distance) || distance < 0) {
      return { success: false, error: { type: "NO_ROUTE", message: "No delivery route found to that address." } };
    }

    return { success: true, distanceMeters: Math.round(distance) };
  } catch (err) {
    console.error("geoapify: malformed routing response", err instanceof Error ? err.message : String(err));
    return { success: false, error: { type: "PROVIDER_ERROR", message: "Could not calculate delivery distance." } };
  }
}

/** Exposed only so callers/tests can check configuration without touching
 * process.env directly in more than one place. */
export function isGeoapifyConfigured(): boolean {
  return isConfigured();
}
