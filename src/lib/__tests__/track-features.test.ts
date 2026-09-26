import { describe, expect, it } from "vitest";
import { customerOrderStatus, customerOrderSteps, orderItemsSummary } from "@/lib/customer-portal/order-status-copy";
import { checkCustomerCanCancel } from "@/lib/order-lifecycle";
import { buildUpiPayLink, isValidUpiId } from "@/lib/upi";

describe("checkCustomerCanCancel", () => {
  const base = { fulfillmentType: "LOCAL_DELIVERY" as const, paymentStatus: "UNPAID" as const };
  it("allows every step before the order leaves the shop", () => {
    for (const status of ["PENDING", "CONFIRMED", "PREPARING"] as const) {
      expect(checkCustomerCanCancel({ ...base, status }).allowed).toBe(true);
    }
    expect(checkCustomerCanCancel({ status: "READY_FOR_PICKUP", fulfillmentType: "STORE_PICKUP", paymentStatus: "UNPAID" }).allowed).toBe(true);
  });
  it("refuses once out for delivery, finished, paid, or a counter sale — with a reason", () => {
    const cases = [
      { ...base, status: "OUT_FOR_DELIVERY" as const },
      { ...base, status: "DELIVERED" as const },
      { ...base, status: "CANCELLED" as const },
      { ...base, status: "PENDING" as const, paymentStatus: "PAID" as const },
      { status: "DELIVERED" as const, fulfillmentType: "COUNTER_HANDOVER" as const, paymentStatus: "PAID" as const },
    ];
    for (const c of cases) {
      const result = checkCustomerCanCancel(c);
      expect(result.allowed).toBe(false);
      if (!result.allowed) expect(result.reason.length).toBeGreaterThan(10);
    }
  });
});

describe("buildUpiPayLink", () => {
  it("builds a standard upi://pay link with amount in rupees and encoded names", () => {
    const link = buildUpiPayLink({ upiId: "8542843482@ybl", payeeName: "Muskan General Store", amountInPaise: 11470, note: "Khata Asha" });
    expect(link).toBe("upi://pay?pa=8542843482%40ybl&pn=Muskan%20General%20Store&am=114.70&cu=INR&tn=Khata%20Asha");
  });
  it("validates UPI IDs", () => {
    expect(isValidUpiId("8542843482@ybl")).toBe(true);
    expect(isValidUpiId("shop.name-1@okaxis")).toBe(true);
    expect(isValidUpiId("not an id")).toBe(false);
    expect(isValidUpiId("@ybl")).toBe(false);
  });
});

describe("customer order wording", () => {
  const order = {
    status: "PREPARING" as const,
    fulfillmentType: "STORE_PICKUP" as const,
    paymentStatus: "UNPAID" as const,
    createdAt: new Date("2026-09-25T05:00:00Z"),
    deliveredAt: null,
    cancelledAt: null,
    cancelledBy: null,
    cancelReason: null,
  };
  it("says where the order is in plain words", () => {
    expect(customerOrderStatus(order).title).toBe("Packing your order");
    expect(customerOrderStatus({ ...order, status: "OUT_FOR_DELIVERY", fulfillmentType: "LOCAL_DELIVERY" }).detail).toMatch(/cash or UPI/);
    expect(
      customerOrderStatus({ ...order, status: "CANCELLED", cancelledBy: "CUSTOMER", cancelReason: "Ordered by mistake", cancelledAt: new Date("2026-09-25T06:00:00Z") })
        .detail,
    ).toBe("You cancelled this order on 25 Sept · Ordered by mistake.");
  });
  it("marks steps done / current / to do", () => {
    const steps = customerOrderSteps("STORE_PICKUP", "PREPARING");
    expect(steps.map((s) => s.state)).toEqual(["done", "done", "current", "todo", "todo"]);
    expect(steps.map((s) => s.label)).toEqual(["Placed", "Accepted", "Packing", "Ready", "Collected"]);
    expect(customerOrderSteps("LOCAL_DELIVERY", "DELIVERED").every((s) => s.state === "done")).toBe(true);
  });
  it("summarises items", () => {
    expect(orderItemsSummary([{ productName: "Atta" }, { productName: "Salt" }, { productName: "Oil" }])).toBe("Atta, Salt +1 more");
  });
});
