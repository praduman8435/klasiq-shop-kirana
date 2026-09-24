import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierQuickBillForm } from "@/components/admin/supplier-quick-bill-form";
import { SupplierSidePanel } from "@/components/admin/supplier-side-panel";
import { khataEntryAmountInPaise, khataEntryLabel } from "@/lib/supplier-statement";
import { getSupplierNetBalances } from "@/server/queries/admin/supplier-balances";
import { getSupplierKhata } from "@/server/queries/admin/supplier-ledger";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "New bill" };

export default async function NewSupplierBillPage({ params }: PageProps) {
  const { id } = await params;
  const [supplier, balances, khata] = await Promise.all([
    getAdminSupplierById(id),
    getSupplierNetBalances([id]),
    getSupplierKhata(id, 6),
  ]);
  if (!supplier) notFound();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 lg:max-w-5xl">
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
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-10">
        <SupplierQuickBillForm
          supplierId={supplier.id}
          supplierName={supplier.name}
          currentBalanceInPaise={balances.get(id)?.netInPaise ?? 0}
        />
        <SupplierSidePanel
          balanceInPaise={khata.balanceInPaise}
          title="Latest entries"
          empty="No entries yet. This will be the first bill."
          rows={khata.entries.map((entry) => {
            const amount = khataEntryAmountInPaise(entry);
            return {
              key: entry.key,
              date: entry.date,
              label: khataEntryLabel(entry),
              amountInPaise: Math.abs(amount),
              sign: amount > 0 ? (1 as const) : (-1 as const),
            };
          })}
        />
      </div>
    </div>
  );
}
