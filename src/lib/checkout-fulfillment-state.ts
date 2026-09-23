export type FulfillmentType = "STORE_PICKUP" | "LOCAL_DELIVERY";

export type DeliverySelection = {
  formattedAddress: string;
  lat: number;
  lon: number;
};

export type DeliveryPreview = {
  deliveryFeeInPaise: number;
  routeDistanceMeters: number;
};

export type CheckoutFulfillmentState = {
  fulfillmentType: FulfillmentType;
  destination: DeliverySelection | null;
  deliveryPreview: DeliveryPreview | null;
};

export type CheckoutFulfillmentAction =
  | { type: "SET_FULFILLMENT_TYPE"; fulfillmentType: FulfillmentType }
  | { type: "SET_DESTINATION"; destination: DeliverySelection | null }
  | { type: "SET_DELIVERY_PREVIEW"; deliveryPreview: DeliveryPreview | null };

/**
 * Keeps `fulfillmentType`/`destination`/`deliveryPreview` as ONE unit of
 * state (checkout-form.tsx's `useReducer`) specifically so switching
 * fulfillment type can never leave a stale selected location/quote behind —
 * see docs/PHASE_3_3_REPORT.md Part 3 "Fulfillment switching". Extracted as
 * a plain, pure function (not inlined in the component) so this exact
 * behavior is directly unit-testable without rendering React at all — see
 * src/lib/__tests__/checkout-fulfillment-state.test.ts.
 *
 * Switching to the SAME fulfillment type is a no-op (returns the identical
 * state) — clicking the already-active tab must not interrupt an in-flight
 * preview for no reason.
 */
export function checkoutFulfillmentReducer(
  state: CheckoutFulfillmentState,
  action: CheckoutFulfillmentAction,
): CheckoutFulfillmentState {
  switch (action.type) {
    case "SET_FULFILLMENT_TYPE": {
      if (action.fulfillmentType === state.fulfillmentType) return state;
      return { fulfillmentType: action.fulfillmentType, destination: null, deliveryPreview: null };
    }
    case "SET_DESTINATION":
      return { ...state, destination: action.destination };
    case "SET_DELIVERY_PREVIEW":
      return { ...state, deliveryPreview: action.deliveryPreview };
    default:
      return state;
  }
}
