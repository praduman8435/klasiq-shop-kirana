import type { OrderStatus } from "@prisma/client";

/**
 * The fixed, closed set of order-lifecycle events this phase notifies on
 * — exactly section 4 of the Phase 3.6 Part 2 brief, no more. Adding a
 * 6th event (e.g. Cancelled, Out for Delivery) is explicitly out of
 * scope here; Returns/Exchange notifications are Part 3's job.
 */
export type OrderNotificationEvent =
  | "ORDER_PLACED"
  | "ORDER_CONFIRMED"
  | "PREPARING"
  | "READY_FOR_PICKUP"
  | "DELIVERED";

/**
 * Maps a genuinely-reached `OrderStatus` (the transition TARGET, never
 * inferred or guessed — see `update-order-status.ts`'s own integration,
 * which only ever calls this after a REAL, guarded transition succeeds)
 * to its notification event. Deliberately partial: `PENDING`,
 * `OUT_FOR_DELIVERY`, and `CANCELLED` have no entry and therefore never
 * notify in this phase — not in section 4's fixed list, so no template
 * exists for them, and inventing one would be scope creep. `ORDER_PLACED`
 * has no entry here at all, since it isn't a status transition — it
 * fires once, at order CREATION (`place-order.ts`), never via
 * `updateOrderStatus`.
 */
export const STATUS_TRANSITION_EVENT: Partial<Record<OrderStatus, OrderNotificationEvent>> = {
  CONFIRMED: "ORDER_CONFIRMED",
  PREPARING: "PREPARING",
  READY_FOR_PICKUP: "READY_FOR_PICKUP",
  DELIVERED: "DELIVERED",
};

/**
 * One dedicated, Meta-approved template per event (section 7) — never
 * the OTP template, never shared across events. Each value here is the
 * NAME of the environment variable holding that event's real template
 * name (not the template name itself) — see `.env.example` and
 * `resolveNotificationTemplateName` (notification-service.ts).
 */
export const NOTIFICATION_TEMPLATE_ENV_VAR: Record<OrderNotificationEvent, string> = {
  ORDER_PLACED: "WHATSAPP_ORDER_PLACED_TEMPLATE_NAME",
  ORDER_CONFIRMED: "WHATSAPP_ORDER_CONFIRMED_TEMPLATE_NAME",
  PREPARING: "WHATSAPP_ORDER_PREPARING_TEMPLATE_NAME",
  READY_FOR_PICKUP: "WHATSAPP_ORDER_READY_TEMPLATE_NAME",
  DELIVERED: "WHATSAPP_ORDER_DELIVERED_TEMPLATE_NAME",
};
