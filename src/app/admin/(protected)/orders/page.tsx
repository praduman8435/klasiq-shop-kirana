import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { OrderFilters } from "@/components/admin/order-filters";
import {
  FulfillmentBadge,
  OrderSourceBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/order-status-badge";
import { ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-lifecycle";
import { getFulfillmentLabel } from "@/lib/order-message";
import { formatPaise } from "@/lib/money";
import { adminOrderFiltersSchema } from "@/lib/validation/admin-orders";
import { getAdminOrders } from "@/server/queries/admin/orders";

function formatOrderTimestamp(date: Date): string {
  const day = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
  const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
  return `${day} · ${time}`;
}

export const metadata: Metadata = { title: "Orders" };

type PageProps = {
  searchParams: Promise<{
    status?: string;
    paymentStatus?: string;
    fulfillmentType?: string;
    source?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
  }>;
};

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

  const orders = await getAdminOrders(filters);
  // `Object.keys` alone over-counts here: zod's parsed output keeps
  // every optional key even when its value is `undefined`, so it would
  // report "active" on a completely filter-free page load.
  const hasActiveFilters = Object.values(filters).some(Boolean);

  return (
    // AdminShell establishes the dark scope + background for the whole
    // admin application; this page just renders directly into it.
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Orders</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {orders.length} order{orders.length === 1 ? "" : "s"} shown · newest first
        </p>
      </div>

      <OrderFilters />

      {orders.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">No orders found</p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try widening your filters or clearing the search."
              : "Orders placed online or recorded at the counter will show up here."}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {orders.map((order) => (
              <li key={order.id}>
                <Link
                  href={`/admin/orders/${order.orderNumber}`}
                  className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="flex items-start justify-between gap-3 sm:min-w-0 sm:flex-1 sm:block">
                    <div className="min-w-0">
                      <p className="font-mono text-sm font-medium">{order.orderNumber}</p>
                      <p className="mt-0.5 truncate text-sm text-muted-foreground">
                        {order.customerName || order.customerMobile
                          ? [order.customerName, order.customerMobile].filter(Boolean).join(" · ")
                          : "Guest customer"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {formatOrderTimestamp(order.createdAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-semibold tabular-nums sm:hidden">
                      {formatPaise(order.totalInPaise)}
                    </p>
                  </div>

                  {/* Mobile — plain quiet text rather than a badge
                      cluster, per the brief's own mobile mockup: status
                      meaning is conveyed by text either way, this just
                      keeps a narrow row from turning into four pills. */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs sm:hidden">
                    <span className="font-medium text-foreground">{ORDER_STATUS_LABEL[order.status]}</span>
                    <span aria-hidden className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</span>
                  </div>
                  {/* Counter Sale's own fulfillment type IS "Counter
                      Sale" (COUNTER_HANDOVER) — showing both badges
                      would just repeat the same word twice in a row, so
                      the fulfillment half is only shown when it says
                      something the source badge doesn't already. */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground/70 sm:hidden">
                    <span>{order.source === "COUNTER" ? "Counter Sale" : "Online"}</span>
                    {order.fulfillmentType !== "COUNTER_HANDOVER" && (
                      <>
                        <span aria-hidden>·</span>
                        <span>{getFulfillmentLabel(order.fulfillmentType)}</span>
                      </>
                    )}
                  </div>

                  <div className="hidden shrink-0 items-center gap-4 sm:flex">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <OrderSourceBadge source={order.source} className="opacity-70" />
                      {order.fulfillmentType !== "COUNTER_HANDOVER" && (
                        <FulfillmentBadge fulfillmentType={order.fulfillmentType} className="opacity-70" />
                      )}
                      <OrderStatusBadge status={order.status} />
                      <PaymentStatusBadge status={order.paymentStatus} />
                    </div>
                    <p className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                      {formatPaise(order.totalInPaise)}
                    </p>
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
