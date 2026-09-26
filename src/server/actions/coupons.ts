"use server";

import { z } from "zod";
import { basketTotalInPaise, getBasket } from "@/lib/basket";
import { describeCoupon } from "@/lib/coupons";
import { previewCoupon } from "@/server/coupons/coupons";

const schema = z.object({
  code: z.string().trim().min(1, "Enter a code.").max(40),
  fulfillmentType: z.enum(["STORE_PICKUP", "LOCAL_DELIVERY"]),
  /** The delivery fee the checkout is showing (from the server preview); 0 for pickup. */
  deliveryFeeInPaise: z.number().int().min(0).default(0),
  phone: z.string().trim().max(20).optional(),
});

export type ApplyCouponResult =
  | { success: true; code: string; description: string; discountInPaise: number; freeDelivery: boolean; savingInPaise: number }
  | { success: false; message: string };

/**
 * "Apply" at checkout. The bag total is read here from the customer's own
 * basket, never taken from the browser; the order is checked again, for
 * real, when it's placed.
 */
export async function applyCouponAction(input: unknown): Promise<ApplyCouponResult> {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Enter a code." };
  const basket = await getBasket();
  if (!basket || basket.items.length === 0) return { success: false, message: "Your bag is empty." };

  const preview = await previewCoupon({
    code: parsed.data.code,
    subtotalInPaise: basketTotalInPaise(basket),
    deliveryFeeInPaise: parsed.data.fulfillmentType === "LOCAL_DELIVERY" ? parsed.data.deliveryFeeInPaise : 0,
    isDelivery: parsed.data.fulfillmentType === "LOCAL_DELIVERY",
    phone: parsed.data.phone,
  });
  if (!preview.found) return { success: false, message: preview.reason };
  if (!preview.check.ok) return { success: false, message: preview.check.reason };
  return {
    success: true,
    code: preview.coupon.code,
    description: describeCoupon(preview.coupon),
    discountInPaise: preview.check.discountInPaise,
    freeDelivery: preview.check.freeDelivery,
    savingInPaise: preview.check.savingInPaise,
  };
}
