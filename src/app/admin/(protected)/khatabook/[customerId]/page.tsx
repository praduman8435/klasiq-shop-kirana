import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { ArrowLeft, BellRing, ChevronRight, HandCoins, MessageCircle, Phone, Plus, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AnonymizeCustomerButton } from "@/components/admin/anonymize-customer-button";
import { OrderStatusBadge } from "@/components/admin/order-status-badge";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import {
  buildKhataReminderText,
  buildKhataStatementText,
  daysSince,
  khataEventLabel,
  khataEventSign,
} from "@/lib/khata";
import { formatPaise } from "@/lib/money";
import { telLink, whatsAppLink } from "@/lib/supplier-statement";
import { cn } from "@/lib/utils";
import { getKhataTimeline } from "@/server/khatabook/quick-khata";
import { getKhataBookCustomerProfile } from "@/server/queries/admin/khatabook";

type PageProps = { params: Promise<{ customerId: string }> };

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const YEAR = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", year: "numeric" });
const SHOP = BRAND.legacyStoreNames[0] ?? BRAND.name;

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { customerId } = await params;
  const profile = await getKhataBookCustomerProfile(customerId);
  return { title: profile?.customer.displayName || customerId };
}

/**
 * One customer's khata, the way a shopkeeper reads it: how much is
 * "lena hai", the two things done most (Paisa mila / Udhaar diya), a
 * WhatsApp reminder, and every entry with a running balance.
 */
export default async function KhataBookCustomerPage({ params }: PageProps) {
  const { customerId } = await params;
  const profile = await getKhataBookCustomerProfile(customerId);
  if (!profile) notFound();
  const { customer, summary, orders } = profile;
  const khata = await getKhataTimeline(customer.id, 40);

  const name = customer.displayName || customer.customerId;
  const due = khata.dueInPaise > 0;
  const chatPhone = customer.whatsappPhone || customer.primaryPhone;
  const call = telLink(customer.primaryPhone);
  const reminder = whatsAppLink(
    chatPhone,
    buildKhataReminderText({ shopName: SHOP, shopPhone: STORE_CONTACT.phone, customerName: customer.displayName, dueInPaise: khata.dueInPaise }),
  );
  const statement = whatsAppLink(
    chatPhone,
    buildKhataStatementText({ shopName: SHOP, customerName: customer.displayName, events: khata.events, dueInPaise: khata.dueInPaise }),
  );
  const thisYear = YEAR.format(new Date());
  const dueDays = khata.dueSince ? daysSince(khata.dueSince) : null;
  const base = `/admin/khatabook/${customer.customerId}`;

  const billsAndInfo = (
    <div className="flex flex-col gap-5">
      {orders.length > 0 && (
        <details className="group rounded-xl border border-border bg-card">
          <summary className="flex h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 text-sm font-semibold">
            <span>
              All bills ({summary.totalOrders}){" "}
              <span className="font-normal text-muted-foreground">· {formatPaise(summary.lifetimePurchaseInPaise)} total</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground transition-transform group-open:rotate-90" aria-hidden />
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {orders.map((order) => (
              <li key={order.orderNumber}>
                <Link href={`/admin/orders/${order.orderNumber}`} className="flex items-center gap-3 px-4 py-3 text-sm hover:bg-muted/40">
                  <span className="w-14 shrink-0 text-xs text-muted-foreground">{DAY.format(order.createdAt)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-xs">{order.orderNumber}</span>
                    <span className="mt-0.5 block">
                      <OrderStatusBadge status={order.status} />
                    </span>
                  </span>
                  <span className="flex flex-col items-end">
                    <span className="font-medium tabular-nums">{formatPaise(order.totalInPaise)}</span>
                    {order.outstandingInPaise > 0 && (
                      <span className="text-xs text-amber-500 tabular-nums">{formatPaise(order.outstandingInPaise)} baaki</span>
                    )}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </details>
      )}

      <section className="border-t border-border pt-4">
        <p className="text-xs text-muted-foreground">
          Customer since {DAY.format(customer.createdAt)} {YEAR.format(customer.createdAt)}
          {summary.totalOrders > 0 && ` · Average bill ${formatPaise(summary.averageOrderValueInPaise)}`}
        </p>
        <div className="mt-3">
          {customer.displayName || customer.primaryPhone ? (
            <AnonymizeCustomerButton customerId={customer.id} displayLabel={name} />
          ) : (
            <p className="text-xs text-muted-foreground">Personal data already erased.</p>
          )}
        </div>
      </section>
    </div>
  );

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 lg:max-w-6xl">
      <Link href="/admin/khatabook" className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        KhataBook
      </Link>

      <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[380px_minmax(0,1fr)] lg:items-start lg:gap-8">
        <div className="flex flex-col gap-5 lg:sticky lg:top-6">
          <header className="flex items-start gap-3">
            <span aria-hidden className="flex size-12 shrink-0 items-center justify-center rounded-full bg-secondary text-lg font-semibold">
              {name.trim().charAt(0).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <h1 className="font-heading text-xl font-semibold tracking-tight">{name}</h1>
              <p className="mt-0.5 truncate text-sm text-muted-foreground">
                {[customer.primaryPhone, customer.customerId].filter(Boolean).join(" · ")}
              </p>
              {(call || chatPhone) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {call && (
                    <Button render={<a href={call} />} nativeButton={false} variant="outline" className="h-10">
                      <Phone className="size-4" aria-hidden />
                      Call
                    </Button>
                  )}
                  {chatPhone && (
                    <Button
                      render={<a href={whatsAppLink(chatPhone)} target="_blank" rel="noopener noreferrer" />}
                      nativeButton={false}
                      variant="outline"
                      className="h-10"
                    >
                      <MessageCircle className="size-4" aria-hidden />
                      WhatsApp
                    </Button>
                  )}
                </div>
              )}
            </div>
          </header>

          <section aria-labelledby="balance-heading" className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <p id="balance-heading" className="text-sm text-muted-foreground">
              {due ? "To get · Lena hai" : "Hisaab barabar"}
            </p>
            <p className={cn("mt-1 text-4xl font-semibold tabular-nums", due ? "text-amber-500" : "text-muted-foreground")}>
              {due ? formatPaise(khata.dueInPaise) : "All paid"}
            </p>
            {due && khata.dueSince && (
              <p className="mt-1 text-sm text-muted-foreground">
                {dueDays === 0 ? "Udhaar since today" : `Due for ${dueDays} day${dueDays === 1 ? "" : "s"} · since ${DAY.format(khata.dueSince)}`}
              </p>
            )}

            <div className="mt-4 grid grid-cols-2 gap-2">
              {due ? (
                <Button render={<Link href={`${base}/collect`} />} nativeButton={false} className="h-12 flex-col gap-0 text-base">
                  <span className="flex items-center gap-1.5">
                    <HandCoins className="size-4" aria-hidden />
                    Got payment
                  </span>
                  <span className="text-xs font-normal opacity-80">Paisa mila</span>
                </Button>
              ) : (
                <Button type="button" disabled className="h-12 flex-col gap-0 text-base">
                  <span className="flex items-center gap-1.5">
                    <HandCoins className="size-4" aria-hidden />
                    Got payment
                  </span>
                  <span className="text-xs font-normal opacity-80">Nothing due</span>
                </Button>
              )}
              <Button render={<Link href={`${base}/udhaar`} />} nativeButton={false} variant="outline" className="h-12 flex-col gap-0 text-base">
                <span className="flex items-center gap-1.5">
                  <Plus className="size-4" aria-hidden />
                  Gave udhaar
                </span>
                <span className="text-xs font-normal text-muted-foreground">Udhaar diya</span>
              </Button>
            </div>

            {chatPhone && khata.totalCount > 0 && (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {due ? (
                  <Button
                    render={<a href={reminder} target="_blank" rel="noopener noreferrer" />}
                    nativeButton={false}
                    variant="ghost"
                    className="h-10 text-muted-foreground"
                  >
                    <BellRing className="size-4" aria-hidden />
                    Send reminder
                  </Button>
                ) : (
                  <span />
                )}
                <Button
                  render={<a href={statement} target="_blank" rel="noopener noreferrer" />}
                  nativeButton={false}
                  variant="ghost"
                  className="h-10 text-muted-foreground"
                >
                  <Share2 className="size-4" aria-hidden />
                  Share hisaab
                </Button>
              </div>
            )}
          </section>

          <div className="hidden lg:block">{billsAndInfo}</div>
        </div>
        <div className="flex flex-col gap-5">
          <section aria-labelledby="khata-heading">
            <h2 id="khata-heading" className="mb-2 text-sm font-semibold">
              Khata · Hisaab
            </h2>
            {khata.events.length === 0 ? (
              <div className="rounded-xl border border-dashed border-border p-8 text-center">
                <p className="text-sm font-medium">No udhaar yet</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  When {customer.displayName || "this customer"} takes goods on credit, tap{" "}
                  <span className="text-foreground">Gave udhaar</span>. When they pay, tap{" "}
                  <span className="text-foreground">Got payment</span>.
                </p>
              </div>
            ) : (
              <div className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="hidden items-center gap-3 border-b border-border px-4 py-2.5 text-xs font-medium text-muted-foreground lg:flex">
                <span className="w-14 shrink-0">Date</span>
                <span className="min-w-0 flex-1">Entry</span>
                <span className="w-28 text-right">Amount</span>
                <span className="w-28 text-right">Baaki</span>
                <span className="w-4 shrink-0" />
              </div>
              <ol className="divide-y divide-border">
                {khata.events.map((event) => {
                  const plus = khataEventSign(event) > 0;
                  const year = YEAR.format(event.date);
                  const row = (
                    <>
                      <span className="w-14 shrink-0 text-xs text-muted-foreground tabular-nums">
                        {DAY.format(event.date)}
                        {year !== thisYear && <span className="block">{year}</span>}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm">{khataEventLabel(event)}</span>
                      <span className="flex flex-col items-end lg:flex-row lg:items-center">
                        <span className={cn("text-sm font-medium tabular-nums lg:w-28 lg:text-right", plus ? "text-foreground" : "text-emerald-400")}>
                          {plus ? "+" : "−"}
                          {formatPaise(event.amountInPaise)}
                        </span>
                        <span className="text-xs text-muted-foreground tabular-nums lg:w-28 lg:text-right lg:text-sm">
                          <span className="lg:hidden">Baaki </span>
                          {formatPaise(event.balanceInPaise)}
                        </span>
                      </span>
                    </>
                  );
                  return (
                    <li key={event.key}>
                      {event.href ? (
                        <Link href={event.href} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none">
                          {row}
                          <ChevronRight className="size-4 shrink-0 text-muted-foreground/60" aria-hidden />
                        </Link>
                      ) : (
                        <div className="flex items-center gap-3 px-4 py-3">
                          {row}
                          <span className="size-4 shrink-0" aria-hidden />
                        </div>
                      )}
                    </li>
                  );
                })}
              </ol>
              </div>
            )}
            {khata.events.length > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                + udhaar diya, − paisa mila. A payment clears the oldest udhaar first.
                {khata.totalCount > khata.events.length && ` Showing the latest ${khata.events.length} of ${khata.totalCount}.`}
              </p>
            )}
          </section>

          <div className="lg:hidden">{billsAndInfo}</div>
        </div>
      </div>
    </div>
  );
}
