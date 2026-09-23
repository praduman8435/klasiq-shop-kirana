import { describe, expect, it } from "vitest";
import {
  buildOrderConfirmationMessage,
  getFulfillmentLabel,
  getPaymentMethodLabel,
} from "@/lib/order-message";

describe("getFulfillmentLabel", () => {
  it("labels pickup and delivery distinctly", () => {
    expect(getFulfillmentLabel("STORE_PICKUP")).toBe("Store Pickup");
    expect(getFulfillmentLabel("LOCAL_DELIVERY")).toBe("Local Delivery");
  });

  it("labels a counter handover as 'Counter Sale' (Phase 3.2)", () => {
    expect(getFulfillmentLabel("COUNTER_HANDOVER")).toBe("Counter Sale");
  });
});

describe("getPaymentMethodLabel", () => {
  it("labels COD as 'Pay at Store' for pickup", () => {
    expect(
      getPaymentMethodLabel({ paymentMethod: "CASH_ON_DELIVERY", fulfillmentType: "STORE_PICKUP" }),
    ).toBe("Pay at Store");
  });

  it("labels COD as 'Cash on Delivery' for delivery", () => {
    expect(
      getPaymentMethodLabel({ paymentMethod: "CASH_ON_DELIVERY", fulfillmentType: "LOCAL_DELIVERY" }),
    ).toBe("Cash on Delivery");
  });

  it("labels CASH and CARD regardless of fulfillment type (Phase 3.2)", () => {
    expect(
      getPaymentMethodLabel({ paymentMethod: "CASH", fulfillmentType: "COUNTER_HANDOVER" }),
    ).toBe("Cash");
    expect(
      getPaymentMethodLabel({ paymentMethod: "CARD", fulfillmentType: "COUNTER_HANDOVER" }),
    ).toBe("Card");
  });

  it("labels UPI the same regardless of fulfillment type", () => {
    expect(
      getPaymentMethodLabel({ paymentMethod: "UPI", fulfillmentType: "COUNTER_HANDOVER" }),
    ).toBe("UPI");
  });
});

describe("buildOrderConfirmationMessage", () => {
  const order = {
    orderNumber: "ORD-20260804-K7M3P",
    customerName: "Asha",
    fulfillmentType: "STORE_PICKUP" as const,
    paymentMethod: "CASH_ON_DELIVERY" as const,
    items: [
      { productName: "White Shirt", size: "28", quantity: 2, lineTotalInPaise: 70000 },
    ],
    subtotalInPaise: 70000,
    deliveryFeeInPaise: 0,
    totalInPaise: 70000,
  };

  it("includes the order number, customer name, and items", () => {
    const message = buildOrderConfirmationMessage(order);
    expect(message).toContain("ORD-20260804-K7M3P");
    expect(message).toContain("Asha");
    expect(message).toContain("White Shirt");
    expect(message).toContain("x2");
  });

  it("omits the delivery line when there is no delivery fee", () => {
    const message = buildOrderConfirmationMessage(order);
    expect(message).not.toContain("Delivery:");
  });

  it("includes the delivery line when a delivery fee applies", () => {
    const message = buildOrderConfirmationMessage({
      ...order,
      fulfillmentType: "LOCAL_DELIVERY",
      deliveryFeeInPaise: 4000,
      totalInPaise: 74000,
    });
    expect(message).toContain("Delivery: ₹40");
  });
});
