import "server-only";
import type { OtpProvider } from "@/server/otp/provider";
import { sendWhatsAppTemplateMessage, type WhatsAppTransportConfig } from "@/server/whatsapp/client";

const DEFAULT_TEMPLATE_LANGUAGE = "en_US";

export type WhatsAppOtpProviderConfig = WhatsAppTransportConfig & {
  templateName: string;
  templateLanguage?: string;
};

/**
 * Production OTP delivery via the Meta WhatsApp Business Cloud API — the
 * one real implementation of `OtpProvider` (src/server/otp/provider.ts)
 * this codebase ships. Nothing about `requestOtp`/`verifyOtp`
 * (src/server/customer-portal/otp.ts) changes to support this: it only
 * ever calls `provider.sendOtp(...)`, exactly as it did before this class
 * existed — see docs/PHASE_3_6_REPORT.md Part 1 "Provider architecture".
 *
 * Phase 3.6 Part 2: the actual Meta API call (request shape, retry
 * policy, error categorization, logging) now lives in the shared
 * `sendWhatsAppTemplateMessage` (src/server/whatsapp/client.ts) — the
 * SAME transport `WhatsAppNotificationService` uses for order-lifecycle
 * messages, per that phase's own "do not create another Meta client"
 * instruction. This class's only remaining job is OTP-specific: knowing
 * its own dedicated template name (never shared with any notification
 * template — see that template's own isolation rules) and building the
 * single-parameter (the code) body. Behavior is unchanged from Part 1 —
 * proven by this class's own, unmodified test suite still passing.
 *
 * Uses ONE dedicated template (`templateName`) — never shared with any
 * order/return/exchange notification template (section 5 of the Part 1
 * brief) — passed as its own required constructor field.
 */
export class WhatsAppOtpProvider implements OtpProvider {
  private readonly transportConfig: WhatsAppTransportConfig;
  private readonly templateName: string;
  private readonly templateLanguage: string;

  constructor(config: WhatsAppOtpProviderConfig) {
    this.transportConfig = { apiToken: config.apiToken, phoneNumberId: config.phoneNumberId, apiVersion: config.apiVersion, baseUrl: config.baseUrl };
    this.templateName = config.templateName;
    this.templateLanguage = config.templateLanguage ?? DEFAULT_TEMPLATE_LANGUAGE;
  }

  async sendOtp({ phoneNormalized, code }: { phoneNormalized: string; code: string; purpose: string }): Promise<void> {
    await sendWhatsAppTemplateMessage(this.transportConfig, {
      phoneNormalized,
      templateName: this.templateName,
      templateLanguage: this.templateLanguage,
      // Meta's Authentication-category templates require exactly one
      // body parameter (the code) and no more. If your approved template
      // additionally uses a "Copy Code" quick-reply button, that's a
      // second, button-type component this shared client doesn't send
      // today — deliberately not added speculatively, since supplying a
      // button component for a template that doesn't have one makes Meta
      // reject the entire message.
      bodyParameters: [code],
      logLabel: "otp",
    });
  }
}
