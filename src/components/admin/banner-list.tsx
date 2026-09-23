"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowDown, ArrowUp, Pencil, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PromoBannerCard, type PromoBannerData } from "@/components/home/promo-banner-card";
import {
  deleteBannerAction,
  moveBannerAction,
  setBannerActiveAction,
} from "@/server/actions/admin/banners";

export type AdminBanner = PromoBannerData & {
  isActive: boolean;
  /** Human-readable schedule, e.g. "Until 5 Nov" — computed server-side. */
  scheduleLabel: string | null;
  /** "live" | "scheduled" | "ended" | "hidden" — what customers see now. */
  status: "live" | "scheduled" | "ended" | "hidden";
};

const STATUS_BADGE: Record<AdminBanner["status"], { label: string; className: string }> = {
  live: { label: "Live", className: "border-emerald-500/40 bg-emerald-500/15 text-emerald-300" },
  scheduled: { label: "Scheduled", className: "border-sky-500/40 bg-sky-500/15 text-sky-300" },
  ended: { label: "Ended", className: "border-border text-muted-foreground" },
  hidden: { label: "Hidden", className: "border-border text-muted-foreground" },
};

function BannerRow({ banner, isFirst, isLast }: { banner: AdminBanner; isFirst: boolean; isLast: boolean }) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  function run(action: () => Promise<{ success: boolean; error?: { message: string } }>, successMessage?: string) {
    if (isPending) return;
    startTransition(async () => {
      const result = await action();
      if (result.success) {
        if (successMessage) toast.success(successMessage);
        router.refresh();
      } else {
        toast.error(result.error?.message ?? "Something went wrong.");
      }
    });
  }

  const badge = STATUS_BADGE[banner.status];

  return (
    <li className="flex flex-col gap-4 rounded-lg border border-border bg-card p-4 sm:flex-row sm:items-center">
      <div className="store-theme w-full shrink-0 rounded-xl bg-background p-2 sm:w-72">
        <PromoBannerCard banner={banner} preview className="min-h-32 p-4 [&_h3]:text-base" />
      </div>

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <p className="truncate font-medium">{banner.title}</p>
          <Badge variant="outline" className={badge.className}>
            {badge.label}
          </Badge>
        </div>
        {banner.scheduleLabel && <p className="mt-1 text-xs text-muted-foreground">{banner.scheduleLabel}</p>}
        {banner.ctaHref && (
          <p className="mt-1 truncate text-xs text-muted-foreground">
            Button: &ldquo;{banner.ctaLabel}&rdquo; → {banner.ctaHref}
          </p>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-8"
          disabled={isPending}
          onClick={() =>
            run(
              () => setBannerActiveAction({ id: banner.id, isActive: !banner.isActive }),
              banner.isActive ? "Banner hidden." : "Banner shown on the homepage.",
            )
          }
        >
          {banner.isActive ? "Hide" : "Show"}
        </Button>
        <button
          type="button"
          aria-label={`Move "${banner.title}" up`}
          disabled={isPending || isFirst}
          onClick={() => run(() => moveBannerAction({ id: banner.id, direction: "up" }))}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ArrowUp className="size-4" aria-hidden />
        </button>
        <button
          type="button"
          aria-label={`Move "${banner.title}" down`}
          disabled={isPending || isLast}
          onClick={() => run(() => moveBannerAction({ id: banner.id, direction: "down" }))}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted disabled:opacity-30"
        >
          <ArrowDown className="size-4" aria-hidden />
        </button>
        <Link
          href={`/admin/banners/${banner.id}`}
          aria-label={`Edit "${banner.title}"`}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
        >
          <Pencil className="size-4" aria-hidden />
        </Link>
        <button
          type="button"
          aria-label={`Delete "${banner.title}"`}
          disabled={isPending}
          onClick={() => {
            if (!window.confirm(`Delete the banner "${banner.title}"? This cannot be undone.`)) return;
            run(() => deleteBannerAction({ id: banner.id }), "Banner deleted.");
          }}
          className="flex size-8 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive disabled:opacity-40"
        >
          <Trash2 className="size-4" aria-hidden />
        </button>
      </div>
    </li>
  );
}

/** /admin/banners: every banner in homepage order, with its live status. */
export function BannerList({ banners }: { banners: AdminBanner[] }) {
  if (banners.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-border p-10 text-center">
        <p className="text-sm font-medium">No banners yet</p>
        <p className="mt-1 text-sm text-muted-foreground">
          The homepage hides the banner row until you add one.
        </p>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {banners.map((banner, index) => (
        <BannerRow key={banner.id} banner={banner} isFirst={index === 0} isLast={index === banners.length - 1} />
      ))}
    </ul>
  );
}
