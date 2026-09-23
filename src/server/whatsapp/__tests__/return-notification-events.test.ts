import { describe, expect, it } from "vitest";
import {
  RETURN_NOTIFICATION_TEMPLATE_ENV_VAR,
  RETURN_STATUS_TRANSITION_EVENT,
  type ReturnNotificationEvent,
} from "@/server/whatsapp/return-notification-events";
import { NOTIFICATION_TEMPLATE_ENV_VAR } from "@/server/whatsapp/notification-events";

describe("RETURN_STATUS_TRANSITION_EVENT", () => {
  it("maps APPROVED to a type-specific event", () => {
    expect(RETURN_STATUS_TRANSITION_EVENT.APPROVED?.RETURN).toBe("RETURN_APPROVED");
    expect(RETURN_STATUS_TRANSITION_EVENT.APPROVED?.EXCHANGE).toBe("EXCHANGE_APPROVED");
  });

  it("maps COMPLETED to a type-specific event", () => {
    expect(RETURN_STATUS_TRANSITION_EVENT.COMPLETED?.RETURN).toBe("RETURN_COMPLETED");
    expect(RETURN_STATUS_TRANSITION_EVENT.COMPLETED?.EXCHANGE).toBe("EXCHANGE_COMPLETED");
  });

  it("has no entry for REQUESTED, REJECTED, RECEIVED, or CANCELLED — those are handled elsewhere or not at all", () => {
    expect(RETURN_STATUS_TRANSITION_EVENT.REQUESTED).toBeUndefined();
    expect(RETURN_STATUS_TRANSITION_EVENT.REJECTED).toBeUndefined();
    expect(RETURN_STATUS_TRANSITION_EVENT.RECEIVED).toBeUndefined();
    expect(RETURN_STATUS_TRANSITION_EVENT.CANCELLED).toBeUndefined();
  });
});

describe("RETURN_NOTIFICATION_TEMPLATE_ENV_VAR", () => {
  it("has exactly 7 distinct events, each with its own env var name", () => {
    const events = Object.keys(RETURN_NOTIFICATION_TEMPLATE_ENV_VAR) as ReturnNotificationEvent[];
    expect(events).toHaveLength(7);
    const envVarNames = Object.values(RETURN_NOTIFICATION_TEMPLATE_ENV_VAR);
    expect(new Set(envVarNames).size).toBe(7);
  });

  it("never reuses an Order-notification (Part 2) or OTP template env var name", () => {
    const returnVars = new Set(Object.values(RETURN_NOTIFICATION_TEMPLATE_ENV_VAR));
    const orderVars = new Set(Object.values(NOTIFICATION_TEMPLATE_ENV_VAR));
    for (const v of returnVars) {
      expect(orderVars.has(v)).toBe(false);
      expect(v).not.toBe("WHATSAPP_OTP_TEMPLATE_NAME");
    }
  });

  it("has no separate 'Exchange Ready' entry — folded into EXCHANGE_COMPLETED", () => {
    expect(Object.keys(RETURN_NOTIFICATION_TEMPLATE_ENV_VAR)).not.toContain("EXCHANGE_READY");
  });
});
