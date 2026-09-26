import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { OrderFilters } from "@/components/admin/order-filters";
import { OrderNextStepButton } from "@/components/admin/order-next-step-button";
import { ORDER_STATUS_BADGE_CLASS } from "@/lib/order-lifecycle";
import {
  ORDER_TAB_LABEL,
  ORDER_TAB_STATUSES,
  ORDER_TABS,
  countForTab,
  nextStep,
  paymentSummary,
  simpleStatusLabel,
  type OrderTab,
} from "@/lib/order-queue";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { adminOrderFiltersSchema } from "@/lib/validation/admin-orders";
import { getAdminOrders, getOrderStatusCounts, getTodayOrderSummary } from "@/server/queries/admin/orders";

export const metadata: Metadata = { title: "Orders" };

const WHEN = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const TYPE_LABEL = { STORE_PICKUP: "Pickup", LOCAL_DELIVERY: "Delivery", COUNTER_HANDOVER: "Counter" } as const;

type PageProps = {
  searchParams: Promise<{
    tab?: string;
    status?: string;
    paymentStatus?: string;
    fulfillmentType?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
  }>;
};

/**
 * Orders as a work queue: "Needs action" first (new → packing → ready /
 * on the way), each row with a one-tap next step, plus today's totals.
 * The detailed filters stay available for looking things up.
 */
export default async function AdminOrdersPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const parsed = adminOrderFiltersSchema.safeParse({
    status: query.status,
    paymentStatus: query.paymentStatus,
    fulfillmentType: query.fulfillmentType,
    source: query.source,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    query: query.q,
  });
  const filters = parsed.success ? parsed.data : {};

  const [counts, today] = await Promise.all([getOrderStatusCounts(), getTodayOrderSummary()]);
  const requestedTab = ORDER_TABS.find((t) => t === query.tab);
  // Nothing waiting? Open on All instead of an empty queue.
  const tab: OrderTab = requestedTab ?? (countForTab("TODO", counts) > 0 ? "TODO" : "ALL");
  const orders = await getAdminOrders(filters, { statuses: ORDER_TAB_STATUSES[tab] });
  const hasActiveFilters = Object.values(filters).some(Boolean);

  const tabHref = (t: OrderTab) => {
    const params = new URLSearchParams();
    if (t !== "TODO") params.set("tab", t);
    if (query.q) params.set("q", query.q);
    return `/admin/orders${params.size ? `?${params}` : ""}`;
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Today: {today.online.count} online ({formatPaise(today.online.valueInPaise)}) · {today.counter.count} counter (
          {formatPaise(today.counter.valueInPaise)})
        </p>
      </div>

      <nav aria-label="Order status" className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1">
        {ORDER_TABS.map((t) => {
          const n = countForTab(t, counts);
          const active = t === tab;
          return (
            <Link
              key={t}
              href={tabHref(t)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex h-9 shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                active ? "border-transparent bg-primary text-primary-foreground" : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              {ORDER_TAB_LABEL[t]}
              {t !== "ALL" && t !== "DONE" && t !== "CANCELLED" && n > 0 && (
                <span
                  className={cn(
                    "min-w-5 rounded-full px-1.5 text-center text-xs tabular-nums",
                    active ? "bg-primary-foreground/20" : "bg-secondary text-foreground",
                  )}
                >
                  {n}
                </span>
              )}
            </Link>
          );
        })}
      </nav>

      <OrderFilters />

      {orders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">
            {hasActiveFilters ? "No orders match these filters" : tab === "TODO" ? "Nothing to do right now" : "No orders here"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try clearing the search or filters."
              : tab === "TODO"
                ? "New online orders show up here, ready to accept and pack."
                : "Orders from the website and the counter appear here."}
          </p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden items-center gap-4 border-b border-border px-5 py-2.5 text-xs font-medium text-muted-foreground lg:flex">
            <span className="min-w-0 flex-1">Customer</span>
            <span className="w-24 shrink-0">Type</span>
            <span className="w-32 shrink-0">Placed</span>
            <span className="w-32 shrink-0">Status</span>
            <span className="w-40 shrink-0">Payment</span>
            <span className="w-20 shrink-0 text-right">Amount</span>
            <span className="w-44 shrink-0" />
          </div>
          <ul className="divide-y divide-border">
            {orders.map((order) => {
              const payment = paymentSummary(order);
              const name = order.customerName || (order.source === "COUNTER" ? "Walk-in customer" : "Customer");
              const status = (
                <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-medium", ORDER_STATUS_BADGE_CLASS[order.status])}>
                  {order.status === "CANCELLED" && order.cancelledBy === "CUSTOMER" ? "Cancelled by customer" : simpleStatusLabel(order.status, order.fulfillmentType)}
                </span>
              );
              const paymentText = (
                <span
                  className={cn(
                    "text-xs",
                    payment.tone === "due" ? "font-medium text-amber-500" : payment.tone === "paid" ? "text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {payment.label}
                </span>
              );
              return (
                <li key={order.id} className="flex flex-col gap-2 px-4 py-3 sm:px-5 lg:flex-row lg:items-center lg:gap-4">
                  <Link href={`/admin/orders/${order.orderNumber}`} className="group flex min-w-0 flex-1 flex-col gap-1.5 lg:flex-row lg:items-center lg:gap-4">
                    <div className="flex items-start justify-between gap-3 lg:min-w-0 lg:flex-1">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium group-hover:underline">{name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          <span className="font-mono">{order.orderNumber}</span>
                          <span className="lg:hidden">
                            {" "}
                            · {TYPE_LABEL[order.fulfillmentType]} · {WHEN.format(order.createdAt)}
                          </span>
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-semibold tabular-nums lg:hidden">{formatPaise(order.totalInPaise)}</span>
                    </div>
                    <div className="flex flex-wrap items-center gap-2 lg:hidden">
                      {status}
                      {paymentText}
                    </div>
                    <span className="hidden w-24 shrink-0 text-sm text-muted-foreground lg:block">{TYPE_LABEL[order.fulfillmentType]}</span>
                    <span className="hidden w-32 shrink-0 text-sm text-muted-foreground lg:block">{WHEN.format(order.createdAt)}</span>
                    <span className="hidden w-32 shrink-0 lg:block">{status}</span>
                    <span className="hidden w-40 shrink-0 truncate lg:block">{paymentText}</span>
                    <span className="hidden w-20 shrink-0 text-right text-sm font-semibold tabular-nums lg:block">
                      {formatPaise(order.totalInPaise)}
                    </span>
                  </Link>
                  <div
                    className={cn(
                      "items-center justify-end gap-2 lg:flex lg:w-44 lg:shrink-0",
                      nextStep(order.status, order.fulfillmentType) ? "flex" : "hidden",
                    )}
                  >
                    <OrderNextStepButton orderNumber={order.orderNumber} status={order.status} fulfillmentType={order.fulfillmentType} />
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      aria-label={`Open ${order.orderNumber}`}
                      className="hidden size-9 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/60 lg:flex"
                    >
                      <ChevronRight className="size-4" aria-hidden />
                    </Link>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
      {orders.length >= 200 && (
        <p className="text-xs text-muted-foreground">Showing the latest 200. Use search or filters to find older orders.</p>
      )}
    </div>
  );
}
