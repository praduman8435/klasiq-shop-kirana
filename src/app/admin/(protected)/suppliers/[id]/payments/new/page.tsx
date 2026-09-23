import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewSupplierPaymentForm } from "@/components/admin/supplier-payment-form";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";
import { getSupplierPaymentSummary, getSupplierPurchasesWithPaymentInfo } from "@/server/queries/admin/supplier-payments";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Record Payment" };

export default async function NewSupplierPaymentPage({ params }: PageProps) {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  if (!supplier) notFound();

  const [summary, purchases] = await Promise.all([
    getSupplierPaymentSummary(id),
    getSupplierPurchasesWithPaymentInfo(id),
  ]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/admin/suppliers/${id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {supplier.name}
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Record Payment</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Record money paid to this supplier and allocate it across their purchases.</p>
        </div>
      </div>
      <div className="max-w-2xl">
        <NewSupplierPaymentForm
          supplierId={supplier.id}
          supplierName={supplier.name}
          outstandingInPaise={summary.outstandingInPaise}
          purchases={purchases}
        />
      </div>
    </div>
  );
}
