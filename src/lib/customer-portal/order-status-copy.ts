import type { FulfillmentType, OrderCancelledBy, OrderStatus, PaymentStatus } from "@prisma/client";
import { BRAND } from "@/lib/constants";

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export type StatusTone = "active" | "ready" | "done" | "cancelled";

type OrderForCopy = {
  status: OrderStatus;
  fulfillmentType: FulfillmentType;
  paymentStatus: PaymentStatus;
  createdAt: Date;
  deliveredAt: Date | null;
  cancelledAt: Date | null;
  cancelledBy: OrderCancelledBy | null;
  cancelReason: string | null;
};

/**
 * What the customer reads at the top of an order: one plain-words title,
 * one line saying what happens next, and a tone for its colour. Never
 * promises a time the shop hasn't given.
 */
export function customerOrderStatus(order: OrderForCopy): { title: string; detail: string; tone: StatusTone } {
  const pickup = order.fulfillmentType === "STORE_PICKUP";
  const unpaid = order.paymentStatus !== "PAID";
  const shop = BRAND.legacyStoreNames[0] ?? BRAND.name;

  if (order.status === "CANCELLED") {
    const when = order.cancelledAt ? ` on ${DAY.format(order.cancelledAt)}` : "";
    if (order.cancelledBy === "CUSTOMER") {
      return { title: "Cancelled", detail: `You cancelled this order${when}${order.cancelReason ? ` · ${order.cancelReason}` : ""}.`, tone: "cancelled" };
    }
    return { title: "Cancelled", detail: `The shop cancelled this order${when}. Call them if you have a question.`, tone: "cancelled" };
  }
  if (order.fulfillmentType === "COUNTER_HANDOVER") {
    return { title: "Bought at the shop", detail: `Billed at the counter on ${DAY.format(order.createdAt)}.`, tone: "done" };
  }
  switch (order.status) {
    case "PENDING":
      return { title: "Order placed", detail: "Waiting for the shop to accept it.", tone: "active" };
    case "CONFIRMED":
      return { title: "Shop accepted your order", detail: "They'll start packing it soon.", tone: "active" };
    case "PREPARING":
      return {
        title: "Packing your order",
        detail: pickup ? "We'll show it here when it's ready to collect." : "It'll leave the shop soon.",
        tone: "active",
      };
    case "READY_FOR_PICKUP":
      return {
        title: "Ready to collect",
        detail: `Pick it up from ${shop}.${unpaid ? " Pay in cash or UPI at the counter." : ""}`,
        tone: "ready",
      };
    case "OUT_FOR_DELIVERY":
      return {
        title: "On the way",
        detail: unpaid ? "Keep cash or UPI ready to pay when it arrives." : "It'll reach you soon.",
        tone: "ready",
      };
    case "DELIVERED": {
      const when = order.deliveredAt ? ` on ${DAY.format(order.deliveredAt)}` : "";
      return { title: pickup ? "Collected" : "Delivered", detail: `${pickup ? "Collected" : "Delivered"}${when}. Thank you for shopping with us.`, tone: "done" };
    }
  }
}

/** The short steps under the status, for pickup or delivery. */
export function customerOrderSteps(fulfillmentType: FulfillmentType, status: OrderStatus) {
  const pickup = fulfillmentType === "STORE_PICKUP";
  const steps: { status: OrderStatus; label: string }[] = [
    { status: "PENDING", label: "Placed" },
    { status: "CONFIRMED", label: "Accepted" },
    { status: "PREPARING", label: "Packing" },
    pickup ? { status: "READY_FOR_PICKUP", label: "Ready" } : { status: "OUT_FOR_DELIVERY", label: "On the way" },
    { status: "DELIVERED", label: pickup ? "Collected" : "Delivered" },
  ];
  // Delivered/collected is the end: every step is done, nothing is "now".
  const current = status === "DELIVERED" ? steps.length : steps.findIndex((s) => s.status === status);
  return steps.map((s, i) => ({ ...s, state: i < current ? "done" : i === current ? "current" : "todo" }) as const);
}

/** "Aashirvaad Atta, Tata Salt +3 more" — enough to recognise an order at a glance. */
export function orderItemsSummary(items: { productName: string }[], show = 2): string {
  const names = items.slice(0, show).map((i) => i.productName);
  const more = items.length - names.length;
  return more > 0 ? `${names.join(", ")} +${more} more` : names.join(", ");
}

export function isActiveOrder(status: OrderStatus, fulfillmentType: FulfillmentType): boolean {
  return fulfillmentType !== "COUNTER_HANDOVER" && status !== "DELIVERED" && status !== "CANCELLED";
}
