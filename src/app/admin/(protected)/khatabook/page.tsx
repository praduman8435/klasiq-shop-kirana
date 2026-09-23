import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { KhataBookPagination } from "@/components/admin/khatabook-pagination";
import { KhataBookSearch } from "@/components/admin/khatabook-search";
import { formatPaise } from "@/lib/money";
import { khataBookSearchSchema } from "@/lib/validation/admin-khatabook";
import { getKhataBookCustomerDirectory, type KhataBookCustomerListRow } from "@/server/queries/admin/khatabook";

export const metadata: Metadata = { title: "KhataBook" };

type PageProps = { searchParams: Promise<{ q?: string; page?: string; filter?: string }> };

function formatLastPurchase(date: Date | null): string {
  return date ? date.toLocaleDateString("en-IN", { dateStyle: "medium" }) : "Never";
}

export default async function KhataBookPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const parsed = khataBookSearchSchema.safeParse({ q: query.q, page: query.page, filter: query.filter });
  const { q, page, filter } = parsed.success ? parsed.data : { q: undefined, page: 1, filter: "ALL" as const };

  const directory = await getKhataBookCustomerDirectory({ query: q, filter, page });
  const { customers, totalCount, totalPages, pageSize } = directory;
  const hasActiveFilters = Boolean(q) || filter !== "ALL";

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">KhataBook</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Customer accounts and payment history</p>
      </div>

      <KhataBookSearch activeFilter={filter} />

      <div className="mt-4 mb-2">
        <p className="text-sm text-muted-foreground">
          {q ? (
            <>
              {totalCount} customer{totalCount === 1 ? "" : "s"} matching &quot;{q}&quot;
            </>
          ) : (
            <>
              {totalCount} customer{totalCount === 1 ? "" : "s"}
            </>
          )}
        </p>
      </div>

      {customers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {q ? `No customers found for "${q}"` : hasActiveFilters ? "No customers match this filter" : "No customers yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? "Try searching by name, mobile number, or Customer ID."
              : hasActiveFilters
                ? "Try a different filter or view all customers."
                : "Customers appear here once they've placed an order or been added at the counter."}
          </p>
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card">
            {/* Desktop header row */}
            <div className="hidden items-center gap-4 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:flex sm:px-5">
              <span className="flex-1">Customer</span>
              <span className="w-32">Mobile</span>
              <span className="w-28">Last purchase</span>
              <span className="w-24 text-right">Outstanding</span>
              <span className="w-28 text-right">Lifetime</span>
              <span className="w-4" />
            </div>
            <ul className="divide-y divide-border">
              {customers.map((customer) => (
                <CustomerRow key={customer.id} customer={customer} />
              ))}
            </ul>
          </div>

          <KhataBookPagination page={page} totalPages={totalPages} totalCount={totalCount} pageSize={pageSize} />
        </>
      )}
    </div>
  );
}

function CustomerRow({ customer }: { customer: KhataBookCustomerListRow }) {
  const hasOutstanding = customer.outstandingInPaise > 0;

  return (
    <li>
      <Link
        href={`/admin/khatabook/${customer.customerId}`}
        className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4 sm:px-5"
      >
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">{customer.displayName || customer.customerId}</p>
          <p className="font-mono text-xs text-muted-foreground">{customer.customerId}</p>
        </div>

        {/* Mobile — compact stacked block. */}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden">
          <span>{customer.primaryPhone ?? "—"}</span>
          <span aria-hidden>·</span>
          <span>Last purchase {formatLastPurchase(customer.lastOrderAt)}</span>
        </div>
        <div className="flex items-center gap-3 text-xs sm:hidden">
          <span className={hasOutstanding ? "font-semibold text-amber-500" : "text-muted-foreground"}>
            Outstanding {formatPaise(customer.outstandingInPaise)}
          </span>
          <span aria-hidden className="text-muted-foreground">·</span>
          <span className="font-medium text-foreground">
            Lifetime {formatPaise(customer.lifetimePurchaseInPaise)}
          </span>
        </div>

        {/* Desktop — table-like columns. */}
        <span className="hidden w-32 shrink-0 text-sm text-muted-foreground sm:block">
          {customer.primaryPhone ?? "—"}
        </span>
        <span className="hidden w-28 shrink-0 text-sm text-muted-foreground sm:block">
          {formatLastPurchase(customer.lastOrderAt)}
        </span>
        <span
          className={
            hasOutstanding
              ? "hidden w-24 shrink-0 text-right text-sm font-semibold text-amber-500 sm:block"
              : "hidden w-24 shrink-0 text-right text-sm text-muted-foreground sm:block"
          }
        >
          {formatPaise(customer.outstandingInPaise)}
        </span>
        <span className="hidden w-28 shrink-0 text-right text-sm font-medium sm:block">
          {formatPaise(customer.lifetimePurchaseInPaise)}
        </span>
        <ChevronRight
          className="hidden size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block"
          aria-hidden
        />
      </Link>
    </li>
  );
}
