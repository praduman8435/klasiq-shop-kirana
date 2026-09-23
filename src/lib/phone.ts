// Phone normalization — the customer-identity dedup key. See
// docs/PHASE_3_1_REPORT.md "Phone normalization strategy" for the full
// reasoning. This module is intentionally independent of
// src/lib/validation/checkout.ts's own mobile-format check (which validates
// checkout form input, unrelated to Customer for now) — see the report for
// why the two aren't merged in this phase.

const INDIA_COUNTRY_CODE = "91";
// India-issued mobile numbers are 10 digits, first digit 6-9. This mirrors
// the pattern already used in src/lib/validation/checkout.ts.
const LOCAL_MOBILE_PATTERN = /^[6-9]\d{9}$/;

export type PhoneNormalizationResult =
  | { valid: true; normalized: string }
  | { valid: false };

/**
 * Normalizes any of 9876543210 / +91 9876543210 / +919876543210 /
 * 98765 43210 / 98765-43210 to the same canonical E.164 form
 * (+919876543210). E.164 is chosen deliberately over a bare 10-digit form:
 * it's the format WhatsApp's Business API requires, so this is already
 * shaped for the future WhatsApp verification module without redesign.
 *
 * Strips whitespace/hyphens/parens, then a leading "+", then strips a
 * leading "91" country code ONLY when the remaining digit count (12)
 * indicates it's genuinely present as a prefix — not when the local number
 * itself happens to start with "91" (a 10-digit input is never touched by
 * that step, so e.g. "9187654321" is never misread as country-code-prefixed).
 */
export function normalizePhoneNumber(rawInput: string): PhoneNormalizationResult {
  const stripped = rawInput.replace(/[\s\-()]/g, "");
  let digits = stripped.replace(/^\+/, "");

  if (digits.length === 12 && digits.startsWith(INDIA_COUNTRY_CODE)) {
    digits = digits.slice(INDIA_COUNTRY_CODE.length);
  }

  if (!LOCAL_MOBILE_PATTERN.test(digits)) {
    return { valid: false };
  }

  return { valid: true, normalized: `+${INDIA_COUNTRY_CODE}${digits}` };
}

/**
 * Personal-data audit (2026-08-10) — every log line that used to include a
 * raw `phoneNormalized` value (src/server/whatsapp/client.ts,
 * notification-sender.ts, src/server/otp/provider.ts's dev-only stand-in)
 * now calls this first. Never returns enough digits to identify or contact
 * the customer, but keeps the country-code prefix and last 2 digits so an
 * operator scanning logs can still tell two DIFFERENT numbers apart (e.g.
 * "did the same customer's send fail twice, or two different customers")
 * without the log itself being a usable phone number. `+919876543210` ->
 * `+91••••••10`. Safe to call on an already-invalid/malformed string —
 * falls back to a fixed placeholder rather than leaking a partial value.
 */
export function maskPhoneForLogging(phoneNormalized: string): string {
  const digitsOnly = phoneNormalized.replace(/[^\d]/g, "");
  if (digitsOnly.length < 4) return "+••••••••••";

  const countryCode = phoneNormalized.startsWith("+") ? "+" + digitsOnly.slice(0, 2) : "";
  const lastTwo = digitsOnly.slice(-2);
  return `${countryCode}••••••${lastTwo}`;
}
