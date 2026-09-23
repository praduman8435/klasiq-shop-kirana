import Link from "next/link";
import type { Metadata } from "next";
import { ChevronRight } from "lucide-react";
import { ReturnFilters } from "@/components/admin/return-filters";
import { ReturnStatusBadge, ReturnTypeBadge } from "@/components/admin/return-status-badge";
import { RETURN_REQUEST_STATUS_LABEL } from "@/lib/return-lifecycle";
import { adminReturnFiltersSchema } from "@/lib/validation/admin-returns";
import { getAdminReturnRequests } from "@/server/queries/admin/returns";
import { getAdminSchools } from "@/server/queries/admin/schools";

export const metadata: Metadata = { title: "Returns" };

type PageProps = {
  searchParams: Promise<{
    status?: string;
    type?: string;
    schoolId?: string;
    dateFrom?: string;
    dateTo?: string;
    q?: string;
  }>;
};

export default async function AdminReturnsPage({ searchParams }: PageProps) {
  const query = await searchParams;
  const parsed = adminReturnFiltersSchema.safeParse({
    status: query.status,
    type: query.type,
    schoolId: query.schoolId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    query: query.q,
  });
  const filters = parsed.success ? parsed.data : {};

  const [requests, schools] = await Promise.all([getAdminReturnRequests(filters), getAdminSchools()]);
  // `Object.keys` alone over-counts here: zod's parsed output keeps every
  // optional key even when its value is `undefined`, so it would report
  // "active" on a completely filter-free page load (same fix already
  // applied to Orders/Products/Inventory).
  const hasActiveFilters = Object.values(filters).some(Boolean);

  function formatTimestamp(date: Date): string {
    const day = date.toLocaleDateString("en-IN", { day: "2-digit", month: "short", year: "numeric" });
    const time = date.toLocaleTimeString("en-IN", { hour: "numeric", minute: "2-digit", hour12: true });
    return `${day} · ${time}`;
  }

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Returns</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {requests.length} request{requests.length === 1 ? "" : "s"}
          </p>
        </div>
        <Link
          href="/admin/returns/new"
          className="flex h-9 w-fit items-center justify-center rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          New Walk-in Return
        </Link>
      </div>

      <ReturnFilters schools={schools.map((s) => ({ id: s.id, name: s.name }))} />

      {requests.length === 0 ? (
        <div className="mt-6 rounded-lg border border-dashed border-border p-10 text-center">
          <p className="text-sm font-medium text-foreground">
            {hasActiveFilters ? "No returns match your search" : "No return requests yet"}
          </p>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasActiveFilters
              ? "Try a different search term or clear the status/type/school filters."
              : "Return and exchange requests will show up here."}
          </p>
        </div>
      ) : (
        <div className="mt-4 rounded-lg border border-border bg-card">
          <ul className="divide-y divide-border">
            {requests.map((request) => (
              <li key={request.id}>
                <Link
                  href={`/admin/returns/${request.returnNumber}`}
                  className="group flex flex-col gap-2 px-4 py-3 transition-colors hover:bg-muted/40 focus-visible:bg-muted/40 focus-visible:outline-none sm:flex-row sm:items-center sm:gap-4 sm:px-5"
                >
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-sm font-medium">{request.returnNumber}</p>
                    <p className="mt-0.5 truncate text-sm text-muted-foreground">
                      {request.customer.displayName || request.customer.customerId}
                      {" · "}
                      Order {request.order.orderNumber}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {request.order.school ? `${request.order.school.name} · ` : ""}
                      {formatTimestamp(request.createdAt)}
                      {" · "}
                      {request.items.length} item{request.items.length === 1 ? "" : "s"}
                    </p>
                  </div>

                  {/* Mobile — plain quiet text rather than a badge
                      cluster, mirroring the Orders list's own mobile
                      row treatment. */}
                  <div className="flex flex-wrap items-center gap-1.5 text-xs sm:hidden">
                    <span className="font-medium text-foreground">
                      {RETURN_REQUEST_STATUS_LABEL[request.status]}
                    </span>
                    <span aria-hidden className="text-muted-foreground">·</span>
                    <span className="text-muted-foreground">
                      {request.type === "EXCHANGE" ? "Exchange" : "Return"}
                    </span>
                    {request.overriddenAt && (
                      <>
                        <span aria-hidden className="text-muted-foreground">·</span>
                        <span className="text-amber-500">Override</span>
                      </>
                    )}
                  </div>

                  <div className="hidden shrink-0 items-center gap-4 sm:flex">
                    <div className="flex flex-wrap justify-end gap-1.5">
                      <ReturnTypeBadge type={request.type} className="opacity-70" />
                      <ReturnStatusBadge status={request.status} />
                      {request.overriddenAt && (
                        <span className="rounded-full bg-amber-500/15 px-2.5 py-1 text-xs font-medium text-amber-500">
                          Override
                        </span>
                      )}
                    </div>
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
