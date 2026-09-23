"use server";

import { revalidatePath } from "next/cache";
import { getBasketId } from "@/lib/basket";
import { checkoutInputSchema } from "@/lib/validation/checkout";
import { placeOrderForBasket, type PlaceOrderError } from "@/server/commerce/place-order";

export type CheckoutActionResult =
  | { success: true; orderNumber: string; accessToken: string }
  | {
      success: false;
      error:
        | { type: "VALIDATION"; message: string; fieldErrors: Record<string, string[]> }
        | PlaceOrderError;
    };

export async function placeOrder(input: unknown): Promise<CheckoutActionResult> {
  const parsed = checkoutInputSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        type: "VALIDATION",
        message: "Please check the highlighted fields.",
        fieldErrors: parsed.error.flatten().fieldErrors as Record<string, string[]>,
      },
    };
  }

  const basketId = await getBasketId();
  const result = await placeOrderForBasket(basketId, parsed.data);

  if (result.success) {
    // The basket is now CONVERTED — the bag icon/count and /bag page both
    // need to reflect "empty" immediately.
    revalidatePath("/", "layout");
    revalidatePath("/bag");
    return { success: true, orderNumber: result.orderNumber, accessToken: result.accessToken };
  }

  return { success: false, error: result.error };
}
