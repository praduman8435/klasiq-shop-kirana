import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewSupplierCreditForm } from "@/components/admin/supplier-credit-form";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";
import { getSupplierPurchasesWithCreditInfo } from "@/server/queries/admin/supplier-credits";
import { getSupplierRecentReturns } from "@/server/queries/admin/supplier-purchase-returns";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Record Credit" };

export default async function NewSupplierCreditPage({ params }: PageProps) {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  if (!supplier) notFound();

  const [purchases, returns] = await Promise.all([
    getSupplierPurchasesWithCreditInfo(id),
    getSupplierRecentReturns(id, 50),
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
          <h1 className="font-heading text-xl font-semibold tracking-tight">Record Credit</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Record money {supplier.name} owes back, and optionally apply it against their purchases.</p>
        </div>
      </div>
      <div className="max-w-2xl">
        <NewSupplierCreditForm
          supplierId={supplier.id}
          supplierName={supplier.name}
          purchases={purchases}
          returnOptions={returns.map((r) => ({ id: r.id, returnNumber: r.returnNumber, returnDate: r.returnDate }))}
        />
      </div>
    </div>
  );
}
