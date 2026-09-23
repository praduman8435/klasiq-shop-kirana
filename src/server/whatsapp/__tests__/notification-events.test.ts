import { describe, expect, it } from "vitest";
import type { OrderStatus } from "@prisma/client";
import { NOTIFICATION_TEMPLATE_ENV_VAR, STATUS_TRANSITION_EVENT } from "@/server/whatsapp/notification-events";

const ALL_STATUSES: OrderStatus[] = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
];

describe("STATUS_TRANSITION_EVENT", () => {
  it("maps exactly the four lifecycle-transition events section 4 lists", () => {
    expect(STATUS_TRANSITION_EVENT.CONFIRMED).toBe("ORDER_CONFIRMED");
    expect(STATUS_TRANSITION_EVENT.PREPARING).toBe("PREPARING");
    expect(STATUS_TRANSITION_EVENT.READY_FOR_PICKUP).toBe("READY_FOR_PICKUP");
    expect(STATUS_TRANSITION_EVENT.DELIVERED).toBe("DELIVERED");
  });

  it("has no entry for PENDING, OUT_FOR_DELIVERY, or CANCELLED — never notifies for them", () => {
    expect(STATUS_TRANSITION_EVENT.PENDING).toBeUndefined();
    expect(STATUS_TRANSITION_EVENT.OUT_FOR_DELIVERY).toBeUndefined();
    expect(STATUS_TRANSITION_EVENT.CANCELLED).toBeUndefined();
  });

  it("has an entry for exactly four of the seven statuses", () => {
    const mapped = ALL_STATUSES.filter((status) => STATUS_TRANSITION_EVENT[status] !== undefined);
    expect(mapped).toHaveLength(4);
  });
});

describe("NOTIFICATION_TEMPLATE_ENV_VAR", () => {
  it("has a distinct env var name for every one of the five events — never shared, never overloaded", () => {
    const values = Object.values(NOTIFICATION_TEMPLATE_ENV_VAR);
    expect(values).toHaveLength(5);
    expect(new Set(values).size).toBe(5); // all unique
    for (const value of values) {
      expect(value).toMatch(/^WHATSAPP_ORDER_.*_TEMPLATE_NAME$/);
      // Never the OTP template's own env var.
      expect(value).not.toBe("WHATSAPP_OTP_TEMPLATE_NAME");
    }
  });
});
