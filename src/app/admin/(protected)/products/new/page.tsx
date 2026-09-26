import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { ProductForm } from "@/components/admin/product-form";
import { getAllCategories } from "@/server/queries/admin/categories";

export const metadata: Metadata = { title: "Add product" };

export default async function NewProductPage() {
  const categories = await getAllCategories();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/products" className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Products
      </Link>
      <div>
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add product</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Name, photo, and the first pack size with its price. That&apos;s all it needs to sell.</p>
      </div>
      <div className="max-w-2xl rounded-xl border border-border bg-card p-4 sm:p-5">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
