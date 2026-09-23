import { formatPaise } from "@/lib/money";
import type { FulfillmentType, PaymentMethod } from "@prisma/client";

export type OrderMessageItem = {
  productName: string;
  size: string;
  quantity: number;
  lineTotalInPaise: number;
};

export type OrderMessageData = {
  orderNumber: string;
  customerName: string;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  items: OrderMessageItem[];
  subtotalInPaise: number;
  deliveryFeeInPaise: number;
  totalInPaise: number;
};

export function getFulfillmentLabel(fulfillmentType: FulfillmentType): string {
  switch (fulfillmentType) {
    case "STORE_PICKUP":
      return "Store Pickup";
    case "LOCAL_DELIVERY":
      return "Local Delivery";
    case "COUNTER_HANDOVER":
      return "Counter Sale";
  }
}

export function getPaymentMethodLabel(params: {
  paymentMethod: PaymentMethod;
  fulfillmentType: FulfillmentType;
}): string {
  switch (params.paymentMethod) {
    case "UPI":
      return "UPI";
    case "CASH":
      return "Cash";
    case "CARD":
      return "Card";
    case "CASH_ON_DELIVERY":
      return params.fulfillmentType === "STORE_PICKUP" ? "Pay at Store" : "Cash on Delivery";
  }
}

/**
 * Plain-text order summary, formatted to read well inside a WhatsApp
 * message. No WhatsApp/messaging integration exists yet (out of scope for
 * Phase 2) — this is purely a data→text formatter so that integration is a
 * matter of calling this function and sending its output, not inventing a
 * message format under time pressure later.
 */
export function buildOrderConfirmationMessage(order: OrderMessageData): string {
  const lines: string[] = [];

  lines.push(`Hi ${order.customerName}, your order ${order.orderNumber} has been received!`);
  lines.push("");
  lines.push("Items:");
  for (const item of order.items) {
    lines.push(
      `- ${item.productName} (${item.size}) x${item.quantity} — ${formatPaise(item.lineTotalInPaise)}`,
    );
  }
  lines.push("");
  lines.push(`Subtotal: ${formatPaise(order.subtotalInPaise)}`);
  if (order.deliveryFeeInPaise > 0) {
    lines.push(`Delivery: ${formatPaise(order.deliveryFeeInPaise)}`);
  }
  lines.push(`Total: ${formatPaise(order.totalInPaise)}`);
  lines.push("");
  lines.push(`Fulfillment: ${getFulfillmentLabel(order.fulfillmentType)}`);
  lines.push(
    `Payment: ${getPaymentMethodLabel({
      paymentMethod: order.paymentMethod,
      fulfillmentType: order.fulfillmentType,
    })}`,
  );
  lines.push("");
  lines.push("Thank you for shopping with us!");

  return lines.join("\n");
}
