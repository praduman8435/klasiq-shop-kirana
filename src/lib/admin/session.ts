import "server-only";
import { randomBytes, createHash } from "node:crypto";
import { cookies } from "next/headers";
import { db } from "@/lib/db";

export const ADMIN_SESSION_COOKIE_NAME = "klasiq_admin_session";
const SESSION_DURATION_MS = 14 * 24 * 60 * 60 * 1000; // 14 days

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Creates a session row and sets the cookie. Only the SHA-256 hash of the
 * random token is stored — the raw token lives only in the httpOnly
 * cookie, so a database read (backup, replica, leaked dump) can never be
 * replayed as a live session. Callable only from a Server Action or Route
 * Handler (cookie writes aren't allowed during Server Component render).
 */
export async function createAdminSession(adminUserId: string): Promise<void> {
  const token = randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

  await db.adminSession.create({
    data: { tokenHash, adminUserId, expiresAt },
  });

  const cookieStore = await cookies();
  cookieStore.set(ADMIN_SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/admin",
    expires: expiresAt,
  });
}

/**
 * Read-only session lookup — safe to call from Server Components (every
 * admin page does, at minimum via the protected layout) as well as Server
 * Actions. Returns null for a missing/expired/unknown session token or a
 * deactivated admin account — callers must treat null as "not authorized,"
 * never assume a cookie's mere presence means anything.
 */
export async function getAdminSession() {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;
  if (!token) return null;

  const tokenHash = hashToken(token);
  const session = await db.adminSession.findUnique({
    where: { tokenHash },
    include: { adminUser: true },
  });

  if (!session) return null;

  if (session.expiresAt.getTime() <= Date.now()) {
    // Opportunistic cleanup — not load-bearing for correctness, just keeps
    // the table from accumulating expired rows indefinitely.
    await db.adminSession.delete({ where: { tokenHash } }).catch(() => {});
    return null;
  }

  if (!session.adminUser.isActive) return null;

  return session.adminUser;
}

/**
 * Deletes the current session row (if any) and clears the cookie. Callable
 * only from a Server Action or Route Handler.
 */
export async function destroyAdminSession(): Promise<void> {
  const cookieStore = await cookies();
  const token = cookieStore.get(ADMIN_SESSION_COOKIE_NAME)?.value;

  if (token) {
    await db.adminSession.delete({ where: { tokenHash: hashToken(token) } }).catch(() => {});
  }

  cookieStore.delete({ name: ADMIN_SESSION_COOKIE_NAME, path: "/admin" });
}
