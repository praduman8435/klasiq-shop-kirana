import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { getSupplierCreditDetail } from "@/server/queries/admin/supplier-credits";

type PageProps = { params: Promise<{ id: string; creditId: string }> };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

const CREDIT_REASON_LABEL: Record<string, string> = {
  SUPPLIER_RETURN: "Supplier return",
  OVERPAYMENT: "Overpayment",
  PRICE_ADJUSTMENT: "Price adjustment",
  QUALITY_ADJUSTMENT: "Quality adjustment",
  COMMERCIAL_ADJUSTMENT: "Commercial adjustment",
  OTHER: "Other",
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, creditId } = await params;
  const credit = await getSupplierCreditDetail(id, creditId);
  return { title: credit ? `Credit #${credit.creditNumber}` : "Supplier Credit" };
}

export default async function SupplierCreditDetailPage({ params }: PageProps) {
  const { id, creditId } = await params;
  const credit = await getSupplierCreditDetail(id, creditId);
  if (!credit) notFound();

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/admin/suppliers/${id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {credit.supplier.name}
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Credit #{credit.creditNumber}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {DATE_FORMATTER.format(credit.creditDate)} · {credit.supplier.name}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Financial summary</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
            <div>
              <dt className="text-xs text-muted-foreground">Credit amount</dt>
              <dd className="mt-0.5 text-lg font-semibold">{formatPaise(credit.amountInPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Allocated</dt>
              <dd className="mt-0.5 font-medium">{formatPaise(credit.allocatedInPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Refunded</dt>
              <dd className="mt-0.5 font-medium">{formatPaise(credit.refundedInPaise)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Unallocated</dt>
              <dd className="mt-0.5 font-semibold text-sky-600 dark:text-sky-400">{formatPaise(credit.unallocatedInPaise)}</dd>
            </div>
          </dl>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-border pt-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Reason</dt>
              <dd className="mt-0.5 font-medium">{CREDIT_REASON_LABEL[credit.reason] ?? credit.reason}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd className="mt-0.5 font-medium">{credit.reference || "—"}</dd>
            </div>
            {credit.sourceReturn && (
              <div>
                <dt className="text-xs text-muted-foreground">Linked supplier return</dt>
                <dd className="mt-0.5 font-medium">
                  <Link href={`/admin/suppliers/${id}/purchases`} className="hover:underline">
                    #{credit.sourceReturn.returnNumber}
                  </Link>
                </dd>
              </div>
            )}
            {credit.notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="mt-0.5">{credit.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Allocation history</h2>
          {credit.allocations.length === 0 ? (
            <div className="rounded-lg border border-dashed border-border p-4 text-center">
              <p className="text-sm text-muted-foreground">Not allocated to any purchase — kept as unallocated credit.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {credit.allocations.map((allocation) => (
                <div key={allocation.id} className="rounded-lg border border-border bg-card p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-semibold">
                        Purchase — {DATE_FORMATTER.format(allocation.purchase.purchaseDate)}
                        {allocation.purchase.reference ? ` · ${allocation.purchase.reference}` : ""}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">Purchase total {formatPaise(allocation.purchase.totalInPaise)}</p>
                    </div>
                    <span className="shrink-0 text-sm font-semibold">{formatPaise(allocation.amountInPaise)}</span>
                  </div>
                  <p className="mt-2 text-xs text-muted-foreground">
                    Purchase outstanding after allocation:{" "}
                    <span className={allocation.purchaseOutstandingAfterInPaise > 0 ? "font-medium text-amber-600 dark:text-amber-400" : "font-medium text-emerald-600 dark:text-emerald-400"}>
                      {formatPaise(Math.max(0, allocation.purchaseOutstandingAfterInPaise))}
                    </span>
                  </p>
                </div>
              ))}
            </div>
          )}
        </section>

        {credit.refunds.length > 0 && (
          <section>
            <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Refunds drawn from this credit</h2>
            <div className="rounded-lg border border-border bg-card">
              <ul className="divide-y divide-border">
                {credit.refunds.map((refund) => (
                  <li key={refund.id}>
                    <Link
                      href={`/admin/suppliers/${id}/refunds/${refund.id}`}
                      className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                    >
                      <span className="text-sm font-medium">#{refund.refundNumber}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold">{formatPaise(refund.amountInPaise)}</span>
                        <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <section className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Audit</h2>
          <p className="text-sm">
            <span className="text-muted-foreground">Created by </span>
            <span className="font-medium">{credit.createdByAdminUser?.name ?? "—"}</span>
          </p>
        </section>
      </div>
    </div>
  );
}
