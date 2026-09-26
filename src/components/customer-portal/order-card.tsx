import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { ReorderButton } from "@/components/customer-portal/reorder-button";
import { getOrderTotalQuantity } from "@/lib/customer-portal/order-presentation";
import {
  customerOrderStatus,
  customerOrderSteps,
  isActiveOrder,
  orderItemsSummary,
  type StatusTone,
} from "@/lib/customer-portal/order-status-copy";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Order, OrderItem } from "@prisma/client";

export type OrderWithItems = Order & {
  items: (OrderItem & { product: { imageUrl: string | null; category: { slug: string } } | null })[];
};

const DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export const TONE_DOT: Record<StatusTone, string> = {
  active: "bg-amber-500",
  ready: "bg-primary",
  done: "bg-emerald-600",
  cancelled: "bg-muted-foreground/50",
};

const KIND: Record<Order["fulfillmentType"], string> = {
  LOCAL_DELIVERY: "Home delivery",
  STORE_PICKUP: "Store pickup",
  COUNTER_HANDOVER: "At the shop",
};

/** Up to four product photos (or category placeholders) — how people
 * recognise "that order" faster than by number. */
export function OrderItemPhotos({ items, size = "md" }: { items: OrderWithItems["items"]; size?: "md" | "lg" }) {
  const shown = items.slice(0, 4);
  const more = items.length - shown.length;
  const box = size === "lg" ? "size-14" : "size-12";
  return (
    <div className="flex items-center gap-1.5">
      {shown.map((item) => (
        <ProductThumbnail
          key={item.id}
          imageUrl={item.product?.imageUrl}
          alt=""
          categorySlug={item.product?.category.slug ?? ""}
          compact
          className={cn(box, "shrink-0 rounded-xl border border-border bg-card")}
        />
      ))}
      {more > 0 && (
        <span className={cn(box, "flex shrink-0 items-center justify-center rounded-xl bg-muted text-xs font-extrabold text-muted-foreground")}>
          +{more}
        </span>
      )}
    </div>
  );
}

/** Thin five-step bar for an order that's still moving. */
function MiniProgress({ order }: { order: Order }) {
  const steps = customerOrderSteps(order.fulfillmentType, order.status);
  return (
    <div className="flex gap-1" aria-hidden>
      {steps.map((s) => (
        <span
          key={s.status}
          className={cn("h-1 flex-1 rounded-full", s.state === "todo" ? "bg-border" : s.state === "current" ? "bg-primary" : "bg-primary/45")}
        />
      ))}
    </div>
  );
}

/**
 * One order in My Orders. The top is one tap target into the order; the
 * footer carries the action that order invites — keep an eye on a live
 * one, or buy the same things again from a finished one.
 */
export function OrderCard({ order }: { order: OrderWithItems }) {
  const status = customerOrderStatus(order);
  const active = isActiveOrder(order.status, order.fulfillmentType);
  const count = getOrderTotalQuantity(order.items);
  const href = `/track/orders/${order.orderNumber}`;

  return (
    <li className="overflow-hidden rounded-2xl border border-border bg-card">
      <Link href={href} className="group flex flex-col gap-3 p-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-2 text-base font-extrabold leading-snug">
              <span aria-hidden className={cn("size-2 shrink-0 rounded-full", TONE_DOT[status.tone])} />
              {status.title}
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {DATE.format(order.createdAt)} · {count} item{count === 1 ? "" : "s"} · {KIND[order.fulfillmentType]}
            </p>
          </div>
          <p className="shrink-0 text-base font-extrabold tabular-nums">{formatPaise(order.totalInPaise)}</p>
        </div>

        {active && <MiniProgress order={order} />}

        <div className="flex items-center justify-between gap-3">
          <OrderItemPhotos items={order.items} />
          <ChevronRight className="size-5 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
        </div>
        <p className="truncate text-sm text-muted-foreground">{orderItemsSummary(order.items)}</p>
      </Link>

      {!active && (
        <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3">
          <span className="font-mono text-xs text-muted-foreground">{order.orderNumber}</span>
          <ReorderButton orderNumber={order.orderNumber} className="h-10" />
        </div>
      )}
    </li>
  );
}
