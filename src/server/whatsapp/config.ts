import "server-only";
import type { WhatsAppTransportConfig } from "@/server/whatsapp/client";

/**
 * The ONE place `WHATSAPP_API_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/
 * `WHATSAPP_API_VERSION` are ever read — shared by both OTP
 * (`src/server/otp/provider.ts`) and notifications
 * (`src/server/whatsapp/notification-service.ts`), so credentials never
 * leak into a second module. Both callers still supply their OWN
 * template name(s) separately (OTP's `WHATSAPP_OTP_TEMPLATE_NAME`; each
 * notification event's own `WHATSAPP_ORDER_*_TEMPLATE_NAME`) — this
 * function only ever resolves the transport-level (account/number)
 * credentials, never a template choice. Fails closed with a clear error
 * if anything required is missing, exactly like
 * `createWhatsAppOtpProviderFromEnv` did before this extraction.
 */
export function getWhatsAppTransportConfig(): WhatsAppTransportConfig {
  const apiToken = process.env.WHATSAPP_API_TOKEN;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  const apiVersion = process.env.WHATSAPP_API_VERSION;

  if (!apiToken || !phoneNumberId) {
    throw new Error(
      "WhatsApp transport is not configured — set WHATSAPP_API_TOKEN and WHATSAPP_PHONE_NUMBER_ID.",
    );
  }

  return { apiToken, phoneNumberId, apiVersion };
}
