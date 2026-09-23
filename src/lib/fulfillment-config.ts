/**
 * Single configuration boundary for fulfillment/delivery behavior, now
 * including the Phase 3.3 Part 2 route-based delivery rule and the shop's
 * origin coordinates. No admin settings system exists yet, so this reads
 * environment variables with sensible defaults — but every UI component and
 * server action reads fulfillment rules through this module, never by
 * hard-coding a fee, radius, or coordinate inline. Swapping this for a
 * database-backed admin setting later only means changing this file.
 *
 * Not marked "server-only": it holds business config (fees, coordinates,
 * toggles), never secrets — the Geoapify API key deliberately does NOT live
 * here; see src/server/geoapify.ts, which is server-only. calculateDeliveryFee
 * is intentionally plain/pure so it's directly unit-testable. Only import
 * FULFILLMENT_CONFIG from Server Components/Actions in practice — pass
 * values down as props to any Client Component that needs them.
 */

function envBool(name: string, fallback: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  return raw === "true" || raw === "1";
}

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function envFloat(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const FULFILLMENT_CONFIG = {
  pickupEnabled: envBool("PICKUP_ENABLED", true),
  deliveryEnabled: envBool("DELIVERY_ENABLED", true),
  /** Flat delivery fee in paise, charged only when the route distance is
   * over the free radius AND the subtotal is under the free threshold. ₹50
   * is the current agreed Klasiq policy (Phase 3.3 Part 2) — previously an
   * unvalidated Phase 2 placeholder (₹40). */
  deliveryFeeInPaise: envInt("DELIVERY_FEE_IN_PAISE", 5000),
  /** Subtotal (in paise) at or above which delivery becomes free, regardless
   * of distance (beyond the free radius). ₹1,500 is the current agreed
   * policy — previously an unvalidated Phase 2 placeholder (₹1,000). */
  freeDeliveryThresholdInPaise: envInt("FREE_DELIVERY_THRESHOLD_IN_PAISE", 150000),
  /** Route distance (shop -> destination), in meters, at or under which
   * delivery is always free regardless of subtotal. Meters, not km, because
   * Geoapify's Routing API returns distance in meters — see
   * src/server/geoapify.ts. */
  freeDeliveryRadiusMeters: envInt("FREE_DELIVERY_RADIUS_METERS", 3000),
  /** The single physical shop location — the authoritative origin for every
   * route-distance calculation in this single-store deployment. Kept here,
   * not scattered as inline literals, specifically so a future multi-store
   * phase has one place to replace with a per-order origin lookup instead
   * of a hunt-and-replace across the codebase — see
   * docs/PHASE_3_3_REPORT.md Part 2 "Architecture debt". Not implementing
   * multi-store now.
   *
   * Source: Milan Readymade & General Store,
   * https://maps.app.goo.gl/ZdogcBAuFPhCApXN9 */
  shopLatitude: envFloat("SHOP_LATITUDE", 25.9579568),
  shopLongitude: envFloat("SHOP_LONGITUDE", 83.2697821),
  serviceableAreaNote:
    process.env.DELIVERY_SERVICEABLE_AREA_NOTE ??
    "We currently deliver within a few kilometres of the store. If you're unsure we cover your area, choose Store Pickup or call us.",
} as const;

/**
 * Pure so it's directly unit-testable without touching env/config loading,
 * Geoapify, or the database. Store Pickup never has a delivery fee, by
 * definition, and never needs a route distance. A Local Delivery order
 * REQUIRES a route distance — the type signature makes it impossible to
 * call this for LOCAL_DELIVERY without one, since the caller must always
 * have resolved it (via src/server/geoapify.ts) before pricing is decided.
 *
 * Rule (Phase 3.3 Part 2, "Klasiq's within-3km policy"):
 *   - route distance <= freeDeliveryRadiusMeters -> always FREE
 *   - route distance >  freeDeliveryRadiusMeters:
 *       - subtotal >= freeDeliveryThresholdInPaise -> FREE
 *       - subtotal <  freeDeliveryThresholdInPaise -> deliveryFeeInPaise
 */
export type DeliveryFeeParams =
  | { fulfillmentType: "STORE_PICKUP" }
  | {
      fulfillmentType: "LOCAL_DELIVERY";
      subtotalInPaise: number;
      routeDistanceMeters: number;
      deliveryFeeInPaise: number;
      freeDeliveryThresholdInPaise: number;
      freeDeliveryRadiusMeters: number;
    };

export function calculateDeliveryFee(params: DeliveryFeeParams): number {
  if (params.fulfillmentType === "STORE_PICKUP") return 0;

  const { subtotalInPaise, routeDistanceMeters, deliveryFeeInPaise, freeDeliveryThresholdInPaise, freeDeliveryRadiusMeters } =
    params;

  if (routeDistanceMeters <= freeDeliveryRadiusMeters) return 0;
  if (subtotalInPaise >= freeDeliveryThresholdInPaise) return 0;
  return deliveryFeeInPaise;
}
