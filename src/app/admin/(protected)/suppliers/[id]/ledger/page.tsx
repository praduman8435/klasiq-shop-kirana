import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SupplierLedgerFilters } from "@/components/admin/supplier-ledger-filters";
import { SupplierLedgerPrintButton } from "@/components/admin/supplier-ledger-print-button";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { resolveLedgerDateRange } from "@/lib/supplier-ledger-date-range";
import { adminSupplierLedgerFiltersSchema } from "@/lib/validation/admin-supplier-ledger";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";
import { getSupplierLedger, getSupplierLedgerSummary } from "@/server/queries/admin/supplier-ledger";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ datePreset?: string; from?: string; to?: string; types?: string; q?: string; ledgerPage?: string }>;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });
const RANGE_LABEL_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

const EVENT_TYPE_LABEL: Record<string, string> = {
  PURCHASE: "Purchase",
  PAYMENT: "Payment",
  CREDIT: "Supplier Credit",
  REFUND: "Refund",
};

const EVENT_TYPE_BADGE_CLASS: Record<string, string> = {
  PURCHASE: "text-foreground",
  PAYMENT: "text-emerald-600 dark:text-emerald-400",
  CREDIT: "text-sky-600 dark:text-sky-400",
  REFUND: "text-sky-600 dark:text-sky-400",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  return { title: supplier ? `Ledger — ${supplier.name}` : "Supplier Ledger" };
}

export default async function SupplierLedgerPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const rawSearchParams = await searchParams;
  const supplier = await getAdminSupplierById(id);
  if (!supplier) notFound();

  const parsed = adminSupplierLedgerFiltersSchema.parse({
    datePreset: rawSearchParams.datePreset,
    from: rawSearchParams.from,
    to: rawSearchParams.to,
    types: rawSearchParams.types,
    q: rawSearchParams.q,
    ledgerPage: rawSearchParams.ledgerPage,
  });

  const { from, to } = resolveLedgerDateRange(parsed.datePreset, { from: rawSearchParams.from, to: rawSearchParams.to }, new Date());

  const [summary, ledger] = await Promise.all([
    getSupplierLedgerSummary(id),
    getSupplierLedger({
      supplierId: id,
      from,
      to,
      types: parsed.types.length > 0 ? parsed.types : undefined,
      query: parsed.q,
      page: parsed.ledgerPage,
    }),
  ]);

  const basePath = `/admin/suppliers/${id}/ledger`;
  const hasAnyFilters = parsed.datePreset !== "ALL" || parsed.types.length > 0 || Boolean(parsed.q);
  const rangeLabel =
    from || to
      ? `${from ? RANGE_LABEL_FORMATTER.format(from) : "Start"} – ${to ? RANGE_LABEL_FORMATTER.format(to) : "Today"}`
      : "All time";

  return (
    <div className="print:bg-white">
      <div className="mb-5 flex flex-col gap-3 print:hidden">
        <Link
          href={`/admin/suppliers/${id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {supplier.name}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">Supplier Ledger</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {supplier.name}
              {supplier.phone ? ` · ${supplier.phone}` : ""}
              {supplier.city ? ` · ${supplier.city}` : ""}
            </p>
          </div>
          <SupplierLedgerPrintButton />
        </div>
      </div>

      {/* Print-only header — hidden on screen, shown only inside the
          printed document (Section 22: supplier name, date range). */}
      <div className="hidden print:mb-4 print:block print:text-neutral-900">
        <p className="text-lg font-semibold">{supplier.name}</p>
        <p className="text-sm text-neutral-600">Account Statement · {rangeLabel}</p>
      </div>

      {!summary.hasAnyActivity ? (
        <div className="rounded-lg border border-dashed border-border p-8 text-center">
          <p className="text-sm font-medium">No financial activity yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Purchases, payments, credits and refunds will appear here.</p>
        </div>
      ) : (
        <>
          <section className="mb-6 print:mb-4">
            <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-5 print:grid-cols-5 print:border-neutral-300 print:bg-neutral-300">
              <div className="bg-card px-4 py-3 print:bg-white">
                <p className="text-xs text-muted-foreground print:text-neutral-500">Purchases</p>
                <p className="mt-0.5 text-lg font-semibold print:text-neutral-900">{formatPaise(summary.totalPurchasesInPaise)}</p>
              </div>
              <div className="bg-card px-4 py-3 print:bg-white">
                <p className="text-xs text-muted-foreground print:text-neutral-500">Payments</p>
                <p className="mt-0.5 text-lg font-semibold print:text-neutral-900">{formatPaise(summary.totalPaymentsInPaise)}</p>
              </div>
              <div className="bg-card px-4 py-3 print:bg-white">
                <p className="text-xs text-muted-foreground print:text-neutral-500">Credits Applied</p>
                <p className="mt-0.5 text-lg font-semibold print:text-neutral-900">{formatPaise(summary.totalCreditsInPaise)}</p>
              </div>
              <div className="bg-card px-4 py-3 print:bg-white">
                <p className="text-xs text-muted-foreground print:text-neutral-500">Refunds</p>
                <p className="mt-0.5 text-lg font-semibold print:text-neutral-900">{formatPaise(summary.totalRefundsInPaise)}</p>
              </div>
              <div className="bg-card px-4 py-3 print:bg-white">
                <p className="text-xs text-muted-foreground print:text-neutral-500">Current Outstanding</p>
                <p
                  className={cn(
                    "mt-0.5 text-lg font-semibold print:text-neutral-900",
                    summary.purchaseOutstandingInPaise > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400",
                  )}
                >
                  {formatPaise(Math.max(0, summary.purchaseOutstandingInPaise))}
                </p>
              </div>
            </div>
          </section>

          <div className="mb-4 print:hidden">
            <SupplierLedgerFilters basePath={basePath} />
          </div>

          {ledger.events.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-8 text-center">
              <p className="text-sm font-medium">No ledger entries found</p>
              <p className="mt-1 text-sm text-muted-foreground">Try changing your search or filters.</p>
              {hasAnyFilters && (
                <Link href={basePath} className="mt-3 inline-block text-sm font-medium text-primary hover:underline">
                  Reset filters
                </Link>
              )}
            </div>
          ) : (
            <>
              {from && (
                <p className="mb-2 text-xs text-muted-foreground print:text-neutral-500">
                  Opening balance ({RANGE_LABEL_FORMATTER.format(from)}): <span className="font-medium text-foreground print:text-neutral-900">{formatPaise(ledger.openingBalanceInPaise)}</span>
                </p>
              )}

              {/* Desktop — accounting-style table. */}
              <div className="hidden overflow-x-auto rounded-lg border border-border bg-card sm:block print:block print:overflow-visible print:rounded-none print:border-neutral-300 print:bg-white">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-xs text-muted-foreground print:border-neutral-300 print:text-neutral-500">
                      <th className="px-4 py-2 font-medium">Date</th>
                      <th className="px-4 py-2 font-medium">Type</th>
                      <th className="px-4 py-2 font-medium">Reference</th>
                      <th className="px-4 py-2 font-medium">Description</th>
                      <th className="px-4 py-2 text-right font-medium">Debit</th>
                      <th className="px-4 py-2 text-right font-medium">Credit</th>
                      <th className="px-4 py-2 text-right font-medium">Balance</th>
                      <th className="w-8 px-2 py-2 print:hidden" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border print:divide-neutral-200">
                    {ledger.events.map((event) => (
                      <tr key={event.key} className="hover:bg-muted/40 print:hover:bg-transparent">
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground print:text-neutral-600">{DATE_FORMATTER.format(event.date)}</td>
                        <td className={cn("px-4 py-2.5 whitespace-nowrap font-medium print:text-neutral-900", EVENT_TYPE_BADGE_CLASS[event.type])}>
                          {EVENT_TYPE_LABEL[event.type] ?? event.type}
                        </td>
                        <td className="px-4 py-2.5 whitespace-nowrap text-muted-foreground print:text-neutral-600">{event.reference || "—"}</td>
                        <td className="max-w-64 truncate px-4 py-2.5 print:text-neutral-900">{event.description}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums print:text-neutral-900">{event.debitInPaise > 0 ? formatPaise(event.debitInPaise) : "—"}</td>
                        <td className="px-4 py-2.5 text-right tabular-nums print:text-neutral-900">{event.creditInPaise > 0 ? formatPaise(event.creditInPaise) : "—"}</td>
                        <td className="px-4 py-2.5 text-right font-medium tabular-nums print:text-neutral-900">{formatPaise(event.balanceInPaise)}</td>
                        <td className="px-2 py-2.5 print:hidden">
                          <Link href={event.href} aria-label={`View ${EVENT_TYPE_LABEL[event.type] ?? event.type} details`} className="flex items-center justify-center text-muted-foreground hover:text-foreground">
                            <ChevronRight className="size-4" aria-hidden />
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Mobile — compact stacked rows, never a squeezed table. */}
              <div className="rounded-lg border border-border bg-card sm:hidden print:hidden">
                <ul className="divide-y divide-border">
                  {ledger.events.map((event) => (
                    <li key={event.key}>
                      <Link href={event.href} className="flex flex-col gap-1 px-4 py-3 hover:bg-muted/40">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs text-muted-foreground">{DATE_FORMATTER.format(event.date)}</span>
                          <span className={cn("text-xs font-medium", EVENT_TYPE_BADGE_CLASS[event.type])}>{EVENT_TYPE_LABEL[event.type] ?? event.type}</span>
                        </div>
                        <p className="truncate text-sm font-medium">{event.description}</p>
                        {event.reference && <p className="truncate text-xs text-muted-foreground">{event.reference}</p>}
                        <div className="mt-1 flex items-center justify-between gap-2 text-sm">
                          <span className="text-muted-foreground">
                            {event.debitInPaise > 0 && <>Debit {formatPaise(event.debitInPaise)}</>}
                            {event.creditInPaise > 0 && <>Credit {formatPaise(event.creditInPaise)}</>}
                          </span>
                          <span className="flex items-center gap-1 font-medium">
                            {formatPaise(event.balanceInPaise)}
                            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                          </span>
                        </div>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="print:hidden">
                <AdminPagination
                  basePath={basePath}
                  itemLabel="entry"
                  paramName="ledgerPage"
                  page={ledger.page}
                  totalPages={ledger.totalPages}
                  totalCount={ledger.totalCount}
                  pageSize={ledger.pageSize}
                />
              </div>

              <p className="mt-3 hidden text-right text-sm font-medium print:block print:text-neutral-900">
                Closing balance: {formatPaise(ledger.closingBalanceInPaise)}
              </p>
            </>
          )}
        </>
      )}
    </div>
  );
}
