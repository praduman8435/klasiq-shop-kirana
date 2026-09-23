import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { formatPaise } from "@/lib/money";
import { getSupplierPurchaseReturnDetail } from "@/server/queries/admin/supplier-purchase-returns";

type PageProps = { params: Promise<{ id: string; purchaseId: string; returnId: string }> };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });
const DATETIME_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  day: "numeric",
  month: "long",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { purchaseId, returnId } = await params;
  const supplierReturn = await getSupplierPurchaseReturnDetail(purchaseId, returnId);
  return { title: supplierReturn ? `Return #${supplierReturn.returnNumber}` : "Supplier Return" };
}

export default async function SupplierPurchaseReturnDetailPage({ params }: PageProps) {
  const { id, purchaseId, returnId } = await params;
  const supplierReturn = await getSupplierPurchaseReturnDetail(purchaseId, returnId);
  if (!supplierReturn) notFound();

  const totalUnits = supplierReturn.items.reduce((sum, item) => sum + item.quantity, 0);
  const itemsWithCost = supplierReturn.items.filter((item) => item.unitCostInPaise !== null);
  const totalValueInPaise = itemsWithCost.reduce((sum, item) => sum + item.quantity * (item.unitCostInPaise ?? 0), 0);
  const showValue = itemsWithCost.length > 0;

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/admin/suppliers/${id}/purchases/${purchaseId}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Purchase — {DATE_FORMATTER.format(supplierReturn.purchase.purchaseDate)}
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">Return #{supplierReturn.returnNumber}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {DATE_FORMATTER.format(supplierReturn.returnDate)} · {supplierReturn.purchase.supplier.name}
            </p>
          </div>
          <Badge variant="outline" className="border-emerald-600/40 text-emerald-600 dark:text-emerald-400">
            {supplierReturn.status === "COMPLETED" ? "Completed" : "Cancelled"}
          </Badge>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Return details</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Reason</dt>
              <dd className="mt-0.5 font-medium">{RETURN_REASON_LABEL[supplierReturn.reason] ?? supplierReturn.reason}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd className="mt-0.5 font-medium">{supplierReturn.reference || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Purchase</dt>
              <dd className="mt-0.5 font-medium">{DATE_FORMATTER.format(supplierReturn.purchase.purchaseDate)}</dd>
            </div>
            {(supplierReturn.reasonNote || supplierReturn.notes) && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="mt-0.5">{[supplierReturn.reasonNote, supplierReturn.notes].filter(Boolean).join(" · ")}</dd>
              </div>
            )}
          </dl>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Items ({supplierReturn.items.length})</h2>
          <div className="rounded-lg border border-border bg-card">
            <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="flex-1">Product</span>
              <span className="w-24 shrink-0">SKU</span>
              <span className="w-20 shrink-0 text-right">Quantity</span>
              <span className="w-24 shrink-0 text-right">Unit cost</span>
              <span className="w-24 shrink-0 text-right">Value</span>
            </div>
            <ul className="divide-y divide-border">
              {supplierReturn.items.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  {/* Mobile — stacked block. */}
                  <div className="flex flex-col gap-1 sm:hidden">
                    <p className="text-sm font-medium">
                      {item.productVariant.product.name} &middot; {item.productVariant.size}
                    </p>
                    <p className="text-xs text-muted-foreground">SKU {item.productVariant.sku}</p>
                    <p className="text-xs text-muted-foreground">
                      Quantity: <span className="font-medium text-amber-600 dark:text-amber-400">-{item.quantity}</span>
                      {item.unitCostInPaise !== null && (
                        <> · {formatPaise(item.unitCostInPaise)} each · Value {formatPaise(item.quantity * item.unitCostInPaise)}</>
                      )}
                    </p>
                  </div>

                  {/* Desktop — table-like row. */}
                  <div className="hidden items-center gap-3 sm:flex">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {item.productVariant.product.name} &middot; {item.productVariant.size}
                      </p>
                    </div>
                    <span className="w-24 shrink-0 truncate text-xs text-muted-foreground">{item.productVariant.sku}</span>
                    <span className="w-20 shrink-0 text-right text-sm font-medium text-amber-600 dark:text-amber-400">-{item.quantity}</span>
                    <span className="w-24 shrink-0 text-right text-sm text-muted-foreground">
                      {item.unitCostInPaise !== null ? formatPaise(item.unitCostInPaise) : "—"}
                    </span>
                    <span className="w-24 shrink-0 text-right text-sm font-medium">
                      {item.unitCostInPaise !== null ? formatPaise(item.quantity * item.unitCostInPaise) : "—"}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Inventory impact</h2>
          <div className="rounded-lg border border-border bg-card p-4">
            <ul className="flex flex-col gap-1.5 text-sm">
              {supplierReturn.items.map((item) => (
                <li key={item.id} className="flex items-center justify-between">
                  <span>
                    {item.productVariant.product.name} ({item.productVariant.size})
                  </span>
                  <span className="font-medium text-amber-600 dark:text-amber-400">-{item.quantity}</span>
                </li>
              ))}
            </ul>
            <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm font-semibold">
              <span>Total</span>
              <span className="text-amber-600 dark:text-amber-400">-{totalUnits} units</span>
            </div>
            {showValue && (
              <div className="mt-1 flex items-center justify-between text-xs text-muted-foreground">
                <span>Return value (informational only — not deducted from the purchase)</span>
                <span>{formatPaise(totalValueInPaise)}</span>
              </div>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-border bg-secondary/20 px-4 py-3">
          <h2 className="mb-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Audit</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Created by</dt>
              <dd className="mt-0.5 font-medium">{supplierReturn.createdByAdminUser?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Confirmed by</dt>
              <dd className="mt-0.5 font-medium">{supplierReturn.confirmedByAdminUser?.name ?? "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Confirmed at</dt>
              <dd className="mt-0.5 font-medium">{supplierReturn.confirmedAt ? DATETIME_FORMATTER.format(supplierReturn.confirmedAt) : "—"}</dd>
            </div>
          </dl>
        </section>
      </div>
    </div>
  );
}
