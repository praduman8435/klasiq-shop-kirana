import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { NewSupplierRefundForm } from "@/components/admin/supplier-refund-form";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";
import { getSupplierCreditHistory } from "@/server/queries/admin/supplier-credits";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Record Refund" };

export default async function NewSupplierRefundPage({ params }: PageProps) {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  if (!supplier) notFound();

  // First page is enough context for the "link a credit" picker — a
  // supplier with more than 20 credits can still record a refund
  // unlinked, or by referencing the credit number in Notes.
  const creditHistory = await getSupplierCreditHistory({ supplierId: id, page: 1 });
  const creditOptions = creditHistory.credits
    .filter((credit) => credit.unallocatedInPaise > 0)
    .map((credit) => ({ id: credit.id, creditNumber: credit.creditNumber, unallocatedInPaise: credit.unallocatedInPaise }));

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
          <h1 className="font-heading text-xl font-semibold tracking-tight">Record Refund</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">Record money {supplier.name} actually sent back.</p>
        </div>
      </div>
      <div className="max-w-2xl">
        <NewSupplierRefundForm supplierId={supplier.id} supplierName={supplier.name} creditOptions={creditOptions} />
      </div>
    </div>
  );
}
