import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierPurchaseDetail } from "@/components/admin/supplier-purchase-detail";
import { getSupplierPurchaseDetail } from "@/server/queries/admin/supplier-purchases";
import { getPurchasePaymentHistory, getPurchasePaymentInfo } from "@/server/queries/admin/supplier-payments";
import { getPurchaseReceiptHistory, getPurchaseReceivingSummary } from "@/server/queries/admin/supplier-purchase-receipts";
import { getPurchaseReturnHistory, getPurchaseReturnSummary } from "@/server/queries/admin/supplier-purchase-returns";
import { getPurchaseCreditAllocationHistory } from "@/server/queries/admin/supplier-credits";

type PageProps = { params: Promise<{ id: string; purchaseId: string }> };

const DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", year: "numeric" });

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id, purchaseId } = await params;
  const purchase = await getSupplierPurchaseDetail(id, purchaseId);
  return { title: purchase ? `Purchase — ${DATE_FORMATTER.format(purchase.purchaseDate)}` : "Purchase" };
}

export default async function SupplierPurchaseDetailPage({ params }: PageProps) {
  const { id, purchaseId } = await params;
  const purchase = await getSupplierPurchaseDetail(id, purchaseId);
  if (!purchase) notFound();

  const [paymentInfo, paymentHistory, receivingSummary, receiptHistory, returnSummary, returnHistory, creditHistory] = await Promise.all([
    getPurchasePaymentInfo(purchaseId),
    getPurchasePaymentHistory(purchaseId),
    getPurchaseReceivingSummary(purchaseId),
    getPurchaseReceiptHistory(purchaseId),
    getPurchaseReturnSummary(purchaseId),
    getPurchaseReturnHistory(purchaseId),
    getPurchaseCreditAllocationHistory(purchaseId),
  ]);

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href={`/admin/suppliers/${id}`}
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          {purchase.supplier.name}
        </Link>
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Purchase</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {DATE_FORMATTER.format(purchase.purchaseDate)} · {purchase.supplier.name}
          </p>
        </div>
      </div>

      <SupplierPurchaseDetail
        purchase={purchase}
        paidInPaise={paymentInfo?.paidInPaise ?? 0}
        creditsAppliedInPaise={paymentInfo?.creditsAppliedInPaise ?? 0}
        outstandingInPaise={paymentInfo?.outstandingInPaise ?? purchase.totalInPaise}
        paymentHistory={paymentHistory}
        receivingSummary={receivingSummary}
        receiptHistory={receiptHistory}
        returnSummary={returnSummary}
        returnHistory={returnHistory}
        creditHistory={creditHistory}
      />
    </div>
  );
}
