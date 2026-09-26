"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getOrCreateBasketId } from "@/lib/basket";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { CUSTOMER_CANCEL_REASONS } from "@/lib/order-lifecycle";
import { cancelOrderByCustomer } from "@/server/commerce/cancel-order";
import { reorderIntoBasket, type ReorderResult } from "@/server/customer-portal/reorder";

type Failure = { success: false; message: string };
const SIGN_IN_AGAIN: Failure = { success: false, message: "Please enter your mobile number again." };

const orderNumberSchema = z.string().trim().min(1).max(40);

const cancelSchema = z.object({
  orderNumber: orderNumberSchema,
  reason: z.enum(CUSTOMER_CANCEL_REASONS),
});

/** The customer cancels their own order. The customer is taken from the
 * verified session, never from the input. */
export async function cancelMyOrderAction(input: unknown): Promise<{ success: true } | Failure> {
  const session = await getCustomerSession();
  if (!session?.customer) return SIGN_IN_AGAIN;
  const parsed = cancelSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: "Please pick a reason." };

  const result = await cancelOrderByCustomer({
    orderNumber: parsed.data.orderNumber,
    customerDbId: session.customer.id,
    reason: parsed.data.reason,
  });
  if (!result.success) return { success: false, message: result.error.message };

  revalidatePath("/track/orders");
  revalidatePath(`/track/orders/${parsed.data.orderNumber}`);
  revalidatePath("/admin/orders");
  revalidatePath("/admin");
  return { success: true };
}

/** "Order again": a past order's items back in the bag, at today's prices. */
export async function reorderAction(input: unknown): Promise<ReorderResult> {
  const session = await getCustomerSession();
  if (!session?.customer) return SIGN_IN_AGAIN;
  const parsed = z.object({ orderNumber: orderNumberSchema }).safeParse(input);
  if (!parsed.success) return { success: false, message: "Order not found." };

  const basketId = await getOrCreateBasketId();
  const result = await reorderIntoBasket({
    orderNumber: parsed.data.orderNumber,
    customerDbId: session.customer.id,
    basketId,
  });
  if (result.success && result.added.length > 0) {
    revalidatePath("/", "layout");
    revalidatePath("/bag");
  }
  return result;
}
