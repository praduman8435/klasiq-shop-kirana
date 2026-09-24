import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { KhataCustomerForm } from "@/components/admin/khata-customer-form";

export const metadata: Metadata = { title: "Add customer" };

export default function NewKhataCustomerPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Link href="/admin/khatabook" className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        KhataBook
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add customer</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">A regular who buys on udhaar.</p>
      </div>
      <KhataCustomerForm />
    </div>
  );
}
