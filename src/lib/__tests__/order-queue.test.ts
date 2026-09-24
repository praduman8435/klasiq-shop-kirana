import { describe, expect, it } from "vitest";
import { countForTab, customerStatusMessage, nextStep, nextStepLabel, paymentSummary, simpleStatusLabel } from "@/lib/order-queue";

describe("order work queue", () => {
  it("walks a pickup order forward one step at a time", () => {
    const steps: string[] = [];
    let status = "PENDING" as Parameters<typeof nextStep>[0];
    for (let i = 0; i < 6; i++) {
      const to = nextStep(status, "STORE_PICKUP");
      if (!to) break;
      steps.push(nextStepLabel(to, "STORE_PICKUP"));
      status = to;
    }
    expect(steps).toEqual(["Accept order", "Start packing", "Ready for pickup", "Customer collected"]);
    expect(simpleStatusLabel(status, "STORE_PICKUP")).toBe("Collected");
  });

  it("uses delivery wording for delivery orders and has no step once done", () => {
    expect(nextStep("PREPARING", "LOCAL_DELIVERY")).toBe("OUT_FOR_DELIVERY");
    expect(nextStepLabel("OUT_FOR_DELIVERY", "LOCAL_DELIVERY")).toBe("Send for delivery");
    expect(nextStep("DELIVERED", "LOCAL_DELIVERY")).toBeNull();
    expect(nextStep("CANCELLED", "STORE_PICKUP")).toBeNull();
  });

  it("counts tabs from per-status counts", () => {
    const counts = { PENDING: 2, PREPARING: 1, DELIVERED: 5, CANCELLED: 1 };
    expect(countForTab("TODO", counts)).toBe(3);
    expect(countForTab("NEW", counts)).toBe(2);
    expect(countForTab("ALL", counts)).toBe(9);
  });

  it("describes payment the way the shop says it", () => {
    const base = { totalInPaise: 31000, outstandingInPaise: 0, status: "PENDING" as const };
    expect(paymentSummary({ ...base, source: "COUNTER", fulfillmentType: "COUNTER_HANDOVER", paymentStatus: "PARTIALLY_PAID", outstandingInPaise: 31000 }).label).toBe("₹310 on khata");
    expect(paymentSummary({ ...base, source: "ONLINE", fulfillmentType: "LOCAL_DELIVERY", paymentStatus: "UNPAID" }).label).toBe("Collect cash on delivery");
    expect(paymentSummary({ ...base, source: "ONLINE", fulfillmentType: "STORE_PICKUP", paymentStatus: "PAID" })).toEqual({ label: "Paid", tone: "paid" });
    expect(paymentSummary({ ...base, status: "DELIVERED", source: "ONLINE", fulfillmentType: "STORE_PICKUP", paymentStatus: "UNPAID" }).label).toBe("Not marked paid");
  });

  it("writes a Hinglish WhatsApp update for the customer", () => {
    const text = customerStatusMessage({
      shopName: "Muskan General Store",
      customerName: "Sunita",
      orderNumber: "ORD-1",
      totalInPaise: 13500,
      status: "READY_FOR_PICKUP",
      fulfillmentType: "STORE_PICKUP",
    });
    expect(text).toContain("Namaste Sunita ji,");
    expect(text).toContain("aapka order ORD-1 (₹135) Muskan General Store par pickup ke liye taiyaar hai.");
  });
});
