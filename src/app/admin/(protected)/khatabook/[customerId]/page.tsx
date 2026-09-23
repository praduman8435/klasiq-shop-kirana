import type { PaymentMethod } from "@prisma/client";
import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AnonymizeCustomerButton } from "@/components/admin/anonymize-customer-button";
import { OrderSourceBadge, OrderStatusBadge, PaymentStatusBadge } from "@/components/admin/order-status-badge";
import { ReceivePaymentDialog } from "@/components/admin/receive-payment-dialog";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { getKhataBookCustomerProfile } from "@/server/queries/admin/khatabook";

// Same small, local, file-scoped label map every payment-method display
// in this codebase already uses (counter-sale-form.tsx,
// receive-payment-dialog.tsx) rather than a shared constant — CASH_ON_DELIVERY
// never appears in a Ledger row (Receive Payment only ever accepts
// CASH/UPI/CARD), so it's deliberately omitted here, unlike
// `getPaymentMethodLabel` (src/lib/order-message.ts), which exists for a
// different context (an Order's OWN payment method, including Online's
// CASH_ON_DELIVERY) and would need an irrelevant `fulfillmentType` to call.
const PAYMENT_METHOD_LEDGER_LABEL: Record<Extract<PaymentMethod, "CASH" | "UPI" | "CARD">, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
};

type PageProps = { params: Promise<{ customerId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { customerId } = await params;
  return { title: customerId };
}

function formatDate(date: Date): string {
  return date.toLocaleDateString("en-IN", { dateStyle: "medium" });
}

function formatDateTime(date: Date): string {
  return date.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

export default async function KhataBookCustomerPage({ params }: PageProps) {
  const { customerId } = await params;
  const profile = await getKhataBookCustomerProfile(customerId);
  if (!profile) notFound();

  const { customer, summary, orders, ledger } = profile;
  const hasOutstanding = summary.outstandingInPaise > 0;
  const unpaidOrders = orders
    .filter((order) => order.outstandingInPaise > 0)
    .map((order) => ({ orderNumber: order.orderNumber, outstandingInPaise: order.outstandingInPaise }));

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href="/admin/khatabook"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          KhataBook
        </Link>
        <div className="flex flex-wrap items-baseline justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">
              {customer.displayName || customer.customerId}
            </h1>
            <p className="mt-0.5 font-mono text-sm text-muted-foreground">{customer.customerId}</p>
          </div>
          <span
            className={cn(
              "rounded-full px-2.5 py-1 text-xs font-medium",
              hasOutstanding ? "bg-amber-500/15 text-amber-500" : "bg-secondary/40 text-muted-foreground",
            )}
          >
            {hasOutstanding ? `Outstanding ${formatPaise(summary.outstandingInPaise)}` : "Paid up"}
          </span>
        </div>
      </div>

      {/* Section 10 — the account balance is the strongest visual
          element on the page (text-2xl, the largest type here), but
          restrained to a single-line summary, not a giant empty card. */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">Account balance</p>
        <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className={cn("text-2xl font-semibold tabular-nums", hasOutstanding && "text-amber-500")}>
              {formatPaise(summary.outstandingInPaise)}
            </p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {hasOutstanding
                ? `Outstanding across ${summary.unpaidOrderCount} order${summary.unpaidOrderCount === 1 ? "" : "s"}`
                : "No outstanding balance"}
            </p>
          </div>
          <ReceivePaymentDialog customerId={customer.customerId} unpaidOrders={unpaidOrders} />
        </div>
      </div>

      {/* Section 11 — one coherent overview instead of two separate
          Customer/Summary cards: identity + contact first, then account
          metrics, divided by a hairline rather than a second card. */}
      <section>
        <h2 className="text-sm font-semibold">Customer</h2>
        <div className="mt-2 grid gap-x-8 gap-y-4 sm:grid-cols-2">
          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Primary mobile</dt>
              <dd>{customer.primaryPhone ?? "—"}</dd>
            </div>
            {customer.whatsappPhone && (
              <div className="flex justify-between gap-2">
                <dt className="text-muted-foreground">WhatsApp</dt>
                <dd>{customer.whatsappPhone}</dd>
              </div>
            )}
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Customer since</dt>
              <dd>{formatDate(customer.createdAt)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Last purchase</dt>
              <dd>{customer.lastOrderAt ? formatDate(customer.lastOrderAt) : "Never"}</dd>
            </div>
          </dl>

          <dl className="flex flex-col gap-2 text-sm">
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Lifetime purchase</dt>
              <dd className="font-medium">{formatPaise(summary.lifetimePurchaseInPaise)}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Orders</dt>
              <dd className="font-medium">{summary.totalOrders}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Returns</dt>
              <dd className="font-medium">{summary.returnCount}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Exchanges</dt>
              <dd className="font-medium">{summary.exchangeCount}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="text-muted-foreground">Avg. order value</dt>
              <dd className="font-medium">{formatPaise(summary.averageOrderValueInPaise)}</dd>
            </div>
          </dl>
        </div>

        {/* Section 12 — a sensitive, destructive action: visually
            distinct from (not competing with) the account actions
            above, and never a normal secondary button. Confirmation
            semantics (window.confirm explaining exactly what is/isn't
            erased) are unchanged. */}
        <div className="mt-4 border-t border-border pt-4">
          {customer.displayName || customer.primaryPhone ? (
            <AnonymizeCustomerButton
              customerId={customer.id}
              displayLabel={customer.displayName || customer.customerId}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Personal data already erased.</p>
          )}
        </div>
      </section>

      <div className="my-6 border-t border-border" />

      <section>
        <h2 className="text-sm font-semibold">Purchase history</h2>
        {orders.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No purchases yet.</p>
        ) : (
          <div className="mt-2 rounded-lg border border-border">
            <div className="hidden items-center gap-4 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="w-40">Order</span>
              <span className="w-24">Date</span>
              <span className="w-24">Source</span>
              <span className="w-20 text-right">Total</span>
              <span className="w-20 text-right">Received</span>
              <span className="w-24 text-right">Outstanding</span>
              <span className="flex-1">Status</span>
              <span className="w-4" />
            </div>
            <ul className="divide-y divide-border">
              {orders.map((order) => {
                const orderHasOutstanding = order.outstandingInPaise > 0;
                return (
                  <li key={order.orderNumber}>
                    <Link
                      href={`/admin/orders/${order.orderNumber}`}
                      className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4"
                    >
                      {/* Mobile — compact stacked block. */}
                      <div className="flex flex-col gap-1 sm:hidden">
                        <div className="flex items-center justify-between gap-3">
                          <span className="font-mono text-sm font-medium">{order.orderNumber}</span>
                          <span className="text-sm font-semibold">{formatPaise(order.totalInPaise)}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {formatDate(order.createdAt)} · {order.source === "COUNTER" ? "Counter Sale" : "Online"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Received {formatPaise(order.amountReceivedInPaise)}
                          {" · "}
                          <span className={orderHasOutstanding ? "font-medium text-amber-500" : undefined}>
                            Outstanding {formatPaise(order.outstandingInPaise)}
                          </span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          <OrderStatusBadge status={order.status} />
                          <PaymentStatusBadge status={order.paymentStatus} />
                        </div>
                      </div>

                      {/* Desktop — table-like columns. */}
                      <span className="hidden w-40 shrink-0 font-mono text-sm font-medium sm:block">
                        {order.orderNumber}
                      </span>
                      <span className="hidden w-24 shrink-0 text-sm text-muted-foreground sm:block">
                        {formatDate(order.createdAt)}
                      </span>
                      <span className="hidden w-24 shrink-0 sm:block">
                        <OrderSourceBadge source={order.source} className="opacity-70" />
                      </span>
                      <span className="hidden w-20 shrink-0 text-right text-sm font-semibold sm:block">
                        {formatPaise(order.totalInPaise)}
                      </span>
                      <span className="hidden w-20 shrink-0 text-right text-sm text-muted-foreground sm:block">
                        {formatPaise(order.amountReceivedInPaise)}
                      </span>
                      <span
                        className={cn(
                          "hidden w-24 shrink-0 text-right text-sm sm:block",
                          orderHasOutstanding ? "font-semibold text-amber-500" : "text-muted-foreground",
                        )}
                      >
                        {formatPaise(order.outstandingInPaise)}
                      </span>
                      <span className="hidden flex-1 flex-wrap gap-1.5 sm:flex">
                        <OrderStatusBadge status={order.status} />
                        <PaymentStatusBadge status={order.paymentStatus} />
                      </span>
                      <ChevronRight
                        className="hidden size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block"
                        aria-hidden
                      />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </section>

      <div className="my-6 border-t border-border" />

      {/* Section 14 — the Ledger, kept as its OWN section, deliberately
          separate from Purchase History above. Every row is a permanent
          PaymentReceipt explaining exactly how the balance moved: which
          order it was against, how much was received, by what method,
          by which admin, and the order's own Outstanding immediately
          before/after — never recomputed, always the snapshot taken at
          the moment of payment. */}
      <section>
        <h2 className="text-sm font-semibold">Payment ledger</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">Complete payment activity for this customer</p>
        {ledger.length === 0 ? (
          <p className="mt-2 text-sm text-muted-foreground">No payments recorded yet.</p>
        ) : (
          <div className="mt-2 rounded-lg border border-border">
            <div className="hidden items-center gap-4 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="w-32">Date</span>
              <span className="w-40">Order</span>
              <span className="w-20 text-right">Amount</span>
              <span className="w-20">Method</span>
              <span className="w-24 text-right">Outstanding after</span>
              <span className="flex-1">Recorded by</span>
              <span className="w-32">Note</span>
            </div>
            <ul className="divide-y divide-border">
              {ledger.map((entry) => (
                <li key={entry.id} className="flex flex-col gap-1.5 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
                  {/* Mobile — compact stacked record. */}
                  <div className="flex flex-col gap-1 sm:hidden">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-base font-semibold text-emerald-500">
                        +{formatPaise(entry.amountInPaise)}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LEDGER_LABEL[entry.paymentMethod as "CASH" | "UPI" | "CARD"]} ·{" "}
                        {formatDateTime(entry.createdAt)}
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Order <Link href={`/admin/orders/${entry.orderNumber}`} className="font-mono text-primary hover:underline">{entry.orderNumber}</Link>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Outstanding after <span className="text-foreground">{formatPaise(entry.outstandingAfterInPaise)}</span>
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Recorded by {entry.createdByAdminName ?? "—"}
                    </p>
                    {entry.note && <p className="text-xs text-muted-foreground">Note: {entry.note}</p>}
                  </div>

                  {/* Desktop — table-like columns. */}
                  <span className="hidden w-32 shrink-0 text-sm text-muted-foreground sm:block">
                    {formatDateTime(entry.createdAt)}
                  </span>
                  <Link
                    href={`/admin/orders/${entry.orderNumber}`}
                    className="hidden w-40 shrink-0 font-mono text-sm font-medium text-primary hover:underline sm:block"
                  >
                    {entry.orderNumber}
                  </Link>
                  <span className="hidden w-20 shrink-0 text-right text-sm font-semibold text-emerald-500 sm:block">
                    +{formatPaise(entry.amountInPaise)}
                  </span>
                  <span className="hidden w-20 shrink-0 text-sm text-muted-foreground sm:block">
                    {PAYMENT_METHOD_LEDGER_LABEL[entry.paymentMethod as "CASH" | "UPI" | "CARD"]}
                  </span>
                  <span className="hidden w-24 shrink-0 text-right text-sm text-muted-foreground sm:block">
                    {formatPaise(entry.outstandingAfterInPaise)}
                  </span>
                  <span className="hidden flex-1 text-sm text-muted-foreground sm:block">
                    {entry.createdByAdminName ?? "—"}
                  </span>
                  <span className="hidden w-32 truncate text-sm text-muted-foreground sm:block">
                    {entry.note ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>
    </div>
  );
}
