import type { FulfillmentType, OrderSource, OrderStatus, PaymentStatus } from "@prisma/client";
import { Badge } from "@/components/ui/badge";
import { ORDER_STATUS_BADGE_CLASS, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-lifecycle";
import { getFulfillmentLabel } from "@/lib/order-message";
import { cn } from "@/lib/utils";

export const ORDER_SOURCE_LABEL: Record<OrderSource, string> = {
  ONLINE: "Online",
  COUNTER: "Counter Sale",
};

const ORDER_SOURCE_CLASS: Record<OrderSource, string> = {
  ONLINE: "bg-secondary text-secondary-foreground",
  COUNTER: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
};

const PAYMENT_STATUS_CLASS: Record<PaymentStatus, string> = {
  UNPAID: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300",
  PAID: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  PARTIALLY_PAID: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300",
  REFUNDED: "bg-muted text-muted-foreground",
  FAILED: "bg-destructive/10 text-destructive",
};

// Same visual weight as the other three order-facing badges (Source,
// Status, Payment) — added in Phase 3.2 Part 3 after review found
// fulfillment type was the only one of the four still shown as plain text,
// which read as an afterthought next to the others. See
// docs/PHASE_3_2_REPORT.md "Order management review".
const FULFILLMENT_TYPE_CLASS: Record<FulfillmentType, string> = {
  STORE_PICKUP: "bg-secondary text-secondary-foreground",
  LOCAL_DELIVERY: "bg-accent/50 text-accent-foreground",
  COUNTER_HANDOVER: "bg-violet-100 text-violet-800 dark:bg-violet-900/30 dark:text-violet-300",
};

export function OrderStatusBadge({ status, className }: { status: OrderStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", ORDER_STATUS_BADGE_CLASS[status], className)}>
      {ORDER_STATUS_LABEL[status]}
    </Badge>
  );
}

export function PaymentStatusBadge({ status, className }: { status: PaymentStatus; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", PAYMENT_STATUS_CLASS[status], className)}>
      {PAYMENT_STATUS_LABEL[status]}
    </Badge>
  );
}

/**
 * `className` lets a caller (e.g. the Orders list/detail redesign) quiet
 * this badge relative to Order Status/Payment Status — "keep source
 * visually quieter" — without forking or editing the shared color map
 * itself. Existing callers that don't pass it (e.g. KhataBook) render
 * byte-for-byte as before.
 */
export function OrderSourceBadge({ source, className }: { source: OrderSource; className?: string }) {
  return (
    <Badge variant="outline" className={cn("border-transparent", ORDER_SOURCE_CLASS[source], className)}>
      {ORDER_SOURCE_LABEL[source]}
    </Badge>
  );
}

export function FulfillmentBadge({
  fulfillmentType,
  className,
}: {
  fulfillmentType: FulfillmentType;
  className?: string;
}) {
  return (
    <Badge variant="outline" className={cn("border-transparent", FULFILLMENT_TYPE_CLASS[fulfillmentType], className)}>
      {getFulfillmentLabel(fulfillmentType)}
    </Badge>
  );
}
