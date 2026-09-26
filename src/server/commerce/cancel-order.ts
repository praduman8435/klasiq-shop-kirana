import type { OrderCancelledBy, OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkCustomerCanCancel } from "@/lib/order-lifecycle";
import { applyInventoryDelta } from "@/server/commerce/inventory";

export class OrderStatusConflictError extends Error {}

/**
 * The one way an order becomes CANCELLED: a guarded status write (only if
 * the order is still in the status we read) plus every item's stock put
 * back, in the caller's transaction. Used by the shop (admin order page)
 * and by the customer (Track Orders), so both restore stock the same way.
 */
export async function cancelOrderInTransaction(
  tx: Prisma.TransactionClient,
  order: { id: string; status: OrderStatus; items: { productVariantId: string; quantity: number }[] },
  cancel: { by: OrderCancelledBy; reason?: string | null; adminUserId: string | null },
) {
  const updated = await tx.order.updateMany({
    where: { id: order.id, status: order.status },
    data: { status: "CANCELLED", cancelledAt: new Date(), cancelledBy: cancel.by, cancelReason: cancel.reason ?? null },
  });
  if (updated.count === 0) throw new OrderStatusConflictError();

  for (const item of order.items) {
    await applyInventoryDelta(tx, {
      productVariantId: item.productVariantId,
      delta: item.quantity,
      reason: "ORDER_CANCELLATION_RESTORE",
      note: cancel.by === "CUSTOMER" ? "Cancelled by customer" : undefined,
      adminUserId: cancel.adminUserId,
      orderId: order.id,
    });
  }
}

export type CustomerCancelResult =
  | { success: true }
  | { success: false; error: { type: "NOT_FOUND" | "NOT_ALLOWED" | "CONFLICT"; message: string } };

/**
 * A customer cancelling their own order from Track Orders. Scoped to the
 * signed-in customer: someone else's order is "not found", never a hint
 * that it exists. Allowed until the order leaves the shop (see
 * checkCustomerCanCancel).
 */
export async function cancelOrderByCustomer(params: {
  orderNumber: string;
  customerDbId: string;
  reason: string;
}): Promise<CustomerCancelResult> {
  const order = await db.order.findFirst({
    where: { orderNumber: params.orderNumber, customerId: params.customerDbId },
    include: { items: { select: { productVariantId: true, quantity: true } } },
  });
  if (!order) return { success: false, error: { type: "NOT_FOUND", message: "Order not found." } };

  const check = checkCustomerCanCancel(order);
  if (!check.allowed) return { success: false, error: { type: "NOT_ALLOWED", message: check.reason } };

  try {
    await db.$transaction((tx) =>
      cancelOrderInTransaction(tx, order, { by: "CUSTOMER", reason: params.reason, adminUserId: null }),
    );
  } catch (error) {
    if (error instanceof OrderStatusConflictError) {
      return {
        success: false,
        error: { type: "CONFLICT", message: "The shop just updated this order. Please check its status again." },
      };
    }
    throw error;
  }
  return { success: true };
}
