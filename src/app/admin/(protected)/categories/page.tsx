import type { Metadata } from "next";
import { CategoryManager } from "@/components/admin/category-manager";
import { getAllCategories } from "@/server/queries/admin/categories";

export const metadata: Metadata = { title: "Categories" };

export default async function AdminCategoriesPage() {
  const categories = await getAllCategories();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="font-heading text-2xl font-semibold tracking-tight">Categories</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Shown in the main navigation and used to organize products.
        </p>
      </div>
      <CategoryManager categories={categories} />
    </div>
  );
}
