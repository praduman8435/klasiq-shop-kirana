import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SupplierBalanceCell } from "@/components/admin/supplier-balance";
import { SupplierSearch } from "@/components/admin/supplier-search";
import { formatPaise } from "@/lib/money";
import { supplierListParamsSchema } from "@/lib/validation/admin-suppliers";
import { getSupplierList, getSupplierOverview } from "@/server/queries/admin/supplier-balances";

export const metadata: Metadata = { title: "Suppliers" };

type PageProps = { searchParams: Promise<{ q?: string; page?: string; filter?: string }> };

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });
const MONTH = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long" });

/**
 * Suppliers, the way a shopkeeper keeps them in a khata: who you owe
 * and how much, the biggest dues first. Tap a supplier for their page
 * (bill, pay, call, WhatsApp statement).
 */
export default async function AdminSuppliersPage({ searchParams }: PageProps) {
  const params = supplierListParamsSchema.parse(await searchParams);
  const [overview, list] = await Promise.all([
    getSupplierOverview(),
    getSupplierList({ query: params.q, filter: params.filter, page: params.page }),
  ]);
  const searching = Boolean(params.q) || params.filter !== "ALL";

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Suppliers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Wholesalers you buy from</p>
        </div>
        <Button render={<Link href="/admin/suppliers/new" />} nativeButton={false} className="h-10">
          <Plus className="size-4" aria-hidden />
          Add supplier
        </Button>
      </div>

      <section aria-label="Summary" className="rounded-xl border border-border bg-card">
        <div className="flex items-end justify-between gap-4 px-4 pt-4 pb-3 sm:px-5">
          <div>
            <p className="text-sm text-muted-foreground">You owe · Dena hai</p>
            <p
              className={
                overview.totalOwedInPaise > 0
                  ? "mt-1 text-3xl font-semibold tabular-nums text-amber-500"
                  : "mt-1 text-3xl font-semibold tabular-nums"
              }
            >
              {formatPaise(overview.totalOwedInPaise)}
            </p>
          </div>
          <p className="pb-1 text-right text-sm text-muted-foreground">
            {overview.suppliersOwedCount === 0
              ? "All suppliers settled"
              : `to ${overview.suppliersOwedCount} supplier${overview.suppliersOwedCount === 1 ? "" : "s"}`}
          </p>
        </div>
        <div className="flex flex-wrap gap-x-6 gap-y-1 border-t border-border px-4 py-2.5 text-sm sm:px-5">
          <span className="text-muted-foreground">{MONTH.format(new Date())}</span>
          <span>
            <span className="text-muted-foreground">Bought </span>
            <span className="font-medium tabular-nums">{formatPaise(overview.boughtThisMonthInPaise)}</span>
          </span>
          <span>
            <span className="text-muted-foreground">Paid </span>
            <span className="font-medium tabular-nums">{formatPaise(overview.paidThisMonthInPaise)}</span>
          </span>
        </div>
      </section>

      <SupplierSearch activeFilter={params.filter} />

      {list.rows.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium">
            {params.q
              ? `No supplier matches "${params.q}"`
              : params.filter === "TO_PAY"
                ? "Nothing to pay right now"
                : params.filter === "INACTIVE"
                  ? "No inactive suppliers"
                  : "No suppliers yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {searching
              ? "Try another name, phone number or city."
              : "Add the wholesalers you buy from. Then note each bill and payment in a few taps, and always know how much you owe."}
          </p>
          {!searching && (
            <Button render={<Link href="/admin/suppliers/new" />} nativeButton={false} className="mt-4 h-10">
              <Plus className="size-4" aria-hidden />
              Add your first supplier
            </Button>
          )}
        </div>
      ) : (
        <>
          <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
            {list.rows.map((supplier) => {
              const sub = [
                supplier.businessName !== supplier.name ? supplier.businessName : null,
                supplier.city,
                supplier.lastActivityAt ? `Last entry ${DAY.format(supplier.lastActivityAt)}` : null,
              ]
                .filter(Boolean)
                .join(" · ");
              return (
                <li key={supplier.id}>
                  <Link
                    href={`/admin/suppliers/${supplier.id}`}
                    className="group flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:px-5"
                  >
                    <span
                      aria-hidden
                      className="flex size-10 shrink-0 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-foreground"
                    >
                      {supplier.name.trim().charAt(0).toUpperCase()}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{supplier.name}</p>
                      <p className="truncate text-xs text-muted-foreground">
                        {sub || "No entries yet"}
                      </p>
                    </div>
                    <SupplierBalanceCell netInPaise={supplier.netInPaise} />
                    <ChevronRight
                      className="size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>

          <AdminPagination
            basePath="/admin/suppliers"
            itemLabel="supplier"
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
