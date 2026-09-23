import "server-only";
import { maskPhoneForLogging } from "@/lib/phone";
import {
  sendWhatsAppTemplateMessage,
  uploadWhatsAppMedia,
  type WhatsAppTemplateMessageParams,
  type WhatsAppTransportConfig,
} from "@/server/whatsapp/client";

/**
 * Extracted out of notification-service.ts in Phase 3.6 Part 3 so the new
 * return/exchange notification service (return-notification-service.ts)
 * can reuse the EXACT SAME sender-selection logic rather than a second
 * copy — section 1's "do NOT create a second notification engine" applies
 * to this selection mechanism too, not just the underlying Meta client.
 * Pure extraction, no behavior change: same two implementations, same
 * environment-based decision table, same `NOTIFICATION_PROVIDER` variable
 * (deliberately NOT a new `RETURN_NOTIFICATION_PROVIDER` — one non-OTP
 * "notifications" channel, one toggle, shared by order and return/exchange
 * notifications alike).
 */
export type NotificationSender = {
  send(config: WhatsAppTransportConfig, params: WhatsAppTemplateMessageParams): Promise<void>;
  /** Phase 3.6.6 Part 3 — resolves a media id for a `send()` call's own
   * `headerDocument.mediaId`. Routed through the SAME sender abstraction
   * as `send()` (never called directly by a service) so the console
   * dev stand-in never makes a real Meta call for this either — the
   * identical "no real network in development" guarantee `send()`
   * already provides, now covering document uploads too. */
  uploadMedia(config: WhatsAppTransportConfig, file: Buffer, filename: string, mimeType: string): Promise<string>;
};

/**
 * Development-only stand-in, exactly mirroring `ConsoleOtpProvider`'s own
 * shape (src/server/otp/provider.ts) — never a real delivery channel,
 * hard-refuses to run in production (defense in depth; `getNotificationSender`
 * below already never constructs this in production). Writes to the
 * server's own terminal only, so local development never requires a real
 * WhatsApp Business account nor risks messaging a real customer.
 */
class ConsoleNotificationSender implements NotificationSender {
  async send(_config: WhatsAppTransportConfig, params: WhatsAppTemplateMessageParams): Promise<void> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ConsoleNotificationSender must never run in production.");
    }
    // Personal-data audit (2026-08-10) — the phone number is masked, and
    // the body parameters (which typically include the customer's name,
    // and always include order/return numbers and a tracking link) are
    // never printed in full — only their count, so a developer can still
    // confirm the template was called with the right shape without any
    // real customer data ever reaching the terminal.
    console.log(
      `[DEV NOTIFICATION — local development only, never sent to a real customer] label=${params.logLabel} template=${params.templateName} to=${maskPhoneForLogging(params.phoneNormalized)} params=[REDACTED x${params.bodyParameters.length}]${params.headerDocument ? ` header=${params.headerDocument.filename}` : ""}`,
    );
  }

  async uploadMedia(_config: WhatsAppTransportConfig, file: Buffer, filename: string): Promise<string> {
    if (process.env.NODE_ENV === "production") {
      throw new Error("ConsoleNotificationSender must never run in production.");
    }
    console.log(
      `[DEV NOTIFICATION — local development only, no real Meta upload] media upload skipped filename=${filename} size=${file.length}`,
    );
    return "dev-console-media-id";
  }
}

class RealNotificationSender implements NotificationSender {
  async send(config: WhatsAppTransportConfig, params: WhatsAppTemplateMessageParams): Promise<void> {
    await sendWhatsAppTemplateMessage(config, params);
  }

  async uploadMedia(config: WhatsAppTransportConfig, file: Buffer, filename: string, mimeType: string): Promise<string> {
    return uploadWhatsAppMedia(config, file, filename, mimeType);
  }
}

/**
 * Environment-based selection, deliberately mirroring `getOtpProvider()`'s
 * exact decision table (src/server/otp/provider.ts) but with its OWN
 * override variable (`NOTIFICATION_PROVIDER`, never `OTP_PROVIDER`) —
 * production always real, non-production defaults to the console
 * stand-in unless explicitly opted in. Shared by BOTH
 * `notifyOrderEvent` (Part 2) and `notifyReturnEvent` (Part 3) — enabling
 * real WhatsApp sending for one enables it for the other too, which is
 * correct: they are the same "customer notifications" channel, distinct
 * only from OTP.
 */
export function getNotificationSender(): NotificationSender {
  if (process.env.NODE_ENV === "production") {
    return new RealNotificationSender();
  }
  if (process.env.NOTIFICATION_PROVIDER?.trim().toLowerCase() === "whatsapp") {
    return new RealNotificationSender();
  }
  return new ConsoleNotificationSender();
}
