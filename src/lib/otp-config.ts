/**
 * Centralized OTP policy — mirrors src/lib/fulfillment-config.ts's shape
 * (env-overridable with sane defaults, never scattered magic numbers). Not
 * `server-only`: these are plain policy numbers, never secrets — see
 * src/server/customer-portal/otp.ts (server-only) for the actual
 * generation/hashing/verification logic that reads these.
 */

function envInt(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

export const OTP_CONFIG = {
  /** Numeric digits per code — 6 is the standard OTP length real delivery
   * providers (WhatsApp Business, SMS gateways) expect; keeping it fixed
   * (not env-configurable) since it's a UX/provider-compatibility constant,
   * not a business policy knob. */
  codeLength: 6,
  /** How long a requested code remains valid. Short enough that a leaked
   * or overheard code has a narrow window; long enough that a customer
   * reading a WhatsApp/SMS message and typing it in isn't rushed. */
  expiryMinutes: envInt("OTP_EXPIRY_MINUTES", 10),
  /** Wrong-code guesses allowed per challenge before it's locked and a
   * fresh request (respecting the resend cooldown below) is required. */
  maxAttempts: envInt("OTP_MAX_ATTEMPTS", 5),
  /** Minimum time between two OTP requests for the same phone+purpose —
   * the primary defense against a single number triggering unbounded
   * provider sends (a real cost once Phase 3.6 wires up WhatsApp billing). */
  resendCooldownSeconds: envInt("OTP_RESEND_COOLDOWN_SECONDS", 45),
  /** Hard cap on how many OTP requests one phone+purpose may make within
   * `requestWindowMinutes` — a second, coarser layer beyond the cooldown,
   * bounding total messages even if someone waits out the cooldown
   * repeatedly. */
  maxRequestsPerWindow: envInt("OTP_MAX_REQUESTS_PER_WINDOW", 5),
  requestWindowMinutes: envInt("OTP_REQUEST_WINDOW_MINUTES", 60),
} as const;

/**
 * Customer portal session lifetime — deliberately separate from
 * AdminSession's own duration (src/lib/admin/session.ts), since the two
 * are unrelated security domains with different risk profiles (read-mostly
 * "view my own orders" vs. staff mutating inventory/orders). 30 days: long
 * enough that an occasional shopper doesn't need to re-verify by SMS/
 * WhatsApp every visit, short enough that it isn't indefinite
 * authentication.
 */
export const CUSTOMER_SESSION_DURATION_DAYS = envInt("CUSTOMER_SESSION_DURATION_DAYS", 30);
