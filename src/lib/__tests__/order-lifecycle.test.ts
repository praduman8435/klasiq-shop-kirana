import { describe, expect, it } from "vitest";
import {
  isTerminalOrderStatus,
  isValidOrderStatusTransition,
  isValidPaymentStatusTransition,
  nextValidOrderStatuses,
} from "@/lib/order-lifecycle";

describe("isValidOrderStatusTransition — Store Pickup", () => {
  const fulfillmentType = "STORE_PICKUP" as const;

  it("allows the full pickup happy path", () => {
    expect(isValidOrderStatusTransition({ from: "PENDING", to: "CONFIRMED", fulfillmentType })).toBe(true);
    expect(isValidOrderStatusTransition({ from: "CONFIRMED", to: "PREPARING", fulfillmentType })).toBe(true);
    expect(isValidOrderStatusTransition({ from: "PREPARING", to: "READY_FOR_PICKUP", fulfillmentType })).toBe(true);
    expect(isValidOrderStatusTransition({ from: "READY_FOR_PICKUP", to: "DELIVERED", fulfillmentType })).toBe(true);
  });

  it("rejects OUT_FOR_DELIVERY for a pickup order", () => {
    expect(isValidOrderStatusTransition({ from: "PREPARING", to: "OUT_FOR_DELIVERY", fulfillmentType })).toBe(false);
  });

  it("allows cancellation from any non-terminal status", () => {
    expect(isValidOrderStatusTransition({ from: "PENDING", to: "CANCELLED", fulfillmentType })).toBe(true);
    expect(isValidOrderStatusTransition({ from: "PREPARING", to: "CANCELLED", fulfillmentType })).toBe(true);
  });
});

describe("isValidOrderStatusTransition — Local Delivery", () => {
  const fulfillmentType = "LOCAL_DELIVERY" as const;

  it("allows the full delivery happy path", () => {
    expect(isValidOrderStatusTransition({ from: "PENDING", to: "CONFIRMED", fulfillmentType })).toBe(true);
    expect(isValidOrderStatusTransition({ from: "CONFIRMED", to: "PREPARING", fulfillmentType })).toBe(true);
    expect(isValidOrderStatusTransition({ from: "PREPARING", to: "OUT_FOR_DELIVERY", fulfillmentType })).toBe(true);
    expect(isValidOrderStatusTransition({ from: "OUT_FOR_DELIVERY", to: "DELIVERED", fulfillmentType })).toBe(true);
  });

  it("rejects READY_FOR_PICKUP for a delivery order", () => {
    expect(isValidOrderStatusTransition({ from: "PREPARING", to: "READY_FOR_PICKUP", fulfillmentType })).toBe(false);
  });
});

describe("isValidOrderStatusTransition — invalid transitions", () => {
  it("rejects going backwards", () => {
    expect(
      isValidOrderStatusTransition({ from: "DELIVERED", to: "PREPARING", fulfillmentType: "STORE_PICKUP" }),
    ).toBe(false);
  });

  it("rejects any transition out of CANCELLED", () => {
    expect(
      isValidOrderStatusTransition({ from: "CANCELLED", to: "CONFIRMED", fulfillmentType: "STORE_PICKUP" }),
    ).toBe(false);
    expect(
      isValidOrderStatusTransition({ from: "CANCELLED", to: "PENDING", fulfillmentType: "LOCAL_DELIVERY" }),
    ).toBe(false);
  });

  it("rejects any transition out of DELIVERED", () => {
    expect(
      isValidOrderStatusTransition({ from: "DELIVERED", to: "CANCELLED", fulfillmentType: "STORE_PICKUP" }),
    ).toBe(false);
  });

  it("rejects skipping straight from PENDING to PREPARING", () => {
    expect(
      isValidOrderStatusTransition({ from: "PENDING", to: "PREPARING", fulfillmentType: "STORE_PICKUP" }),
    ).toBe(false);
  });
});

describe("nextValidOrderStatuses", () => {
  it("only offers READY_FOR_PICKUP for pickup orders", () => {
    const next = nextValidOrderStatuses({ from: "PREPARING", fulfillmentType: "STORE_PICKUP" });
    expect(next).toContain("READY_FOR_PICKUP");
    expect(next).not.toContain("OUT_FOR_DELIVERY");
  });

  it("only offers OUT_FOR_DELIVERY for delivery orders", () => {
    const next = nextValidOrderStatuses({ from: "PREPARING", fulfillmentType: "LOCAL_DELIVERY" });
    expect(next).toContain("OUT_FOR_DELIVERY");
    expect(next).not.toContain("READY_FOR_PICKUP");
  });

  it("is empty for terminal statuses", () => {
    expect(nextValidOrderStatuses({ from: "DELIVERED", fulfillmentType: "STORE_PICKUP" })).toEqual([]);
    expect(nextValidOrderStatuses({ from: "CANCELLED", fulfillmentType: "LOCAL_DELIVERY" })).toEqual([]);
  });
});

describe("isTerminalOrderStatus", () => {
  it("DELIVERED and CANCELLED are terminal", () => {
    expect(isTerminalOrderStatus("DELIVERED")).toBe(true);
    expect(isTerminalOrderStatus("CANCELLED")).toBe(true);
  });

  it("everything else is non-terminal", () => {
    expect(isTerminalOrderStatus("PENDING")).toBe(false);
    expect(isTerminalOrderStatus("PREPARING")).toBe(false);
  });
});

describe("isValidPaymentStatusTransition", () => {
  it("COD/pay-at-store orders move UNPAID -> PAID once collected", () => {
    expect(isValidPaymentStatusTransition({ from: "UNPAID", to: "PAID" })).toBe(true);
  });

  it("allows PAID -> REFUNDED", () => {
    expect(isValidPaymentStatusTransition({ from: "PAID", to: "REFUNDED" })).toBe(true);
  });

  it("rejects REFUNDED -> PAID (refund is terminal)", () => {
    expect(isValidPaymentStatusTransition({ from: "REFUNDED", to: "PAID" })).toBe(false);
  });

  it("rejects UNPAID -> REFUNDED (nothing to refund yet)", () => {
    expect(isValidPaymentStatusTransition({ from: "UNPAID", to: "REFUNDED" })).toBe(false);
  });

  it("rejects PAID -> UNPAID", () => {
    expect(isValidPaymentStatusTransition({ from: "PAID", to: "UNPAID" })).toBe(false);
  });
});
