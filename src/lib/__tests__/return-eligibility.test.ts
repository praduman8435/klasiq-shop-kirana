import { describe, expect, it } from "vitest";
import { getItemReturnEligibility, getOrderReturnEligibility } from "@/lib/return-eligibility";

const DELIVERED_AT = new Date("2026-01-01T12:00:00.000Z");
const DAY_MS = 24 * 60 * 60 * 1000;

describe("getItemReturnEligibility — delivered-only rule", () => {
  it("rejects when the order was never delivered (deliveredAt null)", () => {
    const result = getItemReturnEligibility({
      deliveredAt: null,
      purchasedQuantity: 5,
      claimedQuantity: 0,
      requestedQuantity: 1,
      now: new Date("2026-01-02T00:00:00.000Z"),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.error.type).toBe("ORDER_NOT_DELIVERED");
  });
});

describe("getItemReturnEligibility — 7-day return window", () => {
  it("allows a return on day 6 after delivery", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 0,
      requestedQuantity: 1,
      now: new Date(DELIVERED_AT.getTime() + 6 * DAY_MS),
    });
    expect(result.eligible).toBe(true);
  });

  it("allows a return exactly on day 7 after delivery (inclusive boundary)", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 0,
      requestedQuantity: 1,
      now: new Date(DELIVERED_AT.getTime() + 7 * DAY_MS),
    });
    expect(result.eligible).toBe(true);
  });

  it("rejects a return on day 8 after delivery", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 0,
      requestedQuantity: 1,
      now: new Date(DELIVERED_AT.getTime() + 8 * DAY_MS),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.error.type).toBe("RETURN_WINDOW_EXPIRED");
  });

  it("rejects a return one millisecond past the exact 7-day boundary", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 0,
      requestedQuantity: 1,
      now: new Date(DELIVERED_AT.getTime() + 7 * DAY_MS + 1),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.error.type).toBe("RETURN_WINDOW_EXPIRED");
  });
});

describe("getItemReturnEligibility — quantity math", () => {
  it("allows a partial return within the remaining quantity", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 2,
      requestedQuantity: 3,
      now: DELIVERED_AT,
    });
    expect(result.eligible).toBe(true);
    if (result.eligible) expect(result.returnableQuantity).toBe(3);
  });

  it("rejects a request exceeding the remaining quantity", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 2,
      requestedQuantity: 4,
      now: DELIVERED_AT,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) {
      expect(result.error.type).toBe("INSUFFICIENT_QUANTITY");
      if (result.error.type === "INSUFFICIENT_QUANTITY") {
        expect(result.error.returnableQuantity).toBe(3);
      }
    }
  });

  it("rejects when nothing is left to return (fully claimed already)", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 5,
      requestedQuantity: 1,
      now: DELIVERED_AT,
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible && result.error.type === "INSUFFICIENT_QUANTITY") {
      expect(result.error.returnableQuantity).toBe(0);
    }
  });

  it("allows returning exactly the full remaining quantity", () => {
    const result = getItemReturnEligibility({
      deliveredAt: DELIVERED_AT,
      purchasedQuantity: 5,
      claimedQuantity: 0,
      requestedQuantity: 5,
      now: DELIVERED_AT,
    });
    expect(result.eligible).toBe(true);
  });
});

describe("getOrderReturnEligibility", () => {
  it("mirrors the item-level order gate without needing item quantities", () => {
    const eligible = getOrderReturnEligibility({
      orderStatus: "DELIVERED",
      deliveredAt: DELIVERED_AT,
      now: new Date(DELIVERED_AT.getTime() + DAY_MS),
    });
    expect(eligible.eligible).toBe(true);
  });

  it("rejects when never delivered", () => {
    const result = getOrderReturnEligibility({
      orderStatus: "PENDING",
      deliveredAt: null,
      now: new Date(),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.error.type).toBe("ORDER_NOT_DELIVERED");
  });

  it("rejects when the window has passed", () => {
    const result = getOrderReturnEligibility({
      orderStatus: "DELIVERED",
      deliveredAt: DELIVERED_AT,
      now: new Date(DELIVERED_AT.getTime() + 10 * DAY_MS),
    });
    expect(result.eligible).toBe(false);
    if (!result.eligible) expect(result.error.type).toBe("RETURN_WINDOW_EXPIRED");
  });
});
