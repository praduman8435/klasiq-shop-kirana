import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { BannerForm } from "@/components/admin/banner-form";
import { bannerDatesFromWindow } from "@/lib/validation/admin-banners";
import { getPromoBannerById } from "@/server/queries/banners";
import { getHeaderCategories } from "@/server/queries/categories";

export const metadata: Metadata = { title: "Edit Banner" };

type PageProps = { params: Promise<{ id: string }> };

export default async function EditBannerPage({ params }: PageProps) {
  const { id } = await params;
  const [banner, aisles] = await Promise.all([getPromoBannerById(id), getHeaderCategories()]);
  if (!banner) notFound();

  const { startsOn, endsOn } = bannerDatesFromWindow(banner.startsAt, banner.endsAt);

  return (
    <div>
      <div className="mb-5">
        <h1 className="font-heading text-xl font-semibold tracking-tight">Edit Banner</h1>
        <p className="mt-0.5 text-sm text-muted-foreground">Changes appear on the homepage as soon as you save.</p>
      </div>
      <BannerForm
        aisles={aisles}
        initial={{
          id: banner.id,
          title: banner.title,
          body: banner.body ?? "",
          ctaLabel: banner.ctaLabel ?? "",
          ctaHref: banner.ctaHref ?? "",
          tone: banner.tone,
          icon: banner.icon,
          isActive: banner.isActive,
          startsOn,
          endsOn,
        }}
      />
    </div>
  );
}
