import type { ReturnRequestStatus, ReturnRequestType } from "@prisma/client";

/**
 * The fixed, closed set of Return/Exchange notification events this
 * phase supports — see docs/PHASE_3_6_REPORT.md Part 3 "Events" for the
 * full audit of why this is SEVEN events, not the brief's eight named
 * items. `return-lifecycle.ts`'s actual `ReturnRequestStatus` enum has
 * only six values (REQUESTED/APPROVED/REJECTED/RECEIVED/COMPLETED/
 * CANCELLED) and `receiveReturnRequest`
 * (src/server/commerce/return-fulfillment.ts) stamps RECEIVED and
 * COMPLETED together, atomically, in one admin action — there is no
 * separate "ready to hand over" state recorded anywhere for an exchange.
 * "Exchange Ready" (the brief's 7th named item) is therefore folded into
 * `EXCHANGE_COMPLETED`'s own fulfillment-aware content rather than
 * invented as an eighth, non-existent database state (section 2: "Only
 * implement events that genuinely exist... do not invent new business
 * states"). `CANCELLED` has no entry — not in the brief's list, mirroring
 * Part 2's identical exclusion of `OrderStatus.CANCELLED`.
 */
export type ReturnNotificationEvent =
  | "RETURN_REQUESTED"
  | "RETURN_APPROVED"
  | "EXCHANGE_APPROVED"
  | "RETURN_REJECTED"
  | "ITEM_RECEIVED"
  | "RETURN_COMPLETED"
  | "EXCHANGE_COMPLETED";

/**
 * Maps a genuinely-reached `ReturnRequestStatus` transition TARGET, plus
 * the request's own `type` (RETURN vs EXCHANGE — the only place that
 * distinction lives, per `ReturnRequestItem`'s own schema doc comment),
 * to its notification event. Never guessed — every call site only
 * invokes this after `updateReturnRequestStatus`/`receiveReturnRequest`'s
 * own guarded transition has actually committed (see
 * `src/server/commerce/admin-returns.ts`/`return-fulfillment.ts`).
 *
 * `REQUESTED` has no entry — it isn't reached via a status TRANSITION at
 * all (nothing in `RETURN_STATUS_TRANSITIONS` ever moves INTO it; see
 * `src/lib/return-lifecycle.ts`), it fires once at ReturnRequest CREATION
 * instead (`src/server/commerce/returns.ts`), exactly mirroring
 * `ORDER_PLACED`'s own precedent in Part 2. `CANCELLED` has no entry —
 * not in section 2's fixed list. `RECEIVED` is deliberately absent from
 * THIS table (it maps to the generic `ITEM_RECEIVED` event regardless of
 * `type` — see `notifyReturnEvent`'s own handling — so it doesn't need a
 * type-keyed row).
 */
export const RETURN_STATUS_TRANSITION_EVENT: Partial<
  Record<ReturnRequestStatus, Record<ReturnRequestType, ReturnNotificationEvent>>
> = {
  APPROVED: { RETURN: "RETURN_APPROVED", EXCHANGE: "EXCHANGE_APPROVED" },
  COMPLETED: { RETURN: "RETURN_COMPLETED", EXCHANGE: "EXCHANGE_COMPLETED" },
};

/**
 * One dedicated, Meta-approved template per event (section 11) — never
 * the OTP template, never an Order-notification template (Part 2), never
 * shared across events. Each value here is the NAME of the environment
 * variable holding that event's real template name — see `.env.example`
 * and `return-notification-service.ts`.
 */
export const RETURN_NOTIFICATION_TEMPLATE_ENV_VAR: Record<ReturnNotificationEvent, string> = {
  RETURN_REQUESTED: "WHATSAPP_RETURN_REQUESTED_TEMPLATE_NAME",
  RETURN_APPROVED: "WHATSAPP_RETURN_APPROVED_TEMPLATE_NAME",
  EXCHANGE_APPROVED: "WHATSAPP_EXCHANGE_APPROVED_TEMPLATE_NAME",
  RETURN_REJECTED: "WHATSAPP_RETURN_REJECTED_TEMPLATE_NAME",
  ITEM_RECEIVED: "WHATSAPP_RETURN_ITEM_RECEIVED_TEMPLATE_NAME",
  RETURN_COMPLETED: "WHATSAPP_RETURN_COMPLETED_TEMPLATE_NAME",
  EXCHANGE_COMPLETED: "WHATSAPP_EXCHANGE_COMPLETED_TEMPLATE_NAME",
};
