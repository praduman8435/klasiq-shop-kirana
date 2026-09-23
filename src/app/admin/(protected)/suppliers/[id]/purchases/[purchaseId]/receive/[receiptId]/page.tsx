import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { formatPaise } from "@/lib/money";
import { getSupplierPurchaseReceiptDetail } from "@/server/queries/admin/supplier-purchase-receipts";

type PageProps = { params: Promise<{ id: string; purchaseId: string; receiptId: string }> };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { purchaseId, receiptId } = await params;
  const receipt = await getSupplierPurchaseReceiptDetail(purchaseId, receiptId);
  return { title: receipt ? `Receipt — ${DATE_FORMATTER.format(receipt.receivedAt)}` : "Receipt" };
}

export default async function SupplierPurchaseReceiptDetailPage({ params }: PageProps) {
  const { id, purchaseId, receiptId } = await params;
  const receipt = await getSupplierPurchaseReceiptDetail(purchaseId, receiptId);
  if (!receipt) notFound();

  const totalUnits = receipt.items.reduce((sum, item) => sum + item.quantity, 0);
  const itemsWithCost = receipt.items.filter((item) => item.unitCostInPaise !== null);
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
          Purchase — {DATE_FORMATTER.format(receipt.purchase.purchaseDate)}
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Receipt</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {DATE_FORMATTER.format(receipt.receivedAt)} · {receipt.purchase.supplier.name}
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-5">
        <section className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Receipt</h2>
          <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs text-muted-foreground">Receipt date</dt>
              <dd className="mt-0.5 font-medium">{DATE_FORMATTER.format(receipt.receivedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Reference</dt>
              <dd className="mt-0.5 font-medium">{receipt.reference || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted-foreground">Received by</dt>
              <dd className="mt-0.5 font-medium">{receipt.createdByAdminUser?.name ?? "—"}</dd>
            </div>
            {receipt.notes && (
              <div className="col-span-2 sm:col-span-3">
                <dt className="text-xs text-muted-foreground">Notes</dt>
                <dd className="mt-0.5">{receipt.notes}</dd>
              </div>
            )}
          </dl>
        </section>

        <section>
          <h2 className="mb-3 text-xs font-semibold tracking-wide text-muted-foreground uppercase">Items ({receipt.items.length})</h2>
          <div className="rounded-lg border border-border bg-card">
            <div className="hidden items-center gap-3 border-b border-border px-4 py-2 text-xs font-medium text-muted-foreground sm:flex">
              <span className="flex-1">Product</span>
              <span className="w-24 shrink-0">SKU</span>
              <span className="w-20 shrink-0 text-right">Quantity</span>
              <span className="w-24 shrink-0 text-right">Unit cost</span>
              <span className="w-24 shrink-0 text-right">Total</span>
            </div>
            <ul className="divide-y divide-border">
              {receipt.items.map((item) => (
                <li key={item.id} className="px-4 py-3">
                  {/* Mobile — stacked block. */}
                  <div className="flex flex-col gap-1 sm:hidden">
                    <p className="text-sm font-medium">
                      {item.productVariant.product.name} &middot; {item.productVariant.size}
                    </p>
                    <p className="text-xs text-muted-foreground">SKU {item.productVariant.sku}</p>
                    <p className="text-xs text-muted-foreground">
                      Quantity: <span className="font-medium text-foreground">{item.quantity}</span>
                      {item.unitCostInPaise !== null && (
                        <>
                          {" "}
                          · {formatPaise(item.unitCostInPaise)} each · Total {formatPaise(item.quantity * item.unitCostInPaise)}
                        </>
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
                    <span className="w-20 shrink-0 text-right text-sm font-medium">{item.quantity}</span>
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

        <div className="flex flex-col gap-2 rounded-lg border border-border bg-secondary/20 px-4 py-3">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-muted-foreground">Total units</span>
            <span className="text-lg font-semibold">{totalUnits}</span>
          </div>
          {showValue && (
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-muted-foreground">Total receipt value</span>
              <span className="text-lg font-semibold">{formatPaise(totalValueInPaise)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
