import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { KhataUdhaarForm } from "@/components/admin/khata-udhaar-form";
import { getKhataCustomerWithDue } from "@/server/queries/admin/khata-customer";

type PageProps = { params: Promise<{ customerId: string }> };

export const metadata: Metadata = { title: "Udhaar diya" };

export default async function KhataUdhaarPage({ params }: PageProps) {
  const { customerId } = await params;
  const customer = await getKhataCustomerWithDue(customerId);
  if (!customer) notFound();
  const name = customer.displayName || customer.customerId;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Link href={`/admin/khatabook/${customerId}`} className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {name}
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Gave udhaar · Udhaar diya</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Goods {name} took on credit. For a full bill with items and stock, use Counter Sale.
        </p>
      </div>
      <KhataUdhaarForm customerId={customer.customerId} customerName={name} currentDueInPaise={customer.dueInPaise} />
    </div>
  );
}
