import { describe, expect, it } from "vitest";
import {
  checkoutFulfillmentReducer,
  type CheckoutFulfillmentState,
} from "@/lib/checkout-fulfillment-state";

const SELECTION = { formattedAddress: "12 Market Road, Test City", lat: 25.96, lon: 83.27 };
const PREVIEW = { deliveryFeeInPaise: 5000, routeDistanceMeters: 4000 };

function localDeliveryStateWithSelection(): CheckoutFulfillmentState {
  return {
    fulfillmentType: "LOCAL_DELIVERY",
    destination: SELECTION,
    deliveryPreview: PREVIEW,
  };
}

describe("checkoutFulfillmentReducer — fulfillment switching (Phase 3.3 Part 3 audit)", () => {
  it("clears destination and deliveryPreview when switching Local Delivery -> Store Pickup", () => {
    const next = checkoutFulfillmentReducer(localDeliveryStateWithSelection(), {
      type: "SET_FULFILLMENT_TYPE",
      fulfillmentType: "STORE_PICKUP",
    });
    expect(next).toEqual({
      fulfillmentType: "STORE_PICKUP",
      destination: null,
      deliveryPreview: null,
    });
  });

  it("does not resurrect a stale selection when switching back to Local Delivery", () => {
    // Local Delivery (selected) -> Store Pickup -> Local Delivery again.
    // The customer must be required to select a fresh location — a stale
    // destination/preview from before the round trip must never silently
    // reappear and let submission carry the OLD coordinates/fee.
    const afterSwitchAway = checkoutFulfillmentReducer(localDeliveryStateWithSelection(), {
      type: "SET_FULFILLMENT_TYPE",
      fulfillmentType: "STORE_PICKUP",
    });
    const afterSwitchBack = checkoutFulfillmentReducer(afterSwitchAway, {
      type: "SET_FULFILLMENT_TYPE",
      fulfillmentType: "LOCAL_DELIVERY",
    });
    expect(afterSwitchBack.destination).toBeNull();
    expect(afterSwitchBack.deliveryPreview).toBeNull();
  });

  it("switching to the already-active fulfillment type is a no-op (preserves in-flight selection)", () => {
    const state = localDeliveryStateWithSelection();
    const next = checkoutFulfillmentReducer(state, {
      type: "SET_FULFILLMENT_TYPE",
      fulfillmentType: "LOCAL_DELIVERY",
    });
    expect(next).toBe(state); // same reference — no reset triggered
  });

  it("SET_DESTINATION updates only the destination, leaving fulfillmentType untouched", () => {
    const state: CheckoutFulfillmentState = {
      fulfillmentType: "LOCAL_DELIVERY",
      destination: null,
      deliveryPreview: null,
    };
    const next = checkoutFulfillmentReducer(state, { type: "SET_DESTINATION", destination: SELECTION });
    expect(next.destination).toEqual(SELECTION);
    expect(next.fulfillmentType).toBe("LOCAL_DELIVERY");
    expect(next.deliveryPreview).toBeNull();
  });

  it("SET_DELIVERY_PREVIEW updates only the preview", () => {
    const state: CheckoutFulfillmentState = {
      fulfillmentType: "LOCAL_DELIVERY",
      destination: SELECTION,
      deliveryPreview: null,
    };
    const next = checkoutFulfillmentReducer(state, {
      type: "SET_DELIVERY_PREVIEW",
      deliveryPreview: PREVIEW,
    });
    expect(next.deliveryPreview).toEqual(PREVIEW);
    expect(next.destination).toEqual(SELECTION);
  });

  it("clearing the destination (e.g. address text edited after selection) also clears the preview independently when dispatched", () => {
    // The component dispatches both actions when DeliveryAddressSearch
    // reports an invalidated selection — verify each action's effect in
    // isolation composes correctly in sequence.
    let state = localDeliveryStateWithSelection();
    state = checkoutFulfillmentReducer(state, { type: "SET_DESTINATION", destination: null });
    state = checkoutFulfillmentReducer(state, { type: "SET_DELIVERY_PREVIEW", deliveryPreview: null });
    expect(state).toEqual({ fulfillmentType: "LOCAL_DELIVERY", destination: null, deliveryPreview: null });
  });
});
