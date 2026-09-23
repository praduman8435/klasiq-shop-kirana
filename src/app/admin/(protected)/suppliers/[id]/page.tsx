import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Plus, PlusCircle, ScrollText, Wallet } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AdminPagination } from "@/components/admin/admin-pagination";
import { SupplierForm } from "@/components/admin/supplier-form";
import { PAYMENT_METHOD_LABEL } from "@/components/admin/supplier-payment-detail";
import { cn } from "@/lib/utils";
import { formatPaise } from "@/lib/money";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";
import { getSupplierPurchaseHistory, getSupplierPurchaseSummary } from "@/server/queries/admin/supplier-purchases";
import { getSupplierPaymentHistory, getSupplierPaymentSummary } from "@/server/queries/admin/supplier-payments";
import { getReceivedUnitsByPurchaseIds, getSupplierRecentReceipts } from "@/server/queries/admin/supplier-purchase-receipts";
import { getSupplierRecentReturns } from "@/server/queries/admin/supplier-purchase-returns";
import { getSupplierCreditHistory, getSupplierCreditSummary } from "@/server/queries/admin/supplier-credits";
import { getSupplierRefundHistory } from "@/server/queries/admin/supplier-refunds";

const RETURN_REASON_LABEL: Record<string, string> = {
  DAMAGED: "Damaged",
  WRONG_ITEM: "Wrong item",
  WRONG_SIZE: "Wrong size",
  DEFECTIVE: "Defective",
  EXCESS_QUANTITY: "Excess quantity",
  QUALITY_ISSUE: "Quality issue",
  SUPPLIER_REQUEST: "Supplier request",
  OTHER: "Other",
};

const CREDIT_REASON_LABEL: Record<string, string> = {
  SUPPLIER_RETURN: "Supplier return",
  OVERPAYMENT: "Overpayment",
  PRICE_ADJUSTMENT: "Price adjustment",
  QUALITY_ADJUSTMENT: "Quality adjustment",
  COMMERCIAL_ADJUSTMENT: "Commercial adjustment",
  OTHER: "Other",
};

const REFUND_METHOD_LABEL: Record<string, string> = {
  CASH: "Cash",
  UPI: "UPI",
  BANK_TRANSFER: "Bank Transfer",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ page?: string; paymentsPage?: string; creditsPage?: string; refundsPage?: string }>;
};

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric" });

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  return { title: supplier?.name ?? "Supplier" };
}

export default async function AdminSupplierDetailPage({ params, searchParams }: PageProps) {
  const { id } = await params;
  const { page: pageParam, paymentsPage: paymentsPageParam, creditsPage: creditsPageParam, refundsPage: refundsPageParam } = await searchParams;
  const supplier = await getAdminSupplierById(id);
  if (!supplier) notFound();

  const page = Math.max(1, Number(pageParam) || 1);
  const paymentsPage = Math.max(1, Number(paymentsPageParam) || 1);
  const creditsPage = Math.max(1, Number(creditsPageParam) || 1);
  const refundsPage = Math.max(1, Number(refundsPageParam) || 1);
  const [
    purchaseSummary,
    purchaseHistory,
    paymentSummary,
    paymentHistory,
    recentReceipts,
    recentReturns,
    creditSummary,
    creditHistory,
    refundHistory,
  ] = await Promise.all([
    getSupplierPurchaseSummary(id),
    getSupplierPurchaseHistory({ supplierId: id, page }),
    getSupplierPaymentSummary(id),
    getSupplierPaymentHistory({ supplierId: id, page: paymentsPage }),
    getSupplierRecentReceipts(id),
    getSupplierRecentReturns(id),
    getSupplierCreditSummary(id),
    getSupplierCreditHistory({ supplierId: id, page: creditsPage }),
    getSupplierRefundHistory({ supplierId: id, page: refundsPage }),
  ]);
  const receivedUnitsByPurchaseId = await getReceivedUnitsByPurchaseIds(purchaseHistory.purchases.map((p) => p.id));

  return (
    // AdminShell establishes the dark scope + background for the whole
    // admin application; this page just renders directly into it.
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href="/admin/suppliers"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Suppliers
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">{supplier.name}</h1>
            {supplier.phone && <p className="mt-0.5 text-sm text-muted-foreground">{supplier.phone}</p>}
          </div>
          {!supplier.isActive && (
            <Badge variant="outline" className="border-border text-muted-foreground">
              Inactive
            </Badge>
          )}
        </div>
      </div>

      {/* Section 15 — reuses the exact same always-editable-form pattern
          Products/Schools already establish (no separate "Edit" toggle
          or view/edit mode split): this form IS the supplier's account
          view, pre-filled with its current values, "Save changes"
          persisting in place. */}
      <section>
        <h2 className="text-sm font-semibold">Supplier details</h2>
        <div className="mt-2 max-w-xl">
          <SupplierForm
            initial={{
              id: supplier.id,
              name: supplier.name,
              businessName: supplier.businessName ?? "",
              phone: supplier.phone ?? "",
              addressLine: supplier.addressLine ?? "",
              city: supplier.city ?? "",
              gstNumber: supplier.gstNumber ?? "",
              notes: supplier.notes ?? "",
              isActive: supplier.isActive,
            }}
          />
        </div>
      </section>

      {/* Phase 4 Part 3 — merges Part 2's purchase-only summary with real
          paid/outstanding figures now that Payments exist. Outstanding is
          NEVER an independently-entered number — it's always derived (see
          getSupplierPaymentSummary, src/server/queries/admin/supplier-payments.ts),
          so it can't drift. As of Phase 4 Part 6/7 that derivation is
          totalPurchases - totalPaidInPaise - creditsAppliedInPaise (Part 7
          fixed this function to net out allocated SupplierCredit rows too,
          matching the per-purchase math on Purchase Detail — see that
          function's own doc comment for the discovery/fix story). The
          UNALLOCATED-ADVANCE "Supplier Credit" concept below (Part 3's own,
          unrelated to the explicit SupplierCredit entity) is still shown as
          its OWN distinct line, never netted into Outstanding (brief: "Do
          NOT hide credit inside the outstanding number") — and only
          rendered at all when non-zero, same as the new Credits Applied
          line just below the grid. */}
      <section className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">Supplier summary</h2>
          <div className="flex flex-wrap items-center gap-2">
            {/* Phase 4 Part 7 — a VIEW action, not a financial mutation,
                so it deliberately doesn't take any of the four
                mutation colors (red/emerald/amber/secondary/sky) —
                placed first, nearest the summary it explains. */}
            <Button render={<Link href={`/admin/suppliers/${id}/ledger`} />} nativeButton={false} size="sm" variant="outline" className="h-8">
              <ScrollText className="size-3.5" aria-hidden />
              View Ledger
            </Button>
            <Button render={<Link href={`/admin/suppliers/${id}/purchases/new`} />} nativeButton={false} size="sm" variant="outline" className="h-8">
              <Plus className="size-3.5" aria-hidden />
              New Purchase
            </Button>
            <Button render={<Link href={`/admin/suppliers/${id}/payments/new`} />} nativeButton={false} size="sm" className="h-8">
              <Plus className="size-3.5" aria-hidden />
              Record Payment
            </Button>
            {/* Phase 4 Part 6 — Credit uses the neutral/secondary
                treatment, Refund the sky financial-secondary treatment;
                neither is red, emerald, or amber so all five supplier
                actions stay visually distinguishable at a glance. */}
            <Button render={<Link href={`/admin/suppliers/${id}/credits/new`} />} nativeButton={false} size="sm" variant="secondary" className="h-8">
              <PlusCircle className="size-3.5" aria-hidden />
              Record Credit
            </Button>
            <Button
              render={<Link href={`/admin/suppliers/${id}/refunds/new`} />}
              nativeButton={false}
              size="sm"
              className="h-8 bg-sky-600 text-white hover:bg-sky-600/90 dark:bg-sky-600 dark:hover:bg-sky-600/90"
            >
              <Wallet className="size-3.5" aria-hidden />
              Record Refund
            </Button>
          </div>
        </div>
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total Purchases</p>
            <p className="mt-0.5 text-lg font-semibold">{formatPaise(paymentSummary.totalPurchasesInPaise)}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Total Paid</p>
            <p className="mt-0.5 text-lg font-semibold">{formatPaise(paymentSummary.totalPaidInPaise)}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Outstanding</p>
            <p className={cn("mt-0.5 text-lg font-semibold", paymentSummary.outstandingInPaise > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400")}>
              {formatPaise(paymentSummary.outstandingInPaise)}
            </p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Purchase Count</p>
            <p className="mt-0.5 text-lg font-semibold">{purchaseSummary.purchaseCount}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Payments</p>
            <p className="mt-0.5 text-lg font-semibold">{paymentSummary.paymentCount}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Last Payment</p>
            <p className="mt-0.5 text-lg font-semibold">
              {paymentSummary.latestPaymentDate ? DATE_FORMATTER.format(paymentSummary.latestPaymentDate) : "—"}
            </p>
          </div>
        </div>
        {paymentSummary.creditsAppliedInPaise > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3">
            {/* Phase 4 Part 7 — the amount of SupplierCredit already
                allocated against purchases, shown as its own line so
                Outstanding's derivation (Total Purchases - Total Paid -
                Credits Applied) is fully visible rather than a number
                that silently absorbed credits with no visible trace. */}
            <p className="text-xs text-muted-foreground">Credits Applied</p>
            <p className="mt-0.5 text-lg font-semibold text-sky-600 dark:text-sky-400">{formatPaise(paymentSummary.creditsAppliedInPaise)}</p>
          </div>
        )}
        {paymentSummary.creditInPaise > 0 && (
          <div className="mt-3 rounded-lg border border-border bg-card px-4 py-3">
            {/* Phase 4 Part 6 — relabeled from "Supplier Credit" to
                "Unallocated Payment": this figure is Part 3's own
                concept (payments received but not yet allocated to a
                purchase), completely distinct from the explicit
                SupplierCredit entity this phase introduces. Reusing the
                same label for both would be genuinely confusing —
                "Supplier Credit" below now refers unambiguously to the
                new, explicit financial-credit record. */}
            <p className="text-xs text-muted-foreground">Unallocated Payment (advance)</p>
            <p className="mt-0.5 text-lg font-semibold text-sky-600 dark:text-sky-400">{formatPaise(paymentSummary.creditInPaise)}</p>
          </div>
        )}
      </section>

      {/* Phase 4 Part 6 — a compact SECOND metric strip rather than
          cramming 5 more cells into the summary grid above ("Do not
          overload the first viewport ... compact metric hierarchy").
          Supplier Credit / Refunds Received are the primary financial
          values here; Credit/Refund counts are the quieter secondary
          ones — same visual-weight convention the summary grid above
          already uses (large semibold vs. small muted label). */}
      <section className="mt-4">
        <div className="grid grid-cols-1 gap-px overflow-hidden rounded-lg border border-border bg-border sm:grid-cols-3">
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Supplier Credit</p>
            <p className="mt-0.5 text-lg font-semibold">{formatPaise(creditSummary.totalCreditedInPaise)}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Unallocated Credit</p>
            <p className={cn("mt-0.5 text-lg font-semibold", creditSummary.unallocatedCreditInPaise > 0 ? "text-sky-600 dark:text-sky-400" : "text-muted-foreground")}>
              {formatPaise(Math.max(0, creditSummary.unallocatedCreditInPaise))}
            </p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Refunds Received</p>
            <p className="mt-0.5 text-lg font-semibold">{formatPaise(refundHistory.totalAmountInPaise)}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Credit Count</p>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">{creditSummary.creditCount}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Refund Count</p>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">{refundHistory.totalCount}</p>
          </div>
          <div className="bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Last Credit</p>
            <p className="mt-0.5 text-sm font-medium text-muted-foreground">
              {creditSummary.latestCreditDate ? DATE_FORMATTER.format(creditSummary.latestCreditDate) : "—"}
            </p>
          </div>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Purchase history</h2>
        {purchaseHistory.purchases.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No purchases recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {purchaseHistory.purchases.map((purchase) => (
                <li key={purchase.id}>
                  <Link
                    href={`/admin/suppliers/${id}/purchases/${purchase.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{DATE_FORMATTER.format(purchase.purchaseDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {purchase.billCount} bill{purchase.billCount === 1 ? "" : "s"}
                        {purchase.reference ? ` · ${purchase.reference}` : ""}
                        {(() => {
                          const units = receivedUnitsByPurchaseId.get(purchase.id) ?? 0;
                          return units > 0 ? ` · Received ${units} units` : "";
                        })()}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold">{formatPaise(purchase.totalInPaise)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AdminPagination
          basePath={`/admin/suppliers/${id}`}
          itemLabel="purchase"
          page={purchaseHistory.page}
          totalPages={purchaseHistory.totalPages}
          totalCount={purchaseHistory.totalCount}
          pageSize={purchaseHistory.pageSize}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Payment history</h2>
        {paymentHistory.payments.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No payments recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {paymentHistory.payments.map((payment) => (
                <li key={payment.id}>
                  <Link
                    href={`/admin/suppliers/${id}/payments/${payment.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{DATE_FORMATTER.format(payment.paymentDate)}</p>
                      <p className="text-xs text-muted-foreground">
                        {PAYMENT_METHOD_LABEL[payment.paymentMethod] ?? payment.paymentMethod} · {payment.collectedByName}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatPaise(payment.amountInPaise)}</p>
                        {payment.unallocatedInPaise > 0 && (
                          <p className="text-xs text-sky-600 dark:text-sky-400">{formatPaise(payment.unallocatedInPaise)} unallocated</p>
                        )}
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AdminPagination
          basePath={`/admin/suppliers/${id}`}
          itemLabel="payment"
          paramName="paymentsPage"
          page={paymentHistory.page}
          totalPages={paymentHistory.totalPages}
          totalCount={paymentHistory.totalCount}
          pageSize={paymentHistory.pageSize}
        />
      </section>

      {/* Phase 4 Part 4 — deliberately just the last few receiving
          events across every purchase, not a full paginated history:
          "Do not overcrowd the page" (Part 16). Each row links to its
          own purchase, since a receipt only ever belongs to one. */}
      {recentReceipts.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Inventory / Receiving</h2>
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {recentReceipts.map((receipt) => (
                <li key={receipt.id}>
                  <Link
                    href={`/admin/suppliers/${id}/purchases/${receipt.purchaseId}/receive/${receipt.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <p className="text-sm font-medium">{DATE_FORMATTER.format(receipt.receivedAt)}</p>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">{receipt.totalUnits} units</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Phase 4 Part 5 — same "recent only, don't overcrowd" treatment
          as the receiving section above. Each row links to its own
          purchase, since a return only ever belongs to one. */}
      {recentReturns.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 text-sm font-semibold">Supplier Returns</h2>
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {recentReturns.map((supplierReturn) => (
                <li key={supplierReturn.id}>
                  <Link
                    href={`/admin/suppliers/${id}/purchases/${supplierReturn.purchaseId}/returns/${supplierReturn.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {DATE_FORMATTER.format(supplierReturn.returnDate)} · #{supplierReturn.returnNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {RETURN_REASON_LABEL[supplierReturn.reason] ?? supplierReturn.reason}
                        {" · "}
                        {supplierReturn.status === "COMPLETED" ? "Completed" : "Cancelled"}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold text-amber-600 dark:text-amber-400">-{supplierReturn.totalUnits} units</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>
      )}

      {/* Phase 4 Part 6 — Section 10: "Do not show only 5 records as the
          primary directory" — unlike the receiving/return sections
          above (deliberately just-the-recent-few), Credit History IS
          the primary directory for credits, so it's fully paginated. */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Credit History</h2>
        {creditHistory.credits.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No credits recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {creditHistory.credits.map((credit) => (
                <li key={credit.id}>
                  <Link
                    href={`/admin/suppliers/${id}/credits/${credit.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {DATE_FORMATTER.format(credit.creditDate)} · #{credit.creditNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {CREDIT_REASON_LABEL[credit.reason] ?? credit.reason}
                        {credit.sourceReturnNumber ? ` · Return #${credit.sourceReturnNumber}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <div className="text-right">
                        <p className="text-sm font-semibold">{formatPaise(credit.amountInPaise)}</p>
                        {credit.unallocatedInPaise > 0 && (
                          <p className="text-xs text-sky-600 dark:text-sky-400">{formatPaise(credit.unallocatedInPaise)} unallocated</p>
                        )}
                      </div>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AdminPagination
          basePath={`/admin/suppliers/${id}`}
          itemLabel="credit"
          paramName="creditsPage"
          page={creditHistory.page}
          totalPages={creditHistory.totalPages}
          totalCount={creditHistory.totalCount}
          pageSize={creditHistory.pageSize}
        />
      </section>

      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold">Refund History</h2>
        {refundHistory.refunds.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-6 text-center">
            <p className="text-sm text-muted-foreground">No refunds recorded yet.</p>
          </div>
        ) : (
          <div className="rounded-lg border border-border bg-card">
            <ul className="divide-y divide-border">
              {refundHistory.refunds.map((refund) => (
                <li key={refund.id}>
                  <Link
                    href={`/admin/suppliers/${id}/refunds/${refund.id}`}
                    className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/40"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">
                        {DATE_FORMATTER.format(refund.refundDate)} · #{refund.refundNumber}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {REFUND_METHOD_LABEL[refund.refundMethod] ?? refund.refundMethod} · {refund.receivedByName}
                        {refund.reference ? ` · ${refund.reference}` : ""}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="text-sm font-semibold">{formatPaise(refund.amountInPaise)}</span>
                      <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
        <AdminPagination
          basePath={`/admin/suppliers/${id}`}
          itemLabel="refund"
          paramName="refundsPage"
          page={refundHistory.page}
          totalPages={refundHistory.totalPages}
          totalCount={refundHistory.totalCount}
          pageSize={refundHistory.pageSize}
        />
      </section>
    </div>
  );
}
