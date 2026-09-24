import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierQuickPayForm } from "@/components/admin/supplier-quick-pay-form";
import { SupplierSidePanel } from "@/components/admin/supplier-side-panel";
import { db } from "@/lib/db";
import { khataEntryLabel } from "@/lib/supplier-statement";
import { getSupplierNetBalances } from "@/server/queries/admin/supplier-balances";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";
import { openBillsOldestFirst } from "@/server/suppliers/quick-entry";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Pay supplier" };

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

export default async function PaySupplierPage({ params }: PageProps) {
  const { id } = await params;
  const [supplier, balances, bills] = await Promise.all([
    getAdminSupplierById(id),
    getSupplierNetBalances([id]),
    openBillsOldestFirst(db, id),
  ]);
  if (!supplier) notFound();

  const openBills = bills.map((bill) => ({
    id: bill.id,
    outstandingInPaise: bill.outstandingInPaise,
    label: `${khataEntryLabel({
      type: "PURCHASE",
      reference: bill.reference,
      date: bill.purchaseDate,
      description: "",
      debitInPaise: 0,
      creditInPaise: 0,
    })} · ${DAY.format(bill.purchaseDate)}`,
  }));

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 lg:max-w-5xl">
      <Link href={`/admin/suppliers/${id}`} className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {supplier.name}
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Pay · Paisa diya</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Money you gave to {supplier.name}.</p>
      </div>
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
        <SupplierQuickPayForm
          supplierId={supplier.id}
          supplierName={supplier.name}
          currentBalanceInPaise={balances.get(id)?.netInPaise ?? 0}
          openBills={openBills}
        />
        <SupplierSidePanel
          balanceInPaise={balances.get(id)?.netInPaise ?? 0}
          title="Unpaid bills, oldest first"
          empty="No unpaid bills."
          rows={bills.map((bill) => ({
            key: bill.id,
            date: bill.purchaseDate,
            label: openBills.find((b) => b.id === bill.id)!.label.split(" · ")[0],
            amountInPaise: bill.outstandingInPaise,
          }))}
        />
      </div>
    </div>
  );
}
