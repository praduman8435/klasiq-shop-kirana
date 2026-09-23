import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierRefundDetail } from "@/components/admin/supplier-refund-detail";
import { formatPaise } from "@/lib/money";
import { getSupplierRefundDetail } from "@/server/queries/admin/supplier-refunds";

type PageProps = { params: Promise<{ id: string; refundId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, refundId } = await params;
  const refund = await getSupplierRefundDetail(id, refundId);
  return { title: refund ? `Refund #${refund.refundNumber}` : "Supplier Refund" };
}

export default async function SupplierRefundDetailPage({ params }: PageProps) {
  const { id, refundId } = await params;
  const refund = await getSupplierRefundDetail(id, refundId);
  if (!refund) notFound();

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/admin/suppliers/${id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {refund.supplier.name}
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Refund #{refund.refundNumber}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{formatPaise(refund.amountInPaise)} from {refund.supplier.name}</p>
        </div>
      </div>

      <SupplierRefundDetail refund={refund} supplierId={id} />
    </div>
  );
}
