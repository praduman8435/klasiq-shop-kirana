export type BannerStatus = "live" | "scheduled" | "ended" | "hidden";

/** What customers see for a banner right now — the same rule as
 * `getActivePromoBanners` (start inclusive, end exclusive). */
export function bannerStatus(
  banner: { isActive: boolean; startsAt: Date | null; endsAt: Date | null },
  now: Date = new Date(),
): BannerStatus {
  if (!banner.isActive) return "hidden";
  if (banner.endsAt && banner.endsAt <= now) return "ended";
  if (banner.startsAt && banner.startsAt > now) return "scheduled";
  return "live";
}

const DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short" });

/** "From 1 Nov", "Until 5 Nov", "1 Nov – 5 Nov", or null when unscheduled.
 * `endsAt` is exclusive, so the label shows the last day it's visible. */
export function bannerScheduleLabel(banner: { startsAt: Date | null; endsAt: Date | null }): string | null {
  const lastDay = banner.endsAt ? new Date(banner.endsAt.getTime() - 1) : null;
  if (banner.startsAt && lastDay) return `${DAY.format(banner.startsAt)} – ${DAY.format(lastDay)}`;
  if (banner.startsAt) return `From ${DAY.format(banner.startsAt)}`;
  if (lastDay) return `Until ${DAY.format(lastDay)}`;
  return null;
}
