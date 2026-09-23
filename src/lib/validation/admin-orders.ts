import { z } from "zod";

export const ORDER_STATUS_VALUES = [
  "PENDING",
  "CONFIRMED",
  "PREPARING",
  "READY_FOR_PICKUP",
  "OUT_FOR_DELIVERY",
  "DELIVERED",
  "CANCELLED",
] as const;

export const PAYMENT_STATUS_VALUES = ["UNPAID", "PAID", "REFUNDED", "FAILED"] as const;

export const updateOrderStatusSchema = z.object({
  orderNumber: z.string().min(1),
  newStatus: z.enum(ORDER_STATUS_VALUES),
});

export const updatePaymentStatusSchema = z.object({
  orderNumber: z.string().min(1),
  newPaymentStatus: z.enum(PAYMENT_STATUS_VALUES),
});

export const ORDER_SOURCE_VALUES = ["ONLINE", "COUNTER"] as const;

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export const adminOrderFiltersSchema = z.object({
  status: z.enum(ORDER_STATUS_VALUES).optional(),
  paymentStatus: z.enum(PAYMENT_STATUS_VALUES).optional(),
  fulfillmentType: z.enum(["STORE_PICKUP", "LOCAL_DELIVERY", "COUNTER_HANDOVER"]).optional(),
  source: z.enum(ORDER_SOURCE_VALUES).optional(),
  // Plain YYYY-MM-DD, matching a native <input type="date">. Inclusive on
  // both ends — see getAdminOrders for how each is turned into a
  // start-of-day/end-of-day createdAt bound.
  dateFrom: z.string().regex(DATE_ONLY_PATTERN).optional(),
  dateTo: z.string().regex(DATE_ONLY_PATTERN).optional(),
  query: z.string().trim().max(100).optional(),
});
