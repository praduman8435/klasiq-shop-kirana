"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getAdminSession } from "@/lib/admin/session";
import { rupeesToPaise } from "@/lib/money";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import { couponFormSchema, setCouponActiveSchema, updateCouponSchema } from "@/lib/validation/admin-coupons";
import type { z } from "zod";

type Result = { success: true; id: string } | { success: false; message: string };

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** A date input's day as India midnight (start) or the end of that day (last day). */
function indiaDay(value: string | undefined, edge: "start" | "end"): Date | null {
  if (!value) return null;
  const [y, m, d] = value.split("-").map(Number);
  const start = Date.UTC(y, m - 1, d) - IST_OFFSET_MS;
  return new Date(edge === "start" ? start : start + DAY_MS);
}

function toData(v: z.output<typeof couponFormSchema>) {
  return {
    code: v.code,
    type: v.type,
    value: v.type === "PERCENT" ? v.percent! : v.type === "FLAT" ? rupeesToPaise(v.flatInRupees!) : 0,
    maxDiscountInPaise: v.type === "PERCENT" && v.maxDiscountInRupees ? rupeesToPaise(v.maxDiscountInRupees) : null,
    minOrderInPaise: rupeesToPaise(v.minOrderInRupees ?? 0),
    startsAt: indiaDay(v.startsOn, "start"),
    // "Valid till 30 Sept" means all of 30 Sept, India time.
    expiresAt: indiaDay(v.expiresOn, "end"),
    usageLimit: v.usageLimit ?? null,
    perCustomerLimit: v.perCustomerLimit,
    firstOrderOnly: v.firstOrderOnly,
    showOnWebsite: v.showOnWebsite,
    isActive: v.isActive,
  };
}

function revalidateOffers() {
  revalidatePath("/admin/offers");
  revalidatePath("/bag");
  revalidatePath("/checkout");
}

export async function createCouponAction(input: unknown): Promise<Result> {
  if (!(await getAdminSession())) return { success: false, message: "Please sign in again." };
  const parsed = couponFormSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };
  try {
    const coupon = await db.coupon.create({ data: toData(parsed.data) });
    revalidateOffers();
    return { success: true, id: coupon.id };
  } catch (error) {
    if (isUniqueConstraintErrorOn(error, "code")) return { success: false, message: `The code ${parsed.data.code} already exists. Pick another.` };
    throw error;
  }
}

export async function updateCouponAction(input: unknown): Promise<Result> {
  if (!(await getAdminSession())) return { success: false, message: "Please sign in again." };
  const parsed = updateCouponSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Please check the form." };
  const { id, ...rest } = parsed.data;
  try {
    await db.coupon.update({ where: { id }, data: toData(rest) });
    revalidateOffers();
    return { success: true, id };
  } catch (error) {
    if (isUniqueConstraintErrorOn(error, "code")) return { success: false, message: `The code ${rest.code} already exists. Pick another.` };
    throw error;
  }
}

export async function setCouponActiveAction(input: unknown): Promise<Result> {
  if (!(await getAdminSession())) return { success: false, message: "Please sign in again." };
  const parsed = setCouponActiveSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Coupon not found." };
  await db.coupon.update({ where: { id: parsed.data.id }, data: { isActive: parsed.data.isActive } });
  revalidateOffers();
  return { success: true, id: parsed.data.id };
}
