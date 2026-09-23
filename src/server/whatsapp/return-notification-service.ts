import "server-only";
import type { FulfillmentType, ReturnRequestType } from "@prisma/client";
import { BRAND } from "@/lib/constants";
import { normalizePhoneNumber } from "@/lib/phone";
import { SITE_URL } from "@/lib/site-config";
import { getWhatsAppTransportConfig } from "@/server/whatsapp/config";
import { getNotificationSender } from "@/server/whatsapp/notification-sender";
import {
  RETURN_NOTIFICATION_TEMPLATE_ENV_VAR,
  type ReturnNotificationEvent,
} from "@/server/whatsapp/return-notification-events";

/**
 * Everything `notifyReturnEvent` needs to know about a ReturnRequest and
 * its parent order — a plain, DB-free shape, exactly mirroring
 * `OrderForNotification`'s own convention (notification-service.ts, Part
 * 2). Callers (`returns.ts`/`admin-returns.ts`/`return-fulfillment.ts`)
 * resolve every field themselves from an already-fetched `ReturnRequest`
 * + `Order` (+ `Order.school`) — this service stays Prisma-free.
 *
 * No `source`/`OrderSource` field here (contrast `OrderForNotification`)
 * — Part 3 deliberately does NOT exclude Counter-originated orders from
 * Return/Exchange notifications; see "Source" in
 * docs/PHASE_3_6_REPORT.md Part 3 for the full reasoning (a return/
 * exchange always has a genuine, multi-day waiting process regardless of
 * how the original order was placed, unlike Part 2's already-complete
 * Counter sale).
 */
export type ReturnRequestForNotification = {
  returnNumber: string;
  returnType: ReturnRequestType;
  /** Only read for `RETURN_REJECTED` — see `updateReturnRequestStatus`'s
   * own doc comment: this field is ALREADY an established customer-visible
   * value (schema.prisma), never an internal-only admin note. */
  rejectionReason: string | null;
  orderNumber: string;
  accessToken: string;
  fulfillmentType: FulfillmentType;
  customerName: string | null;
  customerMobile: string | null;
  customerWhatsapp: string | null;
};

/**
 * Section 4's "current status... next expected action," expressed as one
 * short sentence per event. Deliberately does NOT fold in a school name
 * (contrast `buildContextLine` in notification-service.ts) — section 4's
 * required fields are status, Return Number, Order Number, next action,
 * and (where appropriate) the tracking link; a school name isn't among
 * them, and a return/exchange's identity is already anchored by its own
 * Return Number, so adding it would be scope creep beyond "concise."
 *
 * `EXCHANGE_COMPLETED` is fulfillment-aware, folding in what the brief
 * calls "Exchange Ready" (see return-notification-events.ts's own doc
 * comment for why that isn't a separate event): Store Pickup/Counter
 * Handover gets "ready for collection" wording, Local Delivery gets a
 * plain "completed" — this system has no separate "exchange dispatched"
 * tracking, so it never claims more than what's actually known.
 */
function buildReturnContextLine(
  event: ReturnNotificationEvent,
  returnType: ReturnRequestType,
  fulfillmentType: FulfillmentType,
  rejectionReason: string | null,
): string {
  const typeWord = returnType === "EXCHANGE" ? "exchange" : "return";
  switch (event) {
    case "RETURN_REQUESTED":
      return `Your ${typeWord} request has been submitted and is awaiting review.`;
    case "RETURN_APPROVED":
      return "Your return has been approved. Please send or bring the item back to us.";
    case "EXCHANGE_APPROVED":
      return "Your exchange has been approved. Please send or bring the item back to us.";
    case "RETURN_REJECTED":
      return rejectionReason
        ? `Your ${typeWord} request could not be approved: ${rejectionReason}`
        : `Your ${typeWord} request could not be approved at this time.`;
    case "ITEM_RECEIVED":
      return "We've received your returned item and are processing it.";
    case "RETURN_COMPLETED":
      return "Your return has been completed.";
    case "EXCHANGE_COMPLETED":
      return fulfillmentType === "LOCAL_DELIVERY"
        ? "Your exchange has been completed."
        : `Your exchange is ready for collection at ${BRAND.legacyStoreNames[0]}.`;
  }
}

/**
 * The one entry point for every Return/Exchange WhatsApp notification —
 * mirrors `notifyOrderEvent`'s (Part 2) shape and every one of its
 * guarantees exactly: NEVER THROWS (every failure is caught, logged, and
 * swallowed here); reuses the SAME shared Meta client, transport config,
 * and sender-selection logic (`notification-sender.ts`) — no second
 * notification engine (section 1); reuses the SAME phone-selection
 * fallback chain as Part 2 (section 10); logs only operational metadata,
 * never rejection reasons or other message content (section 12).
 *
 * CALLERS are responsible for only ever invoking this AFTER the
 * authoritative return/exchange transaction has actually committed, and
 * only once per genuine event — see "Duplicate prevention" in
 * docs/PHASE_3_6_REPORT.md Part 3 for why that's enforced at the call
 * site (reusing `updateReturnRequestStatus`/`receiveReturnRequest`'s own
 * existing idempotency/concurrency guarantees) rather than re-invented
 * here.
 */
export async function notifyReturnEvent(
  request: ReturnRequestForNotification,
  event: ReturnNotificationEvent,
): Promise<void> {
  try {
    // Section 10 — the exact same fallback chain as Part 2, no new rules:
    // (1) the order's checkout-time WhatsApp snapshot, (2) the order's own
    // mobile number, (3) skip if neither is on file. Never falls back to
    // `Customer.whatsappPhone` (the customer's CURRENT, mutable profile).
    const rawPhone = request.customerWhatsapp ?? request.customerMobile;
    if (!rawPhone) {
      console.error("whatsapp-return-notification-service: no phone on file, skipping", {
        event,
        returnNumber: request.returnNumber,
      });
      return;
    }
    const normalizedPhone = normalizePhoneNumber(rawPhone);
    if (!normalizedPhone.valid) {
      console.error("whatsapp-return-notification-service: invalid phone on file, skipping", {
        event,
        returnNumber: request.returnNumber,
      });
      return;
    }

    const templateEnvVar = RETURN_NOTIFICATION_TEMPLATE_ENV_VAR[event];
    const templateName = process.env[templateEnvVar];
    if (!templateName) {
      console.error("whatsapp-return-notification-service: template not configured, skipping", {
        event,
        returnNumber: request.returnNumber,
      });
      return;
    }

    const transportConfig = getWhatsAppTransportConfig();
    const sender = getNotificationSender();
    const contextLine = buildReturnContextLine(event, request.returnType, request.fulfillmentType, request.rejectionReason);
    // Reuses the EXISTING secure per-order tracking link (Part 2) — no new
    // return-specific secure token/URL was introduced; see "Tracking link"
    // in docs/PHASE_3_6_REPORT.md Part 3 for why. Never the raw internal
    // `ReturnRequest.id`/`Order.id`.
    const trackingUrl = `${SITE_URL}/order/${request.orderNumber}/${request.accessToken}`;

    await sender.send(transportConfig, {
      phoneNormalized: normalizedPhone.normalized,
      templateName,
      templateLanguage: process.env.WHATSAPP_NOTIFICATION_TEMPLATE_LANGUAGE ?? "en_US",
      bodyParameters: [
        request.customerName ?? "Customer",
        request.returnNumber,
        request.orderNumber,
        contextLine,
        trackingUrl,
      ],
      logLabel: `return-notification:${event}`,
    });
  } catch {
    // The underlying client already logs categorized failure detail
    // (httpStatus/metaErrorCode) under the same `logLabel`; this outer
    // line only adds return-level context, and never re-logs the
    // rejection reason or any other message content.
    console.error("whatsapp-return-notification-service: delivery failed", {
      event,
      returnNumber: request.returnNumber,
    });
  }
}
