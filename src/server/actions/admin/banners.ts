"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import {
  bannerIdSchema,
  bannerWindowFromDates,
  createBannerSchema,
  moveBannerSchema,
  setBannerActiveSchema,
  updateBannerSchema,
} from "@/lib/validation/admin-banners";

export type BannerActionResult<T = { success: true }> =
  | T
  | { success: false; error: { type: "UNAUTHORIZED" | "VALIDATION" | "NOT_FOUND"; message: string } };

async function requireAdmin() {
  const admin = await getAdminSession();
  if (!admin) {
    return {
      unauthorized: {
        success: false as const,
        error: { type: "UNAUTHORIZED" as const, message: "Please sign in again." },
      },
    };
  }
  return { unauthorized: null };
}

function validationError(message: string | undefined) {
  return { success: false as const, error: { type: "VALIDATION" as const, message: message ?? "Invalid request." } };
}

const NOT_FOUND = { success: false as const, error: { type: "NOT_FOUND" as const, message: "That banner no longer exists." } };

function revalidateBannerViews() {
  revalidatePath("/");
  revalidatePath("/admin/banners");
}

function toRow(data: {
  title: string;
  body: string;
  ctaLabel: string;
  ctaHref: string;
  tone: "RED" | "INK" | "SOFT";
  icon: "DELIVERY" | "PICKUP" | "PAYMENT" | "OFFER" | "FESTIVAL" | "FRESH";
  isActive: boolean;
  startsOn: string | null;
  endsOn: string | null;
}) {
  const { startsAt, endsAt } = bannerWindowFromDates(data.startsOn, data.endsOn);
  return {
    title: data.title,
    body: data.body || null,
    ctaLabel: data.ctaLabel || null,
    ctaHref: data.ctaHref || null,
    tone: data.tone,
    icon: data.icon,
    isActive: data.isActive,
    startsAt,
    endsAt,
  };
}

export async function createBannerAction(input: unknown): Promise<BannerActionResult<{ success: true; id: string }>> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = createBannerSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message);

  // New banners go to the end of the row.
  const last = await db.promoBanner.aggregate({ _max: { sortOrder: true } });
  const banner = await db.promoBanner.create({
    data: { ...toRow(parsed.data), sortOrder: (last._max.sortOrder ?? -1) + 1 },
  });

  revalidateBannerViews();
  return { success: true, id: banner.id };
}

export async function updateBannerAction(input: unknown): Promise<BannerActionResult> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = updateBannerSchema.safeParse(input);
  if (!parsed.success) return validationError(parsed.error.issues[0]?.message);

  const existing = await db.promoBanner.findUnique({ where: { id: parsed.data.id } });
  if (!existing) return NOT_FOUND;

  await db.promoBanner.update({ where: { id: parsed.data.id }, data: toRow(parsed.data) });
  revalidateBannerViews();
  return { success: true };
}

export async function setBannerActiveAction(input: unknown): Promise<BannerActionResult> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = setBannerActiveSchema.safeParse(input);
  if (!parsed.success) return validationError(undefined);

  const result = await db.promoBanner.updateMany({
    where: { id: parsed.data.id },
    data: { isActive: parsed.data.isActive },
  });
  if (result.count === 0) return NOT_FOUND;

  revalidateBannerViews();
  return { success: true };
}

/** Swaps a banner with its neighbour, then renumbers every banner 0..n-1
 * so ordering never drifts into duplicate or sparse `sortOrder` values. */
export async function moveBannerAction(input: unknown): Promise<BannerActionResult> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = moveBannerSchema.safeParse(input);
  if (!parsed.success) return validationError(undefined);

  const banners = await db.promoBanner.findMany({
    orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }],
    select: { id: true },
  });
  const index = banners.findIndex((banner) => banner.id === parsed.data.id);
  if (index === -1) return NOT_FOUND;

  const target = parsed.data.direction === "up" ? index - 1 : index + 1;
  if (target >= 0 && target < banners.length) {
    [banners[index], banners[target]] = [banners[target], banners[index]];
    await db.$transaction(
      banners.map((banner, sortOrder) => db.promoBanner.update({ where: { id: banner.id }, data: { sortOrder } })),
    );
  }

  revalidateBannerViews();
  return { success: true };
}

export async function deleteBannerAction(input: unknown): Promise<BannerActionResult> {
  const { unauthorized } = await requireAdmin();
  if (unauthorized) return unauthorized;

  const parsed = bannerIdSchema.safeParse(input);
  if (!parsed.success) return validationError(undefined);

  const result = await db.promoBanner.deleteMany({ where: { id: parsed.data.id } });
  if (result.count === 0) return NOT_FOUND;

  revalidateBannerViews();
  return { success: true };
}
