"use server";

import { basketTotalInPaise, getBasket } from "@/lib/basket";
import {
  calculateDeliveryFee,
  deliveryOutOfRangeMessage,
  FULFILLMENT_CONFIG,
  isBeyondDeliveryRange,
} from "@/lib/fulfillment-config";
import {
  deliveryAddressSearchSchema,
  deliveryFeePreviewSchema,
} from "@/lib/validation/checkout-address";
import {
  calculateRouteDistanceMeters,
  searchDeliveryAddresses,
  type AddressSuggestion,
  type GeoapifyErrorType,
} from "@/server/geoapify";

export type SearchDeliveryAddressResult =
  | { success: true; suggestions: AddressSuggestion[] }
  | { success: false; error: { type: "VALIDATION" | GeoapifyErrorType; message: string } };

/**
 * Server-side proxy for Geoapify's autocomplete API — the ONLY way the
 * checkout page's address search reaches Geoapify. Keeping this behind a
 * Server Action (rather than calling Geoapify from the browser) is what
 * keeps GEOAPIFY_API_KEY out of client code entirely. See
 * docs/PHASE_3_3_REPORT.md Part 2 "Key security".
 */
export async function searchDeliveryAddressAction(
  input: unknown,
): Promise<SearchDeliveryAddressResult> {
  const parsed = deliveryAddressSearchSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Invalid search." } };
  }

  const result = await searchDeliveryAddresses(parsed.data.query);
  if (!result.success) {
    return { success: false, error: result.error };
  }
  return { success: true, suggestions: result.suggestions };
}

export type PreviewDeliveryFeeResult =
  | {
      success: true;
      subtotalInPaise: number;
      deliveryFeeInPaise: number;
      totalInPaise: number;
      routeDistanceMeters: number;
    }
  | {
      success: false;
      error: { type: "VALIDATION" | "EMPTY_BASKET" | "OUT_OF_RANGE" | GeoapifyErrorType; message: string };
    };

/**
 * A non-binding preview shown to the customer after they select a delivery
 * location — the subtotal is read fresh from the server-side basket (never
 * trusted from the client) and the route distance comes from a real
 * Geoapify routing call. This is NOT the authoritative charge: placeOrder
 * recalculates everything again at submission time and rejects a stale
 * mismatch rather than silently charging whatever this preview showed. See
 * docs/PHASE_3_3_REPORT.md Part 2 "Delivery quote consistency".
 */
export async function previewDeliveryFeeAction(
  input: unknown,
): Promise<PreviewDeliveryFeeResult> {
  const parsed = deliveryFeePreviewSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: "Please select a valid delivery location." },
    };
  }

  const basket = await getBasket();
  if (!basket || basket.items.length === 0) {
    return { success: false, error: { type: "EMPTY_BASKET", message: "Your bag is empty." } };
  }
  const subtotalInPaise = basketTotalInPaise(basket);

  const routeResult = await calculateRouteDistanceMeters({ lat: parsed.data.lat, lon: parsed.data.lon });
  if (!routeResult.success) {
    return {
      success: false,
      error: {
        type: routeResult.error.type,
        message:
          "We couldn't verify delivery distance right now. Please try again or choose Store Pickup.",
      },
    };
  }

  if (isBeyondDeliveryRange(routeResult.distanceMeters, FULFILLMENT_CONFIG.maxDeliveryDistanceMeters)) {
    return {
      success: false,
      error: {
        type: "OUT_OF_RANGE",
        message: deliveryOutOfRangeMessage(routeResult.distanceMeters, FULFILLMENT_CONFIG.maxDeliveryDistanceMeters),
      },
    };
  }

  const deliveryFeeInPaise = calculateDeliveryFee({
    fulfillmentType: "LOCAL_DELIVERY",
    subtotalInPaise,
    routeDistanceMeters: routeResult.distanceMeters,
    deliveryFeeInPaise: FULFILLMENT_CONFIG.deliveryFeeInPaise,
    freeDeliveryThresholdInPaise: FULFILLMENT_CONFIG.freeDeliveryThresholdInPaise,
    freeDeliveryRadiusMeters: FULFILLMENT_CONFIG.freeDeliveryRadiusMeters,
  });

  return {
    success: true,
    subtotalInPaise,
    deliveryFeeInPaise,
    totalInPaise: subtotalInPaise + deliveryFeeInPaise,
    routeDistanceMeters: routeResult.distanceMeters,
  };
}
