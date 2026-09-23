import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SupplierSearch } from "@/components/admin/supplier-search";
import { adminSupplierFiltersSchema } from "@/lib/validation/admin-suppliers";
import { getSupplierDirectory } from "@/server/queries/admin/suppliers";

export const metadata: Metadata = { title: "Suppliers" };

type PageProps = { searchParams: Promise<{ q?: string; page?: string; filter?: string }> };

export default async function AdminSuppliersPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const parsed = adminSupplierFiltersSchema.safeParse({ q: query.q, page: query.page, filter: query.filter });
  const { q, page, filter } = parsed.success ? parsed.data : { q: undefined, page: 1, filter: "ALL" as const };

  const directory = await getSupplierDirectory({ query: q, filter, page });
  const { suppliers, totalCount, totalPages, pageSize } = directory;
  const hasActiveFilters = Boolean(q) || filter !== "ALL";

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Suppliers</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Wholesalers and supplier accounts</p>
        </div>
        <Button render={<Link href="/admin/suppliers/new" />} nativeButton={false} className="h-9">
          <Plus className="size-4" aria-hidden />
          Add Supplier
        </Button>
      </div>

      <SupplierSearch activeFilter={filter} />

      <div className="mt-4 mb-2">
        <p className="text-sm text-muted-foreground">
          {q ? (
            <>
              {totalCount} supplier{totalCount === 1 ? "" : "s"} matching &quot;{q}&quot;
            </>
          ) : (
            <>
              {totalCount} supplier{totalCount === 1 ? "" : "s"}
            </>
          )}
        </p>
      </div>

      {suppliers.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {q
              ? `No suppliers found for "${q}"`
              : hasActiveFilters
                ? "No suppliers match this filter"
                : "No suppliers yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {q
              ? "Try another name, business name, or mobile number."
              : hasActiveFilters
                ? "Try a different filter or view all suppliers."
                : "Add your first supplier to start tracking wholesale purchases."}
          </p>
          {!hasActiveFilters && (
            <Button render={<Link href="/admin/suppliers/new" />} nativeButton={false} className="mt-4 h-9">
              <Plus className="size-4" aria-hidden />
              Add Supplier
            </Button>
          )}
        </div>
      ) : (
        <>
          <div className="rounded-lg border border-border bg-card">
            <div className="hidden items-center gap-4 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:flex sm:px-5">
              <span className="flex-1">Supplier</span>
              <span className="w-32">Mobile</span>
              <span className="w-28">City</span>
              <span className="w-20">Status</span>
              <span className="w-4" />
            </div>
            <ul className="divide-y divide-border">
              {suppliers.map((supplier) => (
                <li key={supplier.id}>
                  <Link
                    href={`/admin/suppliers/${supplier.id}`}
                    className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">{supplier.name}</p>
                      {supplier.businessName && supplier.businessName !== supplier.name && (
                        <p className="truncate text-xs text-muted-foreground">{supplier.businessName}</p>
                      )}
                    </div>

                    {/* Mobile — compact stacked block. */}
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:hidden">
                      {supplier.phone && <span>{supplier.phone}</span>}
                      {supplier.city && (
                        <>
                          {supplier.phone && <span aria-hidden>·</span>}
                          <span>{supplier.city}</span>
                        </>
                      )}
                    </div>
                    <div className="sm:hidden">
                      {!supplier.isActive && (
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </div>

                    {/* Desktop — table-like columns. */}
                    <span className="hidden w-32 shrink-0 text-sm text-muted-foreground sm:block">
                      {supplier.phone ?? "—"}
                    </span>
                    <span className="hidden w-28 shrink-0 text-sm text-muted-foreground sm:block">
                      {supplier.city ?? "—"}
                    </span>
                    <span className="hidden w-20 shrink-0 sm:block">
                      {supplier.isActive ? (
                        <span className="text-sm text-muted-foreground">Active</span>
                      ) : (
                        <Badge variant="outline" className="border-border text-muted-foreground">
                          Inactive
                        </Badge>
                      )}
                    </span>
                    <ChevronRight
                      className="hidden size-4 shrink-0 text-muted-foreground/60 transition-transform group-hover:translate-x-0.5 sm:block"
                      aria-hidden
                    />
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <AdminPagination
            basePath="/admin/suppliers"
            itemLabel="supplier"
            page={page}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={pageSize}
          />
        </>
      )}
    </div>
  );
}
