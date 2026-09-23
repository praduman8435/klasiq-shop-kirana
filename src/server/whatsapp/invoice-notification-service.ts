import "server-only";
import { formatPaise } from "@/lib/money";
import { normalizePhoneNumber } from "@/lib/phone";
import { getInvoiceNumber } from "@/lib/invoice-presentation";
import type { Invoice } from "@/server/commerce/invoice";
import { getWhatsAppTransportConfig } from "@/server/whatsapp/config";
import { getNotificationSender } from "@/server/whatsapp/notification-sender";

/**
 * Phase 3.6.6 Part 3 — reuses `Invoice` (Part 2, src/server/commerce/invoice.ts)
 * directly as this service's input, rather than inventing a parallel
 * `InvoiceForNotification` shape. `Invoice` is already exactly the kind of
 * plain, DB-free, "no Prisma types leaking in" object
 * `OrderForNotification`/`ReturnRequestForNotification` (Parts 2/3 of
 * Phase 3.6) were hand-built to be — it already carries every field this
 * service needs (customer name/mobile/WhatsApp, source, the three money
 * figures) with nothing extra. Defining a second, identically-shaped type
 * would duplicate, not reuse, Part 2's own model.
 */

export type SendInvoiceWhatsAppError =
  | { type: "NO_PHONE"; message: string }
  | { type: "INVALID_PHONE"; message: string }
  | { type: "NOT_CONFIGURED"; message: string }
  | { type: "DELIVERY_FAILED"; message: string };

export type SendInvoiceResult = { success: true } | { success: false; error: SendInvoiceWhatsAppError };

const INVOICE_LOG_LABEL = "invoice-whatsapp";

/**
 * Section 5/6 — the one reusable invoice-notification content builder.
 * Never a variable count of template parameters (mirrors Parts 2/3's own
 * "fixed shape per domain" precedent): outstanding handling is content
 * branching within this ONE parameter, not an extra slot that would have
 * to be conditionally included or left awkwardly blank. Counter-only,
 * mirroring the identical "Amount Received/Outstanding shown for Counter
 * Sale only" rule already used on the Admin Order Detail page, the Track
 * Order page, and the invoice PDF/Print layout itself (Part 2) — an
 * ONLINE order always has `outstandingInPaise === 0` by construction, so
 * this branch is structurally unreachable for it, not merely untested.
 */
export function buildInvoicePaymentLine(invoice: Pick<Invoice, "source" | "amountReceivedInPaise" | "outstandingInPaise">): string {
  if (invoice.source === "COUNTER" && invoice.outstandingInPaise > 0) {
    return `You've paid ${formatPaise(invoice.amountReceivedInPaise)}, with ${formatPaise(invoice.outstandingInPaise)} outstanding — please clear this at your earliest convenience. Thank you for shopping with us!`;
  }
  return "Thank you for shopping with us!";
}

/**
 * Sends `invoice` (already generated as `pdf` by the caller via Part 2's
 * `generateInvoicePdf` — section 4's "never generate a second PDF
 * implementation") as a WhatsApp document-template message.
 *
 * Unlike `notifyOrderEvent`/`notifyReturnEvent` (Phase 3.6 Parts 2/3),
 * this function does NOT swallow every failure silently — it is invoked
 * by a direct, on-demand admin action (a "Send Invoice" button), never as
 * a side effect of a commerce transaction with nothing else for the
 * caller to report to a waiting user. Section 8's "Admin receives a
 * clear notification" on failure requires a real, inspectable result,
 * not a silent log line the admin can't see. It still NEVER throws — every
 * failure is caught and converted to a typed `{success: false, error}`
 * result, so a WhatsApp problem can never surface as an unhandled Server
 * Action error. It also NEVER mutates any data — no `Order`/`Customer`
 * row is read or written anywhere in this function or its callees, so
 * section 8's "Customer data remains unchanged" holds trivially, by
 * construction, regardless of outcome.
 */
export async function sendInvoiceOverWhatsApp(invoice: Invoice, pdf: Buffer): Promise<SendInvoiceResult> {
  // Section 7 — the EXACT same phone-selection priority Parts 2/3
  // established: the checkout-time WhatsApp snapshot first, the order's
  // own primary mobile as fallback, never `Customer.whatsappPhone` (the
  // customer's current, separately-mutable profile). `Invoice.customerMobile`/
  // `customerWhatsapp` are themselves `Order.customerMobile`/
  // `customerWhatsapp` verbatim (Part 2's own model) — no new resolution
  // mechanism, no second phone-selection rule.
  const rawPhone = invoice.customerWhatsapp ?? invoice.customerMobile;
  if (!rawPhone) {
    console.error("whatsapp-invoice-service: no phone on file, skipping", { orderNumber: invoice.orderNumber });
    return { success: false, error: { type: "NO_PHONE", message: "No phone number is on file for this order." } };
  }
  const normalizedPhone = normalizePhoneNumber(rawPhone);
  if (!normalizedPhone.valid) {
    console.error("whatsapp-invoice-service: invalid phone on file, skipping", { orderNumber: invoice.orderNumber });
    return { success: false, error: { type: "INVALID_PHONE", message: "The phone number on file for this order is invalid." } };
  }

  const templateName = process.env.WHATSAPP_INVOICE_TEMPLATE_NAME;
  if (!templateName) {
    console.error("whatsapp-invoice-service: template not configured, skipping", { orderNumber: invoice.orderNumber });
    return {
      success: false,
      error: { type: "NOT_CONFIGURED", message: "WhatsApp invoice delivery isn't configured yet." },
    };
  }

  try {
    // Section 2 — the SAME transport credentials and the SAME
    // sender-selection function (`getNotificationSender`,
    // `NOTIFICATION_PROVIDER`) Order/Return notifications already use.
    // Not a new provider toggle: sending an invoice on request is still
    // a "customer notification," the same bucket as Order/Return,
    // distinct only from OTP.
    const transportConfig = getWhatsAppTransportConfig();
    const sender = getNotificationSender();
    const filename = `Invoice-${invoice.orderNumber}.pdf`;
    const mediaId = await sender.uploadMedia(transportConfig, pdf, filename, "application/pdf");

    await sender.send(transportConfig, {
      phoneNormalized: normalizedPhone.normalized,
      templateName,
      // Reuses the SAME shared language variable Order/Return
      // notifications already use — not a third, invoice-specific one.
      templateLanguage: process.env.WHATSAPP_NOTIFICATION_TEMPLATE_LANGUAGE ?? "en_US",
      bodyParameters: [
        invoice.customerName ?? "Customer",
        getInvoiceNumber(invoice),
        formatPaise(invoice.totalInPaise),
        buildInvoicePaymentLine(invoice),
      ],
      headerDocument: { mediaId, filename },
      logLabel: INVOICE_LOG_LABEL,
    });
    return { success: true };
  } catch {
    // The underlying client already logs categorized failure detail
    // (httpStatus/metaErrorCode, or a network-failure reason) under the
    // same `logLabel` — this only adds order-level context, never
    // re-logging the error's own message.
    console.error("whatsapp-invoice-service: delivery failed", { orderNumber: invoice.orderNumber });
    return {
      success: false,
      error: { type: "DELIVERY_FAILED", message: "Couldn't send the invoice over WhatsApp. Please try again." },
    };
  }
}
