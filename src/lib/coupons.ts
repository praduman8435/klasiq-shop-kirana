import type { CouponType } from "@prisma/client";
import { formatPaise } from "@/lib/money";

export type CouponRules = {
  code: string;
  type: CouponType;
  value: number;
  maxDiscountInPaise: number | null;
  minOrderInPaise: number;
  startsAt: Date | null;
  expiresAt: Date | null;
  usageLimit: number | null;
  perCustomerLimit: number;
  firstOrderOnly: boolean;
  isActive: boolean;
};

/** Codes are stored and compared upper-case, without spaces. */
export function normalizeCouponCode(raw: string): string {
  return raw.replace(/\s+/g, "").toUpperCase();
}

/** "₹50 off on orders above ₹499", "10% off up to ₹100", "Free delivery". */
export function describeCoupon(c: Pick<CouponRules, "type" | "value" | "maxDiscountInPaise" | "minOrderInPaise" | "firstOrderOnly">): string {
  const what =
    c.type === "PERCENT"
      ? `${c.value}% off${c.maxDiscountInPaise ? ` up to ${formatPaise(c.maxDiscountInPaise)}` : ""}`
      : c.type === "FLAT"
        ? `${formatPaise(c.value)} off`
        : "Free delivery";
  const min = c.minOrderInPaise > 0 ? ` on orders of ${formatPaise(c.minOrderInPaise)} or more` : "";
  return `${what}${min}${c.firstOrderOnly ? " · first online order" : ""}`;
}

/** The short headline for a coupon card: "₹50 OFF", "10% OFF", "FREE DELIVERY". */
export function couponHeadline(c: Pick<CouponRules, "type" | "value">): string {
  return c.type === "PERCENT" ? `${c.value}% OFF` : c.type === "FLAT" ? `${formatPaise(c.value)} OFF` : "FREE DELIVERY";
}

export type CouponStatus = "live" | "scheduled" | "expired" | "used-up" | "off";

export function couponStatus(c: Pick<CouponRules, "isActive" | "startsAt" | "expiresAt" | "usageLimit">, usedCount: number, now: Date): CouponStatus {
  if (!c.isActive) return "off";
  if (c.expiresAt && now >= c.expiresAt) return "expired";
  if (c.usageLimit !== null && usedCount >= c.usageLimit) return "used-up";
  if (c.startsAt && now < c.startsAt) return "scheduled";
  return "live";
}

/** Money off the items for a subtotal (not the delivery part). */
export function itemDiscountInPaise(c: Pick<CouponRules, "type" | "value" | "maxDiscountInPaise">, subtotalInPaise: number): number {
  if (c.type === "FLAT") return Math.min(c.value, subtotalInPaise);
  if (c.type === "PERCENT") {
    const raw = Math.floor((subtotalInPaise * c.value) / 100);
    return Math.min(raw, c.maxDiscountInPaise ?? raw, subtotalInPaise);
  }
  return 0;
}

export type CouponCheck =
  | {
      ok: true;
      /** Off the items. */
      discountInPaise: number;
      /** True for a free-delivery coupon. */
      freeDelivery: boolean;
      /** What the customer saves in total (items + delivery waived). */
      savingInPaise: number;
    }
  | { ok: false; reason: string; shortfallInPaise?: number };

/**
 * Can this coupon be used on this order, and what does it save? Every
 * "no" says why in words the customer understands. `usedByCustomer` and
 * `isFirstOrder` are null when the customer isn't known yet (no phone
 * number) — those checks then wait for the order to be placed.
 */
export function checkCoupon(
  c: CouponRules,
  ctx: {
    subtotalInPaise: number;
    deliveryFeeInPaise: number;
    now: Date;
    usedCount: number;
    usedByCustomer: number | null;
    isFirstOrder: boolean | null;
    isDelivery: boolean;
  },
): CouponCheck {
  const status = couponStatus(c, ctx.usedCount, ctx.now);
  if (status === "off") return { ok: false, reason: "This code isn't active." };
  if (status === "expired") return { ok: false, reason: "This code has expired." };
  if (status === "used-up") return { ok: false, reason: "This offer has been fully used." };
  if (status === "scheduled") return { ok: false, reason: "This offer hasn't started yet." };
  if (ctx.subtotalInPaise < c.minOrderInPaise) {
    const shortfallInPaise = c.minOrderInPaise - ctx.subtotalInPaise;
    return { ok: false, reason: `Add ${formatPaise(shortfallInPaise)} more to use this code.`, shortfallInPaise };
  }
  if (ctx.usedByCustomer !== null && ctx.usedByCustomer >= c.perCustomerLimit) {
    return { ok: false, reason: c.perCustomerLimit === 1 ? "You've already used this code." : "You've used this code the most times allowed." };
  }
  if (c.firstOrderOnly && ctx.isFirstOrder === false) {
    return { ok: false, reason: "This code is only for your first online order." };
  }
  if (c.type === "FREE_DELIVERY") {
    if (!ctx.isDelivery) return { ok: false, reason: "This code gives free delivery. Choose home delivery to use it." };
    if (ctx.deliveryFeeInPaise === 0) return { ok: false, reason: "Delivery is already free on this order." };
    return { ok: true, discountInPaise: 0, freeDelivery: true, savingInPaise: ctx.deliveryFeeInPaise };
  }
  const discountInPaise = itemDiscountInPaise(c, ctx.subtotalInPaise);
  if (discountInPaise <= 0) return { ok: false, reason: "This code doesn't apply to this order." };
  return { ok: true, discountInPaise, freeDelivery: false, savingInPaise: discountInPaise };
}

/**
 * The bag nudge: the website offer the customer is closest to unlocking
 * ("Add ₹120 more for ₹50 off"), or one they can already use. Offers far
 * out of reach (more than double what's in the bag) aren't shown.
 */
export function bestNudge<T extends CouponRules>(
  coupons: T[],
  subtotalInPaise: number,
  now: Date,
  usedCount: (c: T) => number,
): { coupon: T; shortfallInPaise: number } | null {
  const scored = coupons
    .filter((c) => couponStatus(c, usedCount(c), now) === "live")
    .filter((c) => c.minOrderInPaise <= subtotalInPaise * 2)
    .map((c) => ({
      coupon: c,
      shortfallInPaise: Math.max(0, c.minOrderInPaise - subtotalInPaise),
      value: c.type === "FREE_DELIVERY" ? 1 : itemDiscountInPaise(c, Math.max(subtotalInPaise, c.minOrderInPaise)),
    }));
  // Something still to unlock is the better nudge: closest first, then biggest.
  const toUnlock = scored.filter((s) => s.shortfallInPaise > 0).sort((a, b) => a.shortfallInPaise - b.shortfallInPaise || b.value - a.value);
  const usable = scored.filter((s) => s.shortfallInPaise === 0).sort((a, b) => b.value - a.value);
  const pick = toUnlock[0] ?? usable[0];
  return pick ? { coupon: pick.coupon, shortfallInPaise: pick.shortfallInPaise } : null;
}
