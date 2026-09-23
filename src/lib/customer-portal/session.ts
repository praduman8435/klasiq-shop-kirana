import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { CUSTOMER_SESSION_DURATION_DAYS } from "@/lib/otp-config";

export const CUSTOMER_SESSION_COOKIE_NAME = "klasiq_customer_session";
const SESSION_DURATION_MS = CUSTOMER_SESSION_DURATION_DAYS * 24 * 60 * 60 * 1000;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export type CustomerPortalSession = {
  phoneNormalized: string;
  /** The linked Customer, resolved FRESH on every call — never cached on
   * the session row itself. Null means the phone is verified but no
   * Customer record exists yet (see docs/PHASE_3_4_REPORT.md "Customer
   * resolution after OTP") — callers must render a generic empty state,
   * never fabricate one. */
  customer: Awaited<ReturnType<typeof db.customer.findUnique>> | null;
};

/**
 * Creates a customer-portal session AFTER successful OTP verification and
 * sets the cookie. Deliberately separate from AdminSession (own table, own
 * cookie name, own security domain — see docs/PHASE_3_4_REPORT.md "Session
 * architecture"). Same proven shape as src/lib/admin/session.ts: only the
 * SHA-256 hash of a random opaque token is stored server-side; the raw
 * token lives only in the httpOnly cookie, so a database read/backup leak
 * can never be replayed as a live session.
 *
 * Always mints a brand-new token — never promotes a client-supplied value
 * into authenticated state (session-fixation resistance). Only ever call
 * this immediately after `verifyOtp` returns success.
 */
export async function createCustomerSession(phoneNormalized: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.customerSession.create({
    data: { tokenHash, phoneNormalized, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(CUSTOMER_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });

  // Best-effort, never blocking a real login on a cleanup failure — see
  // cleanupExpiredCustomerSessions's own doc comment for why this runs
  // here rather than as a separate background worker. `getCustomerSession`
  // already opportunistically deletes the ONE expired row it happens to
  // read; this additionally sweeps sessions that expired without ever
  // being read again (a customer who never came back), which that
  // read-time cleanup alone could never reach.
  cleanupExpiredCustomerSessions().catch(() => {});
}

/**
 * Deletes every CustomerSession row whose `expiresAt` has already passed
 * — no grace period needed, unlike OTP challenges, since an expired
 * session is unconditionally useless the moment it expires. No background
 * worker/cron exists in this project, so this runs opportunistically once
 * per new login (a natural, moderate-frequency write point) rather than on
 * a schedule. See docs/PHASE_3_4_REPORT.md Part 3 "Session cleanup".
 */
export async function cleanupExpiredCustomerSessions(): Promise<void> {
  await db.customerSession.deleteMany({ where: { expiresAt: { lt: new Date() } } });
}

/**
 * Read-only session lookup — the one authorization primitive every
 * customer-portal page/Server Action uses (see docs/PHASE_3_4_REPORT.md
 * "Authorization helper"); no route re-implements cookie/session
 * validation itself. Returns null for a missing/expired/unknown token,
 * exactly like `getAdminSession()` — callers must treat null as "not
 * authorized."
 *
 * The Customer is resolved fresh by `phoneNormalized` on every call —
 * never a customerId cached on the session row — so a phone verified
 * before any Customer existed (or one created by a Counter sale in
 * between) is always picked up correctly, and a caller can never reach a
 * different Customer's data by supplying a different id: the ONLY input
 * to this lookup is the server-verified session cookie.
 */
export async function getCustomerSession(): Promise<CustomerPortalSession | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.customerSession.findUnique({ where: { tokenHash } });
  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    // Opportunistic cleanup — not load-bearing for correctness, just keeps
    // the table from accumulating expired rows indefinitely.
    await db.customerSession.delete({ where: { tokenHash } }).catch(() => {});
    return null;
  }

  // Best-effort, non-blocking — never lets a lastUsedAt write failure turn
  // a valid session into a rejected one.
  db.customerSession
    .update({ where: { tokenHash }, data: { lastUsedAt: new Date() } })
    .catch(() => {});

  const customer = await db.customer.findUnique({
    where: { primaryPhoneNormalized: session.phoneNormalized },
  });

  return { phoneNormalized: session.phoneNormalized, customer };
}

/**
 * Deletes the current session row (if any) and clears the cookie. Multiple
 * simultaneous sessions for the same phone (e.g. two devices) are allowed
 * by design (see docs/PHASE_3_4_REPORT.md "Multiple devices") — logout
 * only ever removes the ONE session named by the current request's own
 * cookie, never every session for that phone.
 */
export async function destroyCustomerSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(CUSTOMER_SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.customerSession.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }

  cookieStore.delete({ name: CUSTOMER_SESSION_COOKIE_NAME, path: "/" });
}
