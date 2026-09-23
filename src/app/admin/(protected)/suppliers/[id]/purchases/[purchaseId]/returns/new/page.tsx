import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewSupplierPurchaseReturnForm } from "@/components/admin/supplier-purchase-return-form";
import { getSupplierPurchaseDetail } from "@/server/queries/admin/supplier-purchases";
import { getReturnableVariantsForPurchase } from "@/server/queries/admin/supplier-purchase-returns";

type PageProps = { params: Promise<{ id: string; purchaseId: string }> };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export const metadata: Metadata = { title: "Return to Supplier" };

export default async function NewSupplierPurchaseReturnPage({ params }: PageProps) {
  const { id, purchaseId } = await params;
  const purchase = await getSupplierPurchaseDetail(id, purchaseId);
  if (!purchase) notFound();

  const returnableVariants = await getReturnableVariantsForPurchase(purchaseId);

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
          <h1 className="font-heading text-xl font-semibold tracking-tight">Return to Supplier</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Send goods back to {purchase.supplier.name}. This only reduces stock — it never changes the purchase total, bills, or payments.
          </p>
        </div>
      </div>
      <div className="max-w-3xl">
        <NewSupplierPurchaseReturnForm
          supplierId={id}
          purchaseId={purchaseId}
          supplierName={purchase.supplier.name}
          purchaseTotalInPaise={purchase.totalInPaise}
          returnableVariants={returnableVariants}
        />
      </div>
    </div>
  );
}
