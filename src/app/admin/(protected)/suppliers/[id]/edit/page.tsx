import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { SupplierForm } from "@/components/admin/supplier-form";
import { getAdminSupplierById } from "@/server/queries/admin/suppliers";

type PageProps = { params: Promise<{ id: string }> };

export const metadata: Metadata = { title: "Edit supplier" };

export default async function EditSupplierPage({ params }: PageProps) {
  const { id } = await params;
  const supplier = await getAdminSupplierById(id);
  if (!supplier) notFound();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5">
      <Link href={`/admin/suppliers/${id}`} className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        {supplier.name}
      </Link>
      <h1 className="font-heading text-xl font-semibold tracking-tight">Edit details</h1>
      <SupplierForm
        initial={{
          id: supplier.id,
          name: supplier.name,
          businessName: supplier.businessName ?? "",
          phone: supplier.phone ?? "",
          addressLine: supplier.addressLine ?? "",
          city: supplier.city ?? "",
          gstNumber: supplier.gstNumber ?? "",
          notes: supplier.notes ?? "",
          isActive: supplier.isActive,
        }}
      />
    </div>
  );
}
