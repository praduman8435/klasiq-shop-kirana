import { z } from "zod";

export const BANNER_TONES = ["RED", "INK", "SOFT"] as const;
export const BANNER_ICONS = ["DELIVERY", "PICKUP", "PAYMENT", "OFFER", "FESTIVAL", "FRESH"] as const;

export const BANNER_TITLE_MAX = 60;
export const BANNER_BODY_MAX = 140;
export const BANNER_CTA_LABEL_MAX = 24;

/** A CTA link must stay on this storefront: a path ("/atta-rice-dal",
 * "/search?q=atta") or an on-page anchor ("/#categories-heading"). Never
 * an external URL — a banner is not a way to send customers off-site —
 * and never a protocol-relative "//host" link. */
const INTERNAL_HREF = /^\/(?!\/)[^\s]*$/;

/** "" from an empty date input means "no bound". */
const optionalDate = z
  .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Use a valid date.")])
  .optional()
  .transform((value) => (value ? value : null));

export const bannerFormSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required.").max(BANNER_TITLE_MAX),
    body: z.string().trim().max(BANNER_BODY_MAX).optional().default(""),
    ctaLabel: z.string().trim().max(BANNER_CTA_LABEL_MAX).optional().default(""),
    ctaHref: z.string().trim().max(200).optional().default(""),
    tone: z.enum(BANNER_TONES),
    icon: z.enum(BANNER_ICONS),
    isActive: z.boolean(),
    startsOn: optionalDate,
    endsOn: optionalDate,
  })
  .superRefine((data, ctx) => {
    if (Boolean(data.ctaLabel) !== Boolean(data.ctaHref)) {
      ctx.addIssue({
        code: "custom",
        path: [data.ctaLabel ? "ctaHref" : "ctaLabel"],
        message: "Set both a button label and a link, or leave both empty.",
      });
    }
    if (data.ctaHref && !INTERNAL_HREF.test(data.ctaHref)) {
      ctx.addIssue({
        code: "custom",
        path: ["ctaHref"],
        message: "Link to a page on this store, starting with / (e.g. /atta-rice-dal).",
      });
    }
    if (data.startsOn && data.endsOn && data.endsOn < data.startsOn) {
      ctx.addIssue({ code: "custom", path: ["endsOn"], message: "The end date must be on or after the start date." });
    }
  });

export const createBannerSchema = bannerFormSchema;
export const updateBannerSchema = z.intersection(bannerFormSchema, z.object({ id: z.string().min(1) }));
export const bannerIdSchema = z.object({ id: z.string().min(1) });
export const moveBannerSchema = z.object({ id: z.string().min(1), direction: z.enum(["up", "down"]) });
export const setBannerActiveSchema = z.object({ id: z.string().min(1), isActive: z.boolean() });

export type BannerFormInput = z.input<typeof bannerFormSchema>;

/**
 * Converts the form's inclusive calendar dates into the stored window:
 * `startsAt` at the start of the start day, `endsAt` at the start of the
 * day AFTER the end day (exclusive), both in India Standard Time — the
 * store's own calendar, whatever timezone the server runs in.
 */
export function bannerWindowFromDates(startsOn: string | null, endsOn: string | null) {
  const istMidnight = (day: string) => new Date(`${day}T00:00:00+05:30`);
  const startsAt = startsOn ? istMidnight(startsOn) : null;
  let endsAt: Date | null = null;
  if (endsOn) {
    endsAt = istMidnight(endsOn);
    endsAt.setUTCDate(endsAt.getUTCDate() + 1);
  }
  return { startsAt, endsAt };
}

/** The reverse of `bannerWindowFromDates`, for pre-filling the edit form. */
export function bannerDatesFromWindow(startsAt: Date | null, endsAt: Date | null) {
  const istDay = (date: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  let endsOn = "";
  if (endsAt) {
    const lastDay = new Date(endsAt);
    lastDay.setUTCDate(lastDay.getUTCDate() - 1);
    endsOn = istDay(lastDay);
  }
  return { startsOn: startsAt ? istDay(startsAt) : "", endsOn };
}
