import Link from "next/link";
import type { Metadata } from "next";
import { BellRing, ChevronRight, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { KhataBookSearch } from "@/components/admin/khatabook-search";
import { KhataPaymentClaims } from "@/components/admin/khata-payment-claims";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import { buildKhataReminderText, daysSince } from "@/lib/khata";
import { formatPaise } from "@/lib/money";
import { whatsAppLink } from "@/lib/supplier-statement";
import { khataListParamsSchema } from "@/lib/validation/admin-khata-quick";
import { getPendingKhataPaymentClaims } from "@/server/khatabook/payment-claims";
import { getKhataList, getKhataOverview } from "@/server/queries/admin/khata-list";

export const metadata: Metadata = { title: "KhataBook" };

type PageProps = { searchParams: Promise<{ q?: string; page?: string; tab?: string }> };

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const MONTH = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short" });
const SHOP = BRAND.legacyStoreNames[0] ?? BRAND.name;

function dueForLabel(since: Date | null) {
  if (!since) return null;
  const days = daysSince(since);
  return days === 0 ? "Udhaar since today" : `Due for ${days} day${days === 1 ? "" : "s"}`;
}

/**
 * KhataBook: who owes the shop and how much ("lena hai"), biggest first;
 * "Collect today" puts the oldest udhaar first with a one-tap WhatsApp
 * reminder on each row.
 */
export default async function KhataBookPage({ searchParams }: PageProps) {
  const params = khataListParamsSchema.parse(await searchParams);
  const [overview, list, claims] = await Promise.all([
    getKhataOverview(),
    getKhataList({ query: params.q, tab: params.tab, page: params.page }),
    getPendingKhataPaymentClaims(),
  ]);
  const collecting = params.tab === "COLLECT";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">KhataBook</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Udhaar khata of your customers</p>
        </div>
        <Button render={<Link href="/admin/khatabook/new" />} nativeButton={false} className="h-10">
          <UserPlus className="size-4" aria-hidden />
          Add customer
        </Button>
      </div>

      <KhataPaymentClaims claims={claims} />

      <section aria-label="Summary" className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card lg:grid-cols-3">
        <div className="col-span-2 flex items-end justify-between gap-4 px-4 pt-4 pb-3 sm:px-5 lg:col-span-1 lg:block lg:border-r lg:border-border lg:py-4">
          <div>
            <p className="text-sm text-muted-foreground">To get · Lena hai</p>
            <p
              className={
                overview.totalDueInPaise > 0
                  ? "mt-1 text-3xl font-semibold tabular-nums text-amber-500"
                  : "mt-1 text-3xl font-semibold tabular-nums"
              }
            >
              {formatPaise(overview.totalDueInPaise)}
            </p>
          </div>
          <p className="pb-1 text-right text-sm text-muted-foreground lg:mt-1 lg:pb-0 lg:text-left">
            {overview.customersDueCount === 0
              ? "No udhaar pending"
              : `from ${overview.customersDueCount} customer${overview.customersDueCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="border-t border-r border-border px-4 py-2.5 sm:px-5 lg:border-t-0 lg:py-4">
          <p className="text-sm text-muted-foreground">Udhaar diya in {MONTH.format(new Date())}</p>
          <p className="mt-0.5 font-medium tabular-nums lg:mt-1 lg:text-2xl lg:font-semibold">
            {formatPaise(overview.udhaarGivenThisMonthInPaise)}
          </p>
        </div>
        <div className="border-t border-border px-4 py-2.5 sm:px-5 lg:border-t-0 lg:py-4">
          <p className="text-sm text-muted-foreground">Paisa mila in {MONTH.format(new Date())}</p>
          <p className="mt-0.5 font-medium tabular-nums lg:mt-1 lg:text-2xl lg:font-semibold">
            {formatPaise(overview.collectedThisMonthInPaise)}
          </p>
        </div>
      </section>

      <KhataBookSearch activeTab={params.tab} />

      {collecting && list.rows.length > 0 && (
        <p className="-mt-2 text-sm text-muted-foreground">
          Oldest udhaar first. Tap the bell to send a polite WhatsApp reminder.
        </p>
      )}

      {list.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">
            {params.q ? `No customer matches "${params.q}"` : params.tab === "ALL" ? "No customers yet" : "Koi udhaar baaki nahi"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {params.q
              ? "Try another name or mobile number."
              : params.tab === "ALL"
                ? "Customers appear here from counter sales and online orders, or add one yourself."
                : "No customer has udhaar right now."}
          </p>
          {!params.q && (
            <Button render={<Link href="/admin/khatabook/new" />} nativeButton={false} variant="outline" className="mt-4 h-10">
              <UserPlus className="size-4" aria-hidden />
              Add customer with purana udhaar
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
          <div className="hidden items-center gap-3 border-b border-border px-5 py-2.5 text-xs font-medium text-muted-foreground lg:flex">
            <span className="w-10 shrink-0" />
            <span className="min-w-0 flex-1">Customer</span>
            <span className="w-32 shrink-0">Mobile</span>
            <span className="w-40 shrink-0">{params.tab === "ALL" ? "Last purchase" : "Udhaar since"}</span>
            <span className="w-28 shrink-0 text-right">Balance</span>
            <span className={collecting ? "w-11 shrink-0" : "w-4 shrink-0"} />
          </div>
          <ul className="divide-y divide-border">
            {list.rows.map((row) => {
              const name = row.displayName || row.customerId;
              const due = row.dueInPaise > 0;
              const sub = due
                ? dueForLabel(row.dueSince)
                : row.lastOrderAt
                  ? `Last purchase ${DAY.format(row.lastOrderAt)}`
                  : "No purchases yet";
              const reminder =
                due && collecting
                  ? whatsAppLink(
                      row.whatsappPhone || row.phone,
                      buildKhataReminderText({
                        shopName: SHOP,
                        shopPhone: STORE_CONTACT.phone,
                        customerName: row.displayName,
                        dueInPaise: row.dueInPaise,
                      }),
                    )
                  : null;
              return (
                <li key={row.customerId} className="flex items-center">
                  <Link
                    href={`/admin/khatabook/${row.customerId}`}
                    className="group flex min-w-0 flex-1 items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
                  >
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold"
                    >
                      {name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{name}</p>
                      <p className="truncate text-xs text-muted-foreground lg:hidden">
                        {(due ? [sub] : [row.phone, sub]).filter(Boolean).join(" · ")}
                      </p>
                    </div>
                    <span className="hidden w-32 shrink-0 text-sm text-muted-foreground tabular-nums lg:block">{row.phone ?? "—"}</span>
                    <span className="hidden w-40 shrink-0 text-sm text-muted-foreground lg:block">
                      {due
                        ? row.dueSince
                          ? `${DAY.format(row.dueSince)} (${daysSince(row.dueSince)} days)`
                          : "—"
                        : row.lastOrderAt
                          ? DAY.format(row.lastOrderAt)
                          : "—"}
                    </span>
                    <div className="flex shrink-0 flex-col items-end text-right lg:w-28">
                      <span className={due ? "text-sm font-semibold tabular-nums text-amber-500" : "text-sm text-muted-foreground"}>
                        {due ? formatPaise(row.dueInPaise) : "All paid"}
                      </span>
                      <span className="text-xs text-muted-foreground">{due ? "Lena hai" : "Hisaab barabar"}</span>
                    </div>
                    {!reminder && (
                      <ChevronRight className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    )}
                  </Link>
                  {reminder && (
                    <a
                      href={reminder}
                      target="_blank"
                      rel="noopener noreferrer"
                      aria-label={`Send WhatsApp reminder to ${name}`}
                      className="mr-2 flex size-11 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted/60 hover:text-foreground"
                    >
                      <BellRing className="size-5" aria-hidden />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
          </div>

          <AdminPagination
            basePath="/admin/khatabook"
            itemLabel="customer"
            page={list.page}
            totalPages={list.totalPages}
            totalCount={list.totalCount}
            pageSize={list.pageSize}
          />
        </>
      )}
    </div>
  );
}
