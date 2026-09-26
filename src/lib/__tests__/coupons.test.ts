import { describe, expect, it } from "vitest";
import { bestNudge, checkCoupon, couponStatus, describeCoupon, itemDiscountInPaise, normalizeCouponCode, type CouponRules } from "@/lib/coupons";

const now = new Date("2026-09-27T06:00:00Z");
const base: CouponRules = {
  code: "SAVE50",
  type: "FLAT",
  value: 5000,
  maxDiscountInPaise: null,
  minOrderInPaise: 49900,
  startsAt: null,
  expiresAt: null,
  usageLimit: null,
  perCustomerLimit: 1,
  firstOrderOnly: false,
  isActive: true,
};
const ctx = { subtotalInPaise: 60000, deliveryFeeInPaise: 5000, now, usedCount: 0, usedByCustomer: 0, isFirstOrder: true, isDelivery: true };

describe("coupon rules", () => {
  it("takes a flat amount off once the minimum is met", () => {
    expect(checkCoupon(base, ctx)).toEqual({ ok: true, discountInPaise: 5000, freeDelivery: false, savingInPaise: 5000 });
  });

  it("says how much more to add below the minimum", () => {
    expect(checkCoupon(base, { ...ctx, subtotalInPaise: 38000 })).toEqual({ ok: false, reason: "Add ₹119 more to use this code.", shortfallInPaise: 11900 });
  });

  it("caps a percentage and never goes over the bill", () => {
    const pct = { ...base, type: "PERCENT" as const, value: 10, maxDiscountInPaise: 10000, minOrderInPaise: 0 };
    expect(itemDiscountInPaise(pct, 60000)).toBe(6000);
    expect(itemDiscountInPaise(pct, 200000)).toBe(10000);
    expect(itemDiscountInPaise({ ...base, value: 90000 }, 60000)).toBe(60000);
  });

  it("gives free delivery only on a delivery order that has a fee", () => {
    const free = { ...base, type: "FREE_DELIVERY" as const, value: 0, minOrderInPaise: 29900 };
    expect(checkCoupon(free, ctx)).toEqual({ ok: true, discountInPaise: 0, freeDelivery: true, savingInPaise: 5000 });
    expect(checkCoupon(free, { ...ctx, isDelivery: false })).toMatchObject({ ok: false, reason: expect.stringMatching(/home delivery/) });
    expect(checkCoupon(free, { ...ctx, deliveryFeeInPaise: 0 })).toMatchObject({ ok: false, reason: "Delivery is already free on this order." });
  });

  it("respects dates, pausing, total uses, per-customer uses and first order", () => {
    expect(checkCoupon({ ...base, expiresAt: new Date("2026-09-27T00:00:00Z") }, ctx)).toMatchObject({ reason: "This code has expired." });
    expect(checkCoupon({ ...base, startsAt: new Date("2026-09-28T00:00:00Z") }, ctx)).toMatchObject({ reason: "This offer hasn't started yet." });
    expect(checkCoupon({ ...base, isActive: false }, ctx)).toMatchObject({ reason: "This code isn't active." });
    expect(checkCoupon({ ...base, usageLimit: 3 }, { ...ctx, usedCount: 3 })).toMatchObject({ reason: "This offer has been fully used." });
    expect(checkCoupon(base, { ...ctx, usedByCustomer: 1 })).toMatchObject({ reason: "You've already used this code." });
    expect(checkCoupon({ ...base, firstOrderOnly: true }, { ...ctx, isFirstOrder: false })).toMatchObject({ reason: "This code is only for your first online order." });
    // Unknown customer: their own limits wait for the order.
    expect(checkCoupon({ ...base, firstOrderOnly: true }, { ...ctx, usedByCustomer: null, isFirstOrder: null }).ok).toBe(true);
  });

  it("status and wording", () => {
    expect(couponStatus(base, 0, now)).toBe("live");
    expect(describeCoupon(base)).toBe("₹50 off on orders of ₹499 or more");
    expect(describeCoupon({ ...base, type: "PERCENT", value: 10, maxDiscountInPaise: 10000, minOrderInPaise: 0, firstOrderOnly: true })).toBe(
      "10% off up to ₹100 · first online order",
    );
    expect(normalizeCouponCode(" save 50 ")).toBe("SAVE50");
  });
});

describe("bag nudge", () => {
  const coupons = [
    { ...base, code: "SAVE50", minOrderInPaise: 49900 },
    { ...base, code: "SAVE100", value: 10000, minOrderInPaise: 99900 },
    { ...base, code: "FAR", value: 30000, minOrderInPaise: 500000 },
  ];
  it("points at the closest offer still to unlock", () => {
    expect(bestNudge(coupons, 40000, now, () => 0)).toMatchObject({ coupon: { code: "SAVE50" }, shortfallInPaise: 9900 });
  });
  it("moves to the next one once the first is unlocked, and ignores far-off ones", () => {
    expect(bestNudge(coupons, 60000, now, () => 0)).toMatchObject({ coupon: { code: "SAVE100" }, shortfallInPaise: 39900 });
    expect(bestNudge([coupons[2]], 60000, now, () => 0)).toBeNull();
  });
  it("shows an unlocked offer when nothing else is in reach", () => {
    expect(bestNudge([coupons[0]], 60000, now, () => 0)).toMatchObject({ coupon: { code: "SAVE50" }, shortfallInPaise: 0 });
  });
});
