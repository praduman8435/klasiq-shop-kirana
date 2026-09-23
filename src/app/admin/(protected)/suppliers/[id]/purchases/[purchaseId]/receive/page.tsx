import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewSupplierPurchaseReceiptForm } from "@/components/admin/supplier-purchase-receipt-form";
import { getSupplierPurchaseDetail } from "@/server/queries/admin/supplier-purchases";

type PageProps = { params: Promise<{ id: string; purchaseId: string }> };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export const metadata: Metadata = { title: "Receive Inventory" };

export default async function ReceiveSupplierPurchaseInventoryPage({ params }: PageProps) {
  const { id, purchaseId } = await params;
  const purchase = await getSupplierPurchaseDetail(id, purchaseId);
  if (!purchase) notFound();

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/admin/suppliers/${id}/purchases/${purchaseId}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Purchase — {DATE_FORMATTER.format(purchase.purchaseDate)}
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Receive Inventory</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record what physically arrived against this purchase. This only changes stock — it never changes the purchase total, bills, or payments.
          </p>
        </div>
      </div>
      <div className="max-w-3xl">
        <NewSupplierPurchaseReceiptForm supplierId={id} purchaseId={purchaseId} supplierName={purchase.supplier.name} />
      </div>
    </div>
  );
}
