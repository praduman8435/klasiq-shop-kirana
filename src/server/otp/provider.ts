import "server-only";
import { maskPhoneForLogging } from "@/lib/phone";
import { WhatsAppOtpProvider } from "@/server/otp/whatsapp-provider";
import { getWhatsAppTransportConfig } from "@/server/whatsapp/config";

/**
 * The one and only boundary between Klasiq's OTP domain logic
 * (src/server/customer-portal/otp.ts) and however a code actually reaches
 * the customer. The domain layer calls only `sendOtp` and never knows or
 * cares whether that's WhatsApp, SMS, or (today, outside production) a
 * local development stand-in — see docs/PHASE_3_4_REPORT.md "OTP delivery
 * architecture". Phase 3.6 Part 1 adds the real WhatsApp-backed
 * implementation of this exact interface (`WhatsAppOtpProvider`,
 * src/server/otp/whatsapp-provider.ts); nothing about customer
 * authentication changed to support it.
 */
export type OtpProvider = {
  sendOtp(params: { phoneNormalized: string; code: string; purpose: string }): Promise<void>;
};

/**
 * Development-only stand-in — never a real delivery channel. Writes the
 * code to the server's own terminal (never the browser, never a URL/query
 * param, never the database) so a developer manually exercising the
 * customer portal locally can complete the flow without needing a real
 * WhatsApp Business account configured. Hard-refuses to run in production
 * — see `getOtpProvider` below, the only ordinary code path that
 * constructs this (exported ONLY so its own tests can exercise this
 * refusal directly).
 *
 * This is NOT a hard-coded backdoor code (e.g. "always accept 123456") —
 * the code is still a real, cryptographically random value (see
 * src/server/customer-portal/otp.ts's `generateOtpCode`); this provider
 * only changes how it's DELIVERED, never how it's generated or verified.
 */
export class ConsoleOtpProvider implements OtpProvider {
  async sendOtp({ phoneNormalized, code, purpose }: { phoneNormalized: string; code: string; purpose: string }) {
    if (process.env.NODE_ENV === "production") {
      // Defense in depth — getOtpProvider() already refuses to construct
      // this class in production, so this should be unreachable, but a
      // future refactor mistake must never turn into a real OTP leak.
      throw new Error("ConsoleOtpProvider must never run in production.");
    }
    // Personal-data audit (2026-08-10) — the phone number is masked here
    // too, for consistency with every other WhatsApp-adjacent log line.
    // The CODE itself is a deliberate, documented exception, not an
    // oversight: this class exists ONLY because it's the sole delivery
    // channel available in local development (there is no other way for
    // a developer to receive it — it is never persisted in plaintext
    // anywhere, including the database, see OtpChallenge.codeHash) and it
    // can never run in production (the guard above, plus
    // `getOtpProvider()` never constructing this class there at all).
    console.log(
      `[DEV OTP — local development only, never shown to a real customer] phone=${maskPhoneForLogging(phoneNormalized)} purpose=${purpose} code=${code}`,
    );
  }
}

/**
 * Builds the real WhatsApp provider from environment variables.
 * Transport-level credentials (`WHATSAPP_API_TOKEN`/
 * `WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_API_VERSION`) are resolved via the
 * SAME `getWhatsAppTransportConfig()` (src/server/whatsapp/config.ts)
 * that order-lifecycle notifications use (Phase 3.6 Part 2) — one place
 * reads those, never duplicated. Only the OTP-specific template name/
 * language are read here, since those must never be shared with any
 * notification template. Fails closed with a clear (but
 * customer-invisible — see `requestOtp`'s own catch) configuration error
 * if anything required is missing, rather than silently constructing a
 * half-configured provider that would fail on first send anyway. Never
 * logs any of these values, including on failure.
 */
function createWhatsAppOtpProviderFromEnv(): WhatsAppOtpProvider {
  const transportConfig = getWhatsAppTransportConfig();
  const templateName = process.env.WHATSAPP_OTP_TEMPLATE_NAME;
  const templateLanguage = process.env.WHATSAPP_OTP_TEMPLATE_LANGUAGE;

  if (!templateName) {
    throw new Error("WhatsApp OTP provider is not configured — set WHATSAPP_OTP_TEMPLATE_NAME.");
  }

  return new WhatsAppOtpProvider({ ...transportConfig, templateName, templateLanguage });
}

/**
 * Selects the active OTP provider — environment-based, never hard-coded
 * (section 3 of the Phase 3.6 Part 1 brief). See docs/PHASE_3_6_REPORT.md
 * "Provider architecture" for the full decision table:
 *
 * - **Production** (`NODE_ENV === "production"`): ALWAYS the real
 *   WhatsApp provider. `OTP_PROVIDER` can never downgrade this to the
 *   console stand-in — this is a hard, non-overridable invariant (the
 *   same fail-closed guarantee Phase 3.4 Part 1 already established,
 *   now backed by a real provider instead of an unconditional throw). If
 *   the required `WHATSAPP_*` env vars are missing, this throws a
 *   configuration error rather than silently falling back to the console
 *   provider or fabricating success.
 * - **Non-production, `OTP_PROVIDER=whatsapp`**: the real WhatsApp
 *   provider — lets a developer deliberately test real delivery from a
 *   local/staging environment without flipping `NODE_ENV` to
 *   `"production"`.
 * - **Non-production, anything else (the default)**: `ConsoleOtpProvider`
 *   — unchanged local development experience.
 */
export function getOtpProvider(): OtpProvider {
  if (process.env.NODE_ENV === "production") {
    return createWhatsAppOtpProviderFromEnv();
  }

  if (process.env.OTP_PROVIDER?.trim().toLowerCase() === "whatsapp") {
    return createWhatsAppOtpProviderFromEnv();
  }

  return new ConsoleOtpProvider();
}
