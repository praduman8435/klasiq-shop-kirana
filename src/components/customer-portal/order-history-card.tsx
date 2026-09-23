import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ORDER_STATUS_BADGE_CLASS, ORDER_STATUS_LABEL } from "@/lib/order-lifecycle";
import { getOrderTotalQuantity } from "@/lib/customer-portal/order-presentation";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Order, OrderItem } from "@prisma/client";

/**
 * Continuous-list retail row (Swiggy/Zomato/Blinkit order-history
 * pattern), not a bordered card — the whole row is one tap target to the
 * order detail, list rhythm comes from the shared `divide-y` on the `<ul>`
 * in orders/page.tsx, not a border per item. Status leads (its own line,
 * reusing the exact same `ORDER_STATUS_BADGE_CLASS` pill the admin order
 * badge also reads from — one status→color mapping, never a second one),
 * then order number/date/items, then total + a trailing chevron as the
 * only "action" affordance.
 */
export function OrderHistoryCard({ order }: { order: Order & { items: OrderItem[] } }) {
  const itemCount = getOrderTotalQuantity(order.items);

  return (
    <li>
      <Link
        href={`/track/orders/${order.orderNumber}`}
        className="group -mx-4 flex items-center justify-between gap-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:-mx-3 sm:rounded-lg sm:px-3"
      >
        <div className="flex min-w-0 flex-col gap-1.5">
          <span
            className={cn(
              "inline-flex w-fit items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
              ORDER_STATUS_BADGE_CLASS[order.status],
            )}
          >
            {ORDER_STATUS_LABEL[order.status]}
          </span>
          <p className="font-mono text-sm text-foreground">{order.orderNumber}</p>
          <p className="text-xs text-muted-foreground">
            {itemCount} item{itemCount === 1 ? "" : "s"}
            {" · "}
            {order.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "short" })}
          </p>
        </div>

        <div className="flex shrink-0 items-center gap-1.5">
          <p className="text-sm font-medium text-foreground">{formatPaise(order.totalInPaise)}</p>
          <ChevronRight
            className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5"
            aria-hidden
          />
        </div>
      </Link>
    </li>
  );
}
