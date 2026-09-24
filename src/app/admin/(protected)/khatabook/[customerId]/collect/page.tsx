import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { KhataCollectForm } from "@/components/admin/khata-collect-form";
import { formatPaise } from "@/lib/money";
import { getKhataCustomerWithDue } from "@/server/queries/admin/khata-customer";

type PageProps = { params: Promise<{ customerId: string }> };

export const metadata: Metadata = { title: "Paisa mila" };

export default async function KhataCollectPage({ params }: PageProps) {
  const { customerId } = await params;
  const customer = await getKhataCustomerWithDue(customerId);
  if (!customer) notFound();
  if (customer.dueInPaise === 0) redirect(`/admin/khatabook/${customerId}`);
  const name = customer.displayName || customer.customerId;

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Link href={`/admin/khatabook/${customerId}`} className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {name}
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Got payment · Paisa mila</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {name} owes {formatPaise(customer.dueInPaise)}. The oldest udhaar is cleared first.
        </p>
      </div>
      <KhataCollectForm customerId={customer.customerId} customerName={name} dueInPaise={customer.dueInPaise} />
    </div>
  );
}
