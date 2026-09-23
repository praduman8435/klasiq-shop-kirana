import "server-only";
import type { FulfillmentType, OrderSource } from "@prisma/client";
import { BRAND } from "@/lib/constants";
import { normalizePhoneNumber } from "@/lib/phone";
import { SITE_URL } from "@/lib/site-config";
import { getWhatsAppTransportConfig } from "@/server/whatsapp/config";
import { NOTIFICATION_TEMPLATE_ENV_VAR, type OrderNotificationEvent } from "@/server/whatsapp/notification-events";
import { getNotificationSender } from "@/server/whatsapp/notification-sender";

/**
 * Everything `notifyOrderEvent` needs to know about an order — a plain,
 * DB-free shape (mirrors `return-eligibility.ts`/`order-tracking.ts`'s
 * own "pure business logic, no Prisma types leaking in" convention) so
 * this service stays trivially unit-testable and so callers control
 * exactly which query produced these values (see `place-order.ts`/
 * `update-order-status.ts`'s own integration for why `schoolName` is a
 * plain string the CALLER resolves, not something this service queries
 * for itself).
 */
export type OrderForNotification = {
  orderNumber: string;
  accessToken: string;
  source: OrderSource;
  fulfillmentType: FulfillmentType;
  customerName: string | null;
  customerMobile: string | null;
  /** The checkout-time WhatsApp snapshot (`Order.customerWhatsapp`) —
   * see "Customer phone selection" below for the full fallback chain. */
  customerWhatsapp: string | null;
};

/**
 * Section 6's "concise... only useful information," expressed as one
 * short sentence per event.
 * `DELIVERED` is fulfillment-aware — "collected" for Store Pickup vs.
 * "delivered" for Local Delivery — reusing the exact same distinction
 * the customer portal's own tracking timeline already makes
 * (`src/lib/order-tracking.ts`), never inventing a second convention for
 * the same fact.
 */
function buildContextLine(
  event: OrderNotificationEvent,
  fulfillmentType: FulfillmentType,
): string {
  switch (event) {
    case "ORDER_PLACED":
      return "Your order has been placed and is being processed.";
    case "ORDER_CONFIRMED":
      return "Your order has been confirmed.";
    case "PREPARING":
      return "Your order is being prepared.";
    case "READY_FOR_PICKUP":
      return `Your order is ready for pickup at ${BRAND.legacyStoreNames[0]}.`;
    case "DELIVERED":
      return fulfillmentType === "STORE_PICKUP"
        ? "Your order has been collected."
        : "Your order has been delivered.";
  }
}

/**
 * The one entry point for every order-lifecycle WhatsApp notification —
 * `WhatsAppNotificationService`'s one responsibility (section 3): send
 * transactional notifications, nothing else. No authentication concern
 * of any kind lives here (contrast `src/server/otp/provider.ts`, a
 * completely separate module tree).
 *
 * NEVER THROWS. Every failure — Counter exclusion, no phone on file, no
 * template configured, a real Meta API failure — is caught, logged, and
 * swallowed here, so a caller (`place-order.ts`/`update-order-status.ts`)
 * never needs its own try/catch and a WhatsApp problem can never turn a
 * successful commerce operation into a customer-visible error. See
 * docs/PHASE_3_6_REPORT.md Part 2 "Failure handling".
 *
 * CALLERS are responsible for only ever invoking this AFTER the
 * authoritative business transaction has actually committed, and only
 * once per genuine event (never on an idempotent no-op) — see
 * "Delivery policy" / "Duplicate prevention" in the same report section
 * for why that's enforced at the call site (reusing each transaction's
 * own existing idempotency guarantee) rather than re-invented here.
 */
export async function notifyOrderEvent(order: OrderForNotification, event: OrderNotificationEvent): Promise<void> {
  try {
    // Section 13 — Counter sales are excluded from every one of these
    // five events; see docs/PHASE_3_6_REPORT.md Part 2 "Counter sales"
    // for the full reasoning. Checked here (not only at call sites) so
    // this holds even if a future call site forgets to check it itself.
    if (order.source === "COUNTER") return;

    // Section 12 — explicit fallback chain, never a guess: (1) the
    // checkout-time WhatsApp snapshot, (2) the order's own primary
    // mobile number, (3) no notification if neither is on file. Never
    // falls back to `Customer.whatsappPhone` (the customer's CURRENT,
    // mutable profile) — this order's own snapshot fields are what was
    // true when it was placed, consistent with every other "snapshot,
    // not live profile" decision already made for this exact field
    // (Phase 3.3 Part 3).
    const rawPhone = order.customerWhatsapp ?? order.customerMobile;
    if (!rawPhone) {
      console.error("whatsapp-notification-service: no phone on file, skipping", {
        event,
        orderNumber: order.orderNumber,
      });
      return;
    }
    const normalizedPhone = normalizePhoneNumber(rawPhone);
    if (!normalizedPhone.valid) {
      console.error("whatsapp-notification-service: invalid phone on file, skipping", {
        event,
        orderNumber: order.orderNumber,
      });
      return;
    }

    const templateEnvVar = NOTIFICATION_TEMPLATE_ENV_VAR[event];
    const templateName = process.env[templateEnvVar];
    if (!templateName) {
      console.error("whatsapp-notification-service: template not configured, skipping", {
        event,
        orderNumber: order.orderNumber,
      });
      return;
    }

    const transportConfig = getWhatsAppTransportConfig();
    const sender = getNotificationSender();
    const contextLine = buildContextLine(event, order.fulfillmentType);
    // Reuses the EXISTING secure, per-order confirmation URL (Phase 2) —
    // never a new mechanism, never the customer-portal's own session-
    // based route. The access token in this URL is not "exposed
    // unnecessarily" (section 15) — it IS the intentionally-shareable
    // secret this exact URL was designed around from the start; see
    // docs/PHASE_2_REPORT.md "Order lookup security". Never the raw
    // internal `Order.id`.
    const trackingUrl = `${SITE_URL}/order/${order.orderNumber}/${order.accessToken}`;

    await sender.send(transportConfig, {
      phoneNormalized: normalizedPhone.normalized,
      templateName,
      templateLanguage: process.env.WHATSAPP_NOTIFICATION_TEMPLATE_LANGUAGE ?? "en_US",
      bodyParameters: [order.customerName ?? "Customer", order.orderNumber, contextLine, trackingUrl],
      logLabel: `order-notification:${event}`,
    });
  } catch {
    // The underlying client (src/server/whatsapp/client.ts) already logs
    // the categorized failure detail (httpStatus/metaErrorCode) under the
    // same `logLabel`; this outer line only adds the order-level context
    // that log line can't have, and never re-logs the error's own
    // message (already generic and non-sensitive, but redundant here).
    console.error("whatsapp-notification-service: delivery failed", {
      event,
      orderNumber: order.orderNumber,
    });
  }
}
