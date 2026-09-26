import type { Metadata } from "next";
import Link from "next/link";
import { ArrowDownLeft, ArrowUpRight, BookOpen, CircleCheck, Clock, Phone, TriangleAlert } from "lucide-react";
import { KhataPaySheet } from "@/components/customer-portal/khata-pay-sheet";
import { PortalHeader } from "@/components/customer-portal/portal-header";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { KHATA_PAYMENT_METHOD_LABEL, daysSince } from "@/lib/khata";
import { formatPaise } from "@/lib/money";
import { isValidUpiId } from "@/lib/upi";
import { cn } from "@/lib/utils";
import { getCustomerKhata } from "@/server/khatabook/payment-claims";

export const metadata: Metadata = {
  title: "Mera Khata",
  robots: { index: false, follow: false },
};

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const SHORT = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

type Event = Awaited<ReturnType<typeof getCustomerKhata>>["events"][number];

/** Each khata line from the customer's side of the counter. */
function describe(event: Event): { title: string; sub: string | null } {
  switch (event.type) {
    case "OPENING":
      return { title: "Old balance", sub: "Purana baaki" };
    case "UDHAAR":
      return { title: event.note ? `Udhaar · ${event.note}` : "Udhaar", sub: null };
    case "BILL":
      return { title: "Bought on udhaar", sub: event.orderNumber };
    case "PAYMENT":
      return { title: "You paid", sub: KHATA_PAYMENT_METHOD_LABEL[event.paymentMethod ?? ""] ?? "Cash" };
  }
}

/**
 * Mera Khata: the customer's running account with the shop — the same
 * balance the shopkeeper sees — and a way to clear it by UPI without
 * walking over. Online payments show as "being checked" until the shop
 * confirms them from its UPI app.
 */
export default async function MeraKhataPage() {
  const session = await getCustomerSession();
  if (!session) return null;

  const khata = session.customer ? await getCustomerKhata(session.customer.id) : null;
  const shopName = BRAND.legacyStoreNames[0] ?? BRAND.name;
  const upiId = process.env.STORE_UPI_ID && isValidUpiId(process.env.STORE_UPI_ID) ? process.env.STORE_UPI_ID : STORE_CONTACT.upiId;
  const due = khata?.dueInPaise ?? 0;
  const days = khata?.dueSince ? daysSince(khata.dueSince) : 0;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
      <PortalHeader
        name={session.customer?.displayName ?? null}
        phone={session.phoneNormalized}
        active="khata"
        dueInPaise={due}
      />

      {!khata || khata.totalCount === 0 ? (
        <div className="flex flex-col items-center rounded-3xl border border-border bg-card px-6 py-12 text-center">
          <span className="flex size-14 items-center justify-center rounded-2xl bg-brand-soft text-brand-deep">
            <BookOpen className="size-7" aria-hidden />
          </span>
          <p className="mt-4 text-lg font-extrabold">No khata with the shop</p>
          <p className="mt-1 max-w-xs text-sm text-muted-foreground">
            If you buy on udhaar at {shopName}, every entry and payment shows up here, the same as in the shop&apos;s book.
          </p>
        </div>
      ) : (
        <>
          <section
            aria-labelledby="balance-heading"
            className={cn("rounded-3xl border p-5", due > 0 ? "border-primary/15 bg-brand-soft" : "border-border bg-card")}
          >
            <h2 id="balance-heading" className={cn("text-sm font-bold", due > 0 ? "text-brand-deep" : "text-muted-foreground")}>
              {due > 0 ? "You owe the shop · Baaki" : "Your khata"}
            </h2>
            {due > 0 ? (
              <>
                <p className="mt-1 font-heading text-4xl font-extrabold tracking-[-0.02em] text-brand-deep tabular-nums">{formatPaise(due)}</p>
                {khata.dueSince && (
                  <p className="mt-1 text-sm text-brand-deep/80">
                    Oldest unpaid udhaar from {SHORT.format(khata.dueSince)}
                    {days > 0 ? ` · ${days} day${days === 1 ? "" : "s"} ago` : " · today"}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-2 flex items-center gap-2 text-2xl font-extrabold text-emerald-700">
                <CircleCheck className="size-7" aria-hidden />
                All clear, nothing due
              </p>
            )}

            {khata.pending.length > 0 && (
              <div className="mt-4 flex gap-2.5 rounded-2xl bg-card/80 p-3 text-sm">
                <Clock className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden />
                <div>
                  <p className="font-bold">
                    {formatPaise(khata.pendingInPaise)} paid online, being checked
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    The shop is matching {khata.pending.length === 1 ? "it" : "them"} with their UPI app. Your khata updates once they confirm.
                  </p>
                </div>
              </div>
            )}

            {khata.rejected.length > 0 && (
              <div className="mt-3 flex gap-2.5 rounded-2xl bg-card/80 p-3 text-sm">
                <TriangleAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
                <div>
                  <p className="font-bold">
                    The shop couldn&apos;t find {khata.rejected.length === 1 ? `your ${formatPaise(khata.rejected[0].amountInPaise)} payment` : "some payments"}
                  </p>
                  <p className="mt-0.5 text-muted-foreground">
                    If money left your account, call the shop with the UPI reference.{" "}
                    <a href={STORE_CONTACT.phoneHref} className="font-semibold text-primary hover:underline">
                      Call {STORE_CONTACT.phone}
                    </a>
                  </p>
                </div>
              </div>
            )}

            {khata.payableInPaise > 0 && (
              <div className="mt-5">
                <KhataPaySheet
                  payableInPaise={khata.payableInPaise}
                  upiId={upiId}
                  payeeName={shopName}
                  customerName={session.customer?.displayName ?? null}
                />
                <p className="mt-2 text-center text-xs text-brand-deep/75">Or pay at the counter in cash, as always.</p>
              </div>
            )}
          </section>

          <section aria-labelledby="entries-heading" className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between gap-3">
              <h2 id="entries-heading" className="font-heading text-lg font-extrabold">
                Entries
              </h2>
              <a href={STORE_CONTACT.phoneHref} className="inline-flex items-center gap-1 text-sm font-semibold text-muted-foreground hover:text-foreground">
                <Phone className="size-3.5" aria-hidden />
                Something wrong? Call
              </a>
            </div>
            <ol className="flex flex-col divide-y divide-border overflow-hidden rounded-3xl border border-border bg-card">
              {khata.events.map((event) => {
                const { title, sub } = describe(event);
                const paid = event.type === "PAYMENT";
                const row = (
                  <>
                    <span
                      aria-hidden
                      className={cn(
                        "flex size-9 shrink-0 items-center justify-center rounded-xl",
                        paid ? "bg-emerald-50 text-emerald-700" : "bg-brand-soft text-brand-deep",
                      )}
                    >
                      {paid ? <ArrowDownLeft className="size-4" /> : <ArrowUpRight className="size-4" />}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{title}</p>
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {DAY.format(event.date)}
                        {sub && <> · {sub}</>}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className={cn("text-sm font-extrabold tabular-nums", paid ? "text-emerald-700" : "text-foreground")}>
                        {paid ? "−" : "+"}
                        {formatPaise(event.amountInPaise)}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground tabular-nums">Baaki {formatPaise(event.balanceInPaise)}</p>
                    </div>
                  </>
                );
                return (
                  <li key={event.key}>
                    {event.type === "BILL" && event.orderNumber ? (
                      <Link href={`/track/orders/${event.orderNumber}`} className="flex items-center gap-3 px-4 py-3 hover:bg-muted/60">
                        {row}
                      </Link>
                    ) : (
                      <div className="flex items-center gap-3 px-4 py-3">{row}</div>
                    )}
                  </li>
                );
              })}
            </ol>
            {khata.totalCount > khata.events.length && (
              <p className="text-center text-xs text-muted-foreground">
                Showing the latest {khata.events.length} of {khata.totalCount} entries. Ask the shop for the full statement.
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
