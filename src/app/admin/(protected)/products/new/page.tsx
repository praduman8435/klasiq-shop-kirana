import type { Metadata } from "next";
import { ProductForm } from "@/components/admin/product-form";
import { getAllCategories } from "@/server/queries/admin/categories";
import { getAllSchoolsForPicker } from "@/server/queries/admin/products";

export const metadata: Metadata = { title: "Add Product" };

export default async function NewProductPage() {
  const [categories, schools] = await Promise.all([getAllCategories(), getAllSchoolsForPicker()]);

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add Product</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          You can add sizes, prices and stock after creating it.
        </p>
      </div>
      <div className="max-w-xl">
        <ProductForm categories={categories} schools={schools} />
      </div>
    </div>
  );
}
