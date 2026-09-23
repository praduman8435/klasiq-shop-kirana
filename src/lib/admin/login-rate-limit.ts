import "server-only";
import { db } from "@/lib/db";

/**
 * Pre-deployment hardening (2026-08-10) — "Authentication endpoints...
 * must have rate limiting. Minimum: 5 attempts per minute per IP on
 * login." Mirrors the OTP request-window convention already established
 * in this codebase (`OTP_CONFIG.maxRequestsPerWindow`,
 * src/lib/otp-config.ts / src/server/customer-portal/otp.ts) rather than
 * inventing a new shape: a rolling count of recent attempts, capped, with
 * opportunistic (not cron-based) cleanup of old rows — this codebase has
 * no background-job runner anywhere, and none was introduced here either.
 */
const WINDOW_MS = 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 5;
// Comfortably longer than the rate-limit window itself, so a burst
// straddling a cleanup sweep is never undercounted — this is a cleanup
// horizon, not a second rate-limit rule.
const CLEANUP_OLDER_THAN_MS = 10 * 60_000;

export async function isAdminLoginRateLimited(ipAddress: string): Promise<boolean> {
  const windowStart = new Date(Date.now() - WINDOW_MS);
  const count = await db.adminLoginAttempt.count({
    where: { ipAddress, createdAt: { gte: windowStart } },
  });
  return count >= MAX_ATTEMPTS_PER_WINDOW;
}

/**
 * Records ONE attempt (this codebase counts every attempt toward the
 * cap, success or failure — a script that eventually guesses correctly
 * still can't have made unlimited tries to get there). Cleanup is
 * best-effort and never blocks or fails the login attempt itself, same
 * "never let a hygiene task turn a real action into an error" precedent
 * as `cleanupExpiredCustomerSessions`.
 */
export async function recordAdminLoginAttempt(ipAddress: string): Promise<void> {
  await db.adminLoginAttempt.create({ data: { ipAddress } });
  db.adminLoginAttempt
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - CLEANUP_OLDER_THAN_MS) } } })
    .catch(() => {});
}
