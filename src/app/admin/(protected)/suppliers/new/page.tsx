import type { Metadata } from "next";
import { SupplierForm } from "@/components/admin/supplier-form";

export const metadata: Metadata = { title: "Add Supplier" };

export default function NewSupplierPage() {
  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add Supplier</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          Record a wholesaler or supplier account.
        </p>
      </div>
      <div className="max-w-xl">
        <SupplierForm />
      </div>
    </div>
  );
}
