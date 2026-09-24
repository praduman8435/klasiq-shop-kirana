import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierQuickBillForm } from "@/components/admin/supplier-quick-bill-form";
import { getSupplierNetBalances } from "@/server/queries/admin/supplier-balances";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "New bill" };

export default async function NewSupplierBillPage({ params }: PageProps) {
  const { id } = await params;
  const [supplier, balances] = await Promise.all([getAdminSupplierById(id), getSupplierNetBalances([id])]);
  if (!supplier) notFound();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Link href={`/admin/suppliers/${id}`} className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {supplier.name}
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">New bill · Maal aaya</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Goods received from {supplier.name}. Add the items to stock later from the bill, if you want.
        </p>
      </div>
      <SupplierQuickBillForm
        supplierId={supplier.id}
        supplierName={supplier.name}
        currentBalanceInPaise={balances.get(id)?.netInPaise ?? 0}
      />
    </div>
  );
}
