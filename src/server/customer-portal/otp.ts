import "server-only";
import { randomInt } from "node:crypto";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";
import { OTP_CONFIG } from "@/lib/otp-config";
import { hashSecret, verifySecretHash } from "@/lib/scrypt-hash";
import { getOtpProvider, type OtpProvider } from "@/server/otp/provider";

const PURPOSE = "CUSTOMER_PORTAL_LOGIN" as const;

/**
 * Cryptographically secure OTP generation — `crypto.randomInt` (uniform,
 * rejection-sampled, CSPRNG-backed), never `Math.random()` and never a
 * predictable sequence. Zero-padded so e.g. 42 renders as "000042", not
 * "42" — a shorter string would both look wrong to the customer and (if
 * ever compared as a bare string without padding) narrow the effective
 * search space.
 */
function generateOtpCode(): string {
  const max = 10 ** OTP_CONFIG.codeLength;
  return randomInt(0, max).toString().padStart(OTP_CONFIG.codeLength, "0");
}

export type RequestOtpError =
  | { type: "INVALID_PHONE"; message: string }
  | { type: "COOLDOWN"; message: string; retryAfterSeconds: number }
  | { type: "RATE_LIMITED"; message: string }
  | { type: "PROVIDER_UNAVAILABLE"; message: string };

export type RequestOtpResult = { success: true } | { success: false; error: RequestOtpError };

/**
 * Requests a new OTP for `rawPhone`. Deliberately does NOT check whether a
 * Customer exists for this phone — proving phone ownership and resolving
 * a Customer are two separate concerns (see docs/PHASE_3_4_REPORT.md
 * "Customer resolution after OTP"); checking existence here would also
 * reintroduce a timing/behavior difference an enumeration attack could
 * exploit. This function's behavior (and timing) is identical whether or
 * not `rawPhone` belongs to a real Klasiq customer.
 *
 * `provider` is injectable so tests never depend on a real send — see
 * src/server/customer-portal/__tests__/otp.test.ts. When omitted,
 * `getOtpProvider()` is resolved lazily, INSIDE the same try/catch as the
 * send call below (Phase 3.6 Part 1) — a misconfigured provider (e.g.
 * missing WhatsApp credentials) is treated identically to a send failure:
 * a generic `PROVIDER_UNAVAILABLE` result, never an uncaught throw that
 * could surface internal configuration detail.
 */
export async function requestOtp(rawPhone: string, provider?: OtpProvider): Promise<RequestOtpResult> {
  const normalized = normalizePhoneNumber(rawPhone);
  if (!normalized.valid) {
    return {
      success: false,
      error: { type: "INVALID_PHONE", message: "Please enter a valid 10-digit mobile number." },
    };
  }
  const phoneNormalized = normalized.normalized;

  const latest = await db.otpChallenge.findFirst({
    where: { phoneNormalized, purpose: PURPOSE },
    orderBy: { createdAt: "desc" },
  });

  if (latest) {
    const secondsSinceLast = (Date.now() - latest.createdAt.getTime()) / 1000;
    if (secondsSinceLast < OTP_CONFIG.resendCooldownSeconds) {
      return {
        success: false,
        error: {
          type: "COOLDOWN",
          message: "Please wait before requesting another code.",
          retryAfterSeconds: Math.ceil(OTP_CONFIG.resendCooldownSeconds - secondsSinceLast),
        },
      };
    }
  }

  const windowStart = new Date(Date.now() - OTP_CONFIG.requestWindowMinutes * 60 * 1000);
  const requestsInWindow = await db.otpChallenge.count({
    where: { phoneNormalized, purpose: PURPOSE, createdAt: { gte: windowStart } },
  });
  if (requestsInWindow >= OTP_CONFIG.maxRequestsPerWindow) {
    return {
      success: false,
      error: {
        type: "RATE_LIMITED",
        message: "Too many verification codes requested. Please try again later.",
      },
    };
  }

  const code = generateOtpCode();

  // The provider call happens BEFORE any database write: if delivery
  // fails, no new challenge should exist to (a) start a cooldown window
  // the customer never got a code for, or (b) supersede a still-valid
  // earlier challenge they might actually have in hand. Resolving
  // `getOtpProvider()` INSIDE this same try (Phase 3.6 Part 1) means a
  // configuration failure (e.g. missing WhatsApp credentials) is handled
  // exactly like a send failure — never a separate, uncaught error path.
  try {
    const activeProvider = provider ?? getOtpProvider();
    await activeProvider.sendOtp({ phoneNormalized, code, purpose: PURPOSE });
  } catch {
    // Never forward the provider's raw error (which could name internal
    // infrastructure) to the customer.
    return {
      success: false,
      error: {
        type: "PROVIDER_UNAVAILABLE",
        message: "We couldn't send a verification code right now. Please try again shortly.",
      },
    };
  }

  const codeHash = await hashSecret(code);
  const expiresAt = new Date(Date.now() + OTP_CONFIG.expiryMinutes * 60 * 1000);

  // A new request supersedes every earlier still-active challenge for this
  // phone+purpose — at most one challenge is ever valid at a time. See
  // docs/PHASE_3_4_REPORT.md "OTP replacement semantics".
  await db.$transaction([
    db.otpChallenge.updateMany({
      where: { phoneNormalized, purpose: PURPOSE, consumedAt: null },
      data: { consumedAt: new Date() },
    }),
    db.otpChallenge.create({
      data: { phoneNormalized, purpose: PURPOSE, codeHash, expiresAt },
    }),
  ]);

  // Best-effort, never blocking a real OTP request on a cleanup failure —
  // see cleanupExpiredOtpChallenges's own doc comment for why this runs
  // here rather than as a separate background worker.
  cleanupExpiredOtpChallenges().catch(() => {});

  return { success: true };
}

// Any challenge this old is worthless regardless of its consumed/expired
// state — real codes only ever live for OTP_CONFIG.expiryMinutes (10
// minutes by default). A day's grace keeps a short window for debugging a
// recent issue without the table accumulating forever.
const OTP_CHALLENGE_RETENTION_HOURS = 24;

/**
 * Deletes OTP challenges older than the retention window. No background
 * worker/cron exists in this project, so this runs opportunistically —
 * once per successful `requestOtp` call, best-effort — rather than on a
 * schedule. At this shop's real request volume (a handful of OTP requests
 * a day), a plain unindexed `createdAt` scan is not a performance concern;
 * see docs/PHASE_3_4_REPORT.md Part 3 "OTP cleanup" for why a dedicated
 * index/scheduled job would be premature infrastructure today.
 */
export async function cleanupExpiredOtpChallenges(): Promise<void> {
  const cutoff = new Date(Date.now() - OTP_CHALLENGE_RETENTION_HOURS * 60 * 60 * 1000);
  await db.otpChallenge.deleteMany({ where: { createdAt: { lt: cutoff } } });
}

export type VerifyOtpError =
  | { type: "INVALID_PHONE"; message: string }
  | { type: "NO_ACTIVE_CHALLENGE"; message: string }
  | { type: "EXPIRED"; message: string }
  | { type: "TOO_MANY_ATTEMPTS"; message: string }
  | { type: "WRONG_CODE"; message: string };

export type VerifyOtpResult =
  | { success: true; phoneNormalized: string }
  | { success: false; error: VerifyOtpError };

const GENERIC_INVALID_CODE_MESSAGE = "That code is invalid or has expired. Please request a new one.";

/**
 * Verifies `rawCode` against the current active challenge for `rawPhone`.
 * Consumes the challenge on success (guarded so a race between two
 * concurrent verify calls can never both succeed) — a consumed challenge
 * is invisible to a later replay of the same correct code, since the
 * lookup itself filters `consumedAt: null`.
 */
export async function verifyOtp(rawPhone: string, rawCode: string): Promise<VerifyOtpResult> {
  const normalized = normalizePhoneNumber(rawPhone);
  if (!normalized.valid) {
    return {
      success: false,
      error: { type: "INVALID_PHONE", message: "Please enter a valid 10-digit mobile number." },
    };
  }
  const phoneNormalized = normalized.normalized;

  const challenge = await db.otpChallenge.findFirst({
    where: { phoneNormalized, purpose: PURPOSE, consumedAt: null },
    orderBy: { createdAt: "desc" },
  });

  if (!challenge) {
    return {
      success: false,
      error: { type: "NO_ACTIVE_CHALLENGE", message: GENERIC_INVALID_CODE_MESSAGE },
    };
  }

  if (challenge.expiresAt.getTime() <= Date.now()) {
    return { success: false, error: { type: "EXPIRED", message: GENERIC_INVALID_CODE_MESSAGE } };
  }

  if (challenge.attemptCount >= OTP_CONFIG.maxAttempts) {
    return {
      success: false,
      error: {
        type: "TOO_MANY_ATTEMPTS",
        message: "Too many incorrect attempts. Please request a new code.",
      },
    };
  }

  const trimmedCode = rawCode.trim();
  const correct = await verifySecretHash({ plainSecret: trimmedCode, storedHash: challenge.codeHash });

  if (!correct) {
    await db.otpChallenge.update({
      where: { id: challenge.id },
      data: { attemptCount: { increment: 1 } },
    });
    return { success: false, error: { type: "WRONG_CODE", message: GENERIC_INVALID_CODE_MESSAGE } };
  }

  const consumed = await db.otpChallenge.updateMany({
    where: { id: challenge.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) {
    // Lost a race with a concurrent verify (or resend) — never treat this
    // as success just because the code happened to be correct.
    return {
      success: false,
      error: { type: "NO_ACTIVE_CHALLENGE", message: GENERIC_INVALID_CODE_MESSAGE },
    };
  }

  return { success: true, phoneNormalized };
}
