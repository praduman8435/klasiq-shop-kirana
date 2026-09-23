import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { getAllCategories } from "@/server/queries/admin/categories";

export const metadata: Metadata = { title: "Add Product" };

export default async function NewProductPage() {
  const categories = await getAllCategories();

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add Product</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          You can add pack sizes, prices and stock after creating it.
        </p>
      </div>
      <div className="max-w-xl">
        <ProductForm categories={categories} />
      </div>
    </div>
  );
}
