import type { Metadata } from "next";
import { BannerForm } from "@/components/admin/banner-form";
import { getHeaderCategories } from "@/server/queries/categories";

export const metadata: Metadata = { title: "Add Banner" };

export default async function NewBannerPage() {
  const aisles = await getHeaderCategories();

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Add Banner</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">It appears at the end of the homepage banner row.</p>
      </div>
      <BannerForm aisles={aisles} />
    </div>
  );
}
