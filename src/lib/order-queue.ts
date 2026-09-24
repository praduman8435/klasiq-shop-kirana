import type { FulfillmentType, OrderSource, OrderStatus, PaymentStatus } from "@prisma/client";
import { formatPaise } from "@/lib/money";
import { nextValidOrderStatuses } from "@/lib/order-lifecycle";

/** The Orders list as a work queue: what needs doing first. */
export const ORDER_TABS = ["TODO", "NEW", "PACKING", "READY", "DONE", "CANCELLED", "ALL"] as const;
export type OrderTab = (typeof ORDER_TABS)[number];

export const ORDER_TAB_STATUSES: Record<OrderTab, OrderStatus[] | null> = {
  TODO: ["PENDING", "CONFIRMED", "PREPARING", "READY_FOR_PICKUP", "OUT_FOR_DELIVERY"],
  NEW: ["PENDING"],
  PACKING: ["CONFIRMED", "PREPARING"],
  READY: ["READY_FOR_PICKUP", "OUT_FOR_DELIVERY"],
  DONE: ["DELIVERED"],
  CANCELLED: ["CANCELLED"],
  ALL: null,
};

export const ORDER_TAB_LABEL: Record<OrderTab, string> = {
  TODO: "Needs action",
  NEW: "New",
  PACKING: "Packing",
  READY: "Ready / on the way",
  DONE: "Done",
  CANCELLED: "Cancelled",
  ALL: "All",
};

export function countForTab(tab: OrderTab, counts: Partial<Record<OrderStatus, number>>): number {
  const statuses = ORDER_TAB_STATUSES[tab];
  const all = Object.values(counts).reduce((s, n) => s + (n ?? 0), 0);
  return statuses ? statuses.reduce((s, st) => s + (counts[st] ?? 0), 0) : all;
}

/** Plain status words for the shop floor. */
export function simpleStatusLabel(status: OrderStatus, fulfillmentType: FulfillmentType): string {
  switch (status) {
    case "PENDING":
      return "New";
    case "CONFIRMED":
      return "Accepted";
    case "PREPARING":
      return "Packing";
    case "READY_FOR_PICKUP":
      return "Ready for pickup";
    case "OUT_FOR_DELIVERY":
      return "On the way";
    case "DELIVERED":
      return fulfillmentType === "STORE_PICKUP" ? "Collected" : fulfillmentType === "COUNTER_HANDOVER" ? "Sold" : "Delivered";
    case "CANCELLED":
      return "Cancelled";
  }
}

/** The one forward step from here (never cancel or reopen), if any. */
export function nextStep(status: OrderStatus, fulfillmentType: FulfillmentType): OrderStatus | null {
  return (
    nextValidOrderStatuses({ from: status, fulfillmentType }).find((s) => s !== "CANCELLED" && s !== "PENDING") ?? null
  );
}

/** Button text for moving INTO `to`. */
export function nextStepLabel(to: OrderStatus, fulfillmentType: FulfillmentType): string {
  switch (to) {
    case "CONFIRMED":
      return "Accept order";
    case "PREPARING":
      return "Start packing";
    case "READY_FOR_PICKUP":
      return "Ready for pickup";
    case "OUT_FOR_DELIVERY":
      return "Send for delivery";
    case "DELIVERED":
      return fulfillmentType === "STORE_PICKUP" ? "Customer collected" : "Mark delivered";
    default:
      return simpleStatusLabel(to, fulfillmentType);
  }
}

/** Payment in the shop's words: paid, on khata, or to collect. */
export function paymentSummary(order: {
  source: OrderSource;
  fulfillmentType: FulfillmentType;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  totalInPaise: number;
  outstandingInPaise: number;
}): { label: string; tone: "paid" | "due" | "muted" } {
  if (order.paymentStatus === "PAID") return { label: "Paid", tone: "paid" };
  if (order.paymentStatus === "REFUNDED") return { label: "Refunded", tone: "muted" };
  if (order.paymentStatus === "FAILED") return { label: "Payment failed", tone: "due" };
  if (order.source === "COUNTER") {
    return order.outstandingInPaise > 0
      ? { label: `${formatPaise(order.outstandingInPaise)} on khata`, tone: "due" }
      : { label: "Paid", tone: "paid" };
  }
  if (order.status === "CANCELLED") return { label: "Not paid", tone: "muted" };
  // Handed over but nobody marked the money as received yet.
  if (order.status === "DELIVERED") return { label: "Not marked paid", tone: "due" };
  return {
    label: order.fulfillmentType === "LOCAL_DELIVERY" ? "Collect cash on delivery" : "Collect at store",
    tone: "due",
  };
}

/** A ready-to-send WhatsApp message for the customer at this stage (Hinglish). */
export function customerStatusMessage(params: {
  shopName: string;
  customerName: string | null;
  orderNumber: string;
  totalInPaise: number;
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
}): string {
  const hi = params.customerName ? `Namaste ${params.customerName} ji,` : "Namaste,";
  const order = `aapka order ${params.orderNumber} (${formatPaise(params.totalInPaise)})`;
  const line = (() => {
    switch (params.status) {
      case "PENDING":
      case "CONFIRMED":
        return `${order} humein mil gaya hai. Jaldi taiyaar karte hain.`;
      case "PREPARING":
        return `${order} pack ho raha hai.`;
      case "READY_FOR_PICKUP":
        return `${order} ${params.shopName} par pickup ke liye taiyaar hai.`;
      case "OUT_FOR_DELIVERY":
        return `${order} delivery ke liye nikal gaya hai.`;
      case "DELIVERED":
        return `${order} ke liye dhanyavaad!`;
      case "CANCELLED":
        return `${order} cancel ho gaya hai. Kuch sawaal ho to call karein.`;
    }
  })();
  return [hi, line, "", `— ${params.shopName}`].join("\n");
}
