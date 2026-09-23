import { describe, expect, it } from "vitest";
import { getOrderTracking } from "@/lib/order-tracking";

describe("getOrderTracking — Store Pickup", () => {
  it("marks every stage before the current one completed, the current one current, and the rest future", () => {
    const result = getOrderTracking("STORE_PICKUP", "PREPARING");
    expect(result.kind).toBe("stages");
    if (result.kind !== "stages") return;

    expect(result.stages.map((s) => [s.status, s.state])).toEqual([
      ["PENDING", "completed"],
      ["CONFIRMED", "completed"],
      ["PREPARING", "current"],
      ["READY_FOR_PICKUP", "future"],
      ["DELIVERED", "future"],
    ]);
  });

  it("never includes OUT_FOR_DELIVERY — that stage doesn't apply to Store Pickup", () => {
    const result = getOrderTracking("STORE_PICKUP", "PENDING");
    expect(result.kind).toBe("stages");
    if (result.kind !== "stages") return;
    expect(result.stages.some((s) => s.status === "OUT_FOR_DELIVERY")).toBe(false);
  });

  it("labels the final DELIVERED stage 'Collected', not 'Delivered'", () => {
    const result = getOrderTracking("STORE_PICKUP", "DELIVERED");
    expect(result.kind).toBe("stages");
    if (result.kind !== "stages") return;
    const final = result.stages.at(-1)!;
    expect(final.status).toBe("DELIVERED");
    expect(final.label).toBe("Collected");
    expect(final.state).toBe("current");
  });

  it("marks everything completed once at the final stage", () => {
    const result = getOrderTracking("STORE_PICKUP", "DELIVERED");
    expect(result.kind).toBe("stages");
    if (result.kind !== "stages") return;
    expect(result.stages.slice(0, -1).every((s) => s.state === "completed")).toBe(true);
  });
});

describe("getOrderTracking — Local Delivery", () => {
  it("includes OUT_FOR_DELIVERY as its own stage, not READY_FOR_PICKUP", () => {
    const result = getOrderTracking("LOCAL_DELIVERY", "OUT_FOR_DELIVERY");
    expect(result.kind).toBe("stages");
    if (result.kind !== "stages") return;

    expect(result.stages.map((s) => s.status)).toEqual([
      "PENDING",
      "CONFIRMED",
      "PREPARING",
      "OUT_FOR_DELIVERY",
      "DELIVERED",
    ]);
    expect(result.stages.some((s) => s.status === "READY_FOR_PICKUP")).toBe(false);
    const current = result.stages.find((s) => s.status === "OUT_FOR_DELIVERY")!;
    expect(current.state).toBe("current");
  });

  it("uses the plain 'Delivered' label (not 'Collected') for its final stage", () => {
    const result = getOrderTracking("LOCAL_DELIVERY", "PENDING");
    expect(result.kind).toBe("stages");
    if (result.kind !== "stages") return;
    expect(result.stages.at(-1)!.label).toBe("Delivered");
  });

  it("marks the earliest stage current and everything else future at PENDING", () => {
    const result = getOrderTracking("LOCAL_DELIVERY", "PENDING");
    expect(result.kind).toBe("stages");
    if (result.kind !== "stages") return;
    expect(result.stages[0]!.state).toBe("current");
    expect(result.stages.slice(1).every((s) => s.state === "future")).toBe(true);
  });
});

describe("getOrderTracking — Cancelled", () => {
  it("shows a cancelled state regardless of fulfillment type, never future stages as if they might still happen", () => {
    for (const fulfillmentType of ["STORE_PICKUP", "LOCAL_DELIVERY", "COUNTER_HANDOVER"] as const) {
      const result = getOrderTracking(fulfillmentType, "CANCELLED");
      expect(result.kind).toBe("cancelled");
    }
  });
});

describe("getOrderTracking — Counter Handover", () => {
  it("shows a simple completed state, never a fabricated multi-step delivery journey", () => {
    const result = getOrderTracking("COUNTER_HANDOVER", "DELIVERED");
    expect(result.kind).toBe("counterCompleted");
  });

  it("cancelled still takes precedence over the counter-completed shortcut", () => {
    // Not reachable in practice today (DELIVERED is terminal in
    // src/lib/order-lifecycle.ts's transition table, so a real Counter
    // order's status is always DELIVERED) — tested anyway as a defensive
    // guarantee: CANCELLED must never be masked by fulfillment-type
    // special-casing.
    const result = getOrderTracking("COUNTER_HANDOVER", "CANCELLED");
    expect(result.kind).toBe("cancelled");
  });
});
