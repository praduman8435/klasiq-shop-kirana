import type { FulfillmentType, OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABEL } from "@/lib/order-lifecycle";

export type TrackingStageState = "completed" | "current" | "future";

export type TrackingStage = {
  status: OrderStatus;
  label: string;
  state: TrackingStageState;
};

export type OrderTrackingResult =
  | { kind: "cancelled" }
  /** Counter Handover orders are created already DELIVERED+PAID (an
   * instant, in-person handover — see counter-sale.ts) and, per the
   * lifecycle table in src/lib/order-lifecycle.ts, DELIVERED has no valid
   * outgoing transitions, so a Counter order's status is never anything
   * else in practice. A multi-stage delivery journey would be fictional
   * for this fulfillment path — this is a single, honest "already done"
   * state instead. */
  | { kind: "counterCompleted" }
  | { kind: "stages"; stages: TrackingStage[] };

/**
 * Fulfillment-specific stage sequences. Both use the SAME real
 * `OrderStatus` values and the SAME centralized labels
 * (`ORDER_STATUS_LABEL`, src/lib/order-lifecycle.ts) — this is a
 * presentation-only reshaping of the existing authoritative lifecycle,
 * never a second status system. Deliberately excludes any stage that
 * isn't a genuinely reachable status for that fulfillment type (a Store
 * Pickup order is never OUT_FOR_DELIVERY; see
 * `FULFILLMENT_ONLY_STATUS`/`isValidOrderStatusTransition` in
 * order-lifecycle.ts, which this respects rather than duplicates).
 */
const STORE_PICKUP_SEQUENCE: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "DELIVERED",
];

const LOCAL_DELIVERY_SEQUENCE: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
];

// "Collected" reads more honestly than "Delivered" for a pickup order the
// customer walked in and took themselves — the only label override this
// module makes; every other stage reuses ORDER_STATUS_LABEL verbatim.
const STORE_PICKUP_FINAL_LABEL = "Collected";

/**
 * Derives a customer-facing tracking view from the CURRENT authoritative
 * `Order.status` — never fabricates historical transition timestamps,
 * since no status-event history is persisted anywhere in this schema
 * (see docs/PHASE_3_4_REPORT.md Part 2 "Tracking data model audit"). A
 * stage is "completed" if it comes before the current status in this
 * fulfillment type's sequence, "current" if it matches, "future"
 * otherwise — a pure function of two already-authoritative database
 * columns, nothing invented.
 */
export function getOrderTracking(
  fulfillmentType: FulfillmentType,
  status: OrderStatus,
): OrderTrackingResult {
  if (status === "CANCELLED") return { kind: "cancelled" };
  if (fulfillmentType === "COUNTER_HANDOVER") return { kind: "counterCompleted" };

  const sequence = fulfillmentType === "STORE_PICKUP" ? STORE_PICKUP_SEQUENCE : LOCAL_DELIVERY_SEQUENCE;
  const currentIndex = sequence.indexOf(status);

  const stages: TrackingStage[] = sequence.map((stageStatus, index) => {
    const label =
      fulfillmentType === "STORE_PICKUP" && stageStatus === "DELIVERED"
        ? STORE_PICKUP_FINAL_LABEL
        : ORDER_STATUS_LABEL[stageStatus];

    // currentIndex === -1 would mean this order's status isn't part of
    // its own fulfillment type's valid sequence at all — prevented by
    // isValidOrderStatusTransition's fulfillment-aware rule being
    // enforced on every real write (src/server/commerce/update-order-
    // status.ts). Defensively treated as "current" only, matching
    // neither completed nor future, rather than crashing or guessing.
    const state: TrackingStageState =
      currentIndex === -1
        ? index === 0
          ? "current"
          : "future"
        : index < currentIndex
          ? "completed"
          : index === currentIndex
            ? "current"
            : "future";

    return { status: stageStatus, label, state };
  });

  return { kind: "stages", stages };
}
