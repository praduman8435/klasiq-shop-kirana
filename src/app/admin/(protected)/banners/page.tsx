import Link from "next/link";
import type { Metadata } from "next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BannerList, type AdminBanner } from "@/components/admin/banner-list";
import { bannerScheduleLabel, bannerStatus } from "@/lib/banner-status";
import { getAllPromoBanners } from "@/server/queries/banners";

export const metadata: Metadata = { title: "Banners" };

export default async function AdminBannersPage() {
  const now = new Date();
  const banners: AdminBanner[] = (await getAllPromoBanners()).map((banner) => ({
    id: banner.id,
    title: banner.title,
    body: banner.body,
    ctaLabel: banner.ctaLabel,
    ctaHref: banner.ctaHref,
    tone: banner.tone,
    icon: banner.icon,
    isActive: banner.isActive,
    status: bannerStatus(banner, now),
    scheduleLabel: bannerScheduleLabel(banner),
  }));
  const liveCount = banners.filter((banner) => banner.status === "live").length;

  return (
    <div>
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h1 className="font-heading text-xl font-semibold tracking-tight">Banners</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">
            The swipeable row at the top of the homepage · {liveCount} live now
          </p>
        </div>
        <Button render={<Link href="/admin/banners/new" />} nativeButton={false} className="h-9">
          <Plus className="size-4" aria-hidden />
          Add Banner
        </Button>
      </div>
      <BannerList banners={banners} />
    </div>
  );
}
