import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewSupplierPurchaseForm } from "@/components/admin/supplier-purchase-form";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "New Purchase" };

export default async function NewSupplierPurchasePage({ params }: PageProps) {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  if (!supplier) notFound();

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
          <h1 className="font-heading text-xl font-semibold tracking-tight">New Purchase</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Record a purchase and its bills. This is an accounting record only — it does not change inventory.
          </p>
        </div>
      </div>
      <div className="max-w-2xl">
        <NewSupplierPurchaseForm supplierId={supplier.id} supplierName={supplier.name} />
      </div>
    </div>
  );
}
