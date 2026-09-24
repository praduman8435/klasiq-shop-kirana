import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { SupplierQuickCreateForm } from "@/components/admin/supplier-quick-create-form";

export const metadata: Metadata = { title: "Add supplier" };

export default function NewSupplierPage() {
  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Link href="/admin/suppliers" className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Suppliers
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add supplier</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">A wholesaler or company you buy stock from.</p>
      </div>
      <SupplierQuickCreateForm />
    </div>
  );
}
