import { describe, expect, it } from "vitest";
import { calculateDeliveryFee } from "@/lib/fulfillment-config";

describe("calculateDeliveryFee", () => {
  // Matches the real defaults (see fulfillment-config.ts) so these tests
  // exercise the actual agreed policy, not arbitrary numbers.
  const base = {
    deliveryFeeInPaise: 5000, // ₹50
    freeDeliveryThresholdInPaise: 150000, // ₹1,500
    freeDeliveryRadiusMeters: 3000, // 3km
  };

  it("is always 0 for Store Pickup, regardless of subtotal or distance", () => {
    expect(calculateDeliveryFee({ fulfillmentType: "STORE_PICKUP" })).toBe(0);
  });

  it("is free at 2km (within the free radius), even with a low subtotal", () => {
    expect(
      calculateDeliveryFee({
        ...base,
        fulfillmentType: "LOCAL_DELIVERY",
        routeDistanceMeters: 2000,
        subtotalInPaise: 50000,
      }),
    ).toBe(0);
  });

  it("is free at exactly the 3km boundary (inclusive)", () => {
    expect(
      calculateDeliveryFee({
        ...base,
        fulfillmentType: "LOCAL_DELIVERY",
        routeDistanceMeters: 3000,
        subtotalInPaise: 50000,
      }),
    ).toBe(0);
  });

  it("charges the flat fee just past the 3km boundary, below the free threshold", () => {
    expect(
      calculateDeliveryFee({
        ...base,
        fulfillmentType: "LOCAL_DELIVERY",
        routeDistanceMeters: 3001,
        subtotalInPaise: 50000,
      }),
    ).toBe(5000);
  });

  it("distinguishes 2999m/3000m/3001m precisely, no floating-point drift", () => {
    const paramsAt = (routeDistanceMeters: number) => ({
      ...base,
      fulfillmentType: "LOCAL_DELIVERY" as const,
      routeDistanceMeters,
      subtotalInPaise: 50000,
    });
    expect(calculateDeliveryFee(paramsAt(2999))).toBe(0);
    expect(calculateDeliveryFee(paramsAt(3000))).toBe(0);
    expect(calculateDeliveryFee(paramsAt(3001))).toBe(5000);
  });

  it("charges the fee beyond 3km when the subtotal is just below ₹1,500", () => {
    expect(
      calculateDeliveryFee({
        ...base,
        fulfillmentType: "LOCAL_DELIVERY",
        routeDistanceMeters: 5000,
        subtotalInPaise: 149999,
      }),
    ).toBe(5000);
  });

  it("is free beyond 3km once the subtotal reaches exactly ₹1,500", () => {
    expect(
      calculateDeliveryFee({
        ...base,
        fulfillmentType: "LOCAL_DELIVERY",
        routeDistanceMeters: 5000,
        subtotalInPaise: 150000,
      }),
    ).toBe(0);
  });

  it("is free far beyond 3km with a subtotal well over the threshold", () => {
    expect(
      calculateDeliveryFee({
        ...base,
        fulfillmentType: "LOCAL_DELIVERY",
        routeDistanceMeters: 10000,
        subtotalInPaise: 500000,
      }),
    ).toBe(0);
  });
});
