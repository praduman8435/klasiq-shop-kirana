import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierPaymentDetail } from "@/components/admin/supplier-payment-detail";
import { formatPaise } from "@/lib/money";
import { getSupplierPaymentDetail } from "@/server/queries/admin/supplier-payments";

type PageProps = { params: Promise<{ id: string; paymentId: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, paymentId } = await params;
  const payment = await getSupplierPaymentDetail(id, paymentId);
  return { title: payment ? `Payment — ${formatPaise(payment.amountInPaise)}` : "Payment" };
}

export default async function SupplierPaymentDetailPage({ params }: PageProps) {
  const { id, paymentId } = await params;
  const payment = await getSupplierPaymentDetail(id, paymentId);
  if (!payment) notFound();

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/admin/suppliers/${id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {payment.supplier.name}
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">{formatPaise(payment.amountInPaise)}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Payment to {payment.supplier.name}
          </p>
        </div>
      </div>

      <SupplierPaymentDetail payment={payment} />
    </div>
  );
}
