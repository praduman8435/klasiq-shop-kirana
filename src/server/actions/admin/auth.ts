"use server";

import { db } from "@/lib/db";
import { hashPassword, verifyPassword } from "@/lib/admin/password";
import { isAdminLoginRateLimited, recordAdminLoginAttempt } from "@/lib/admin/login-rate-limit";
import { createAdminSession, destroyAdminSession } from "@/lib/admin/session";
import { getClientIp } from "@/lib/request-ip";
import { adminLoginSchema } from "@/lib/validation/admin-auth";

export type AdminLoginResult = { success: true } | { success: false; message: string };

// Deep security audit (2026-08-09) — memoized so the decoy comparison
// below costs exactly ONE scrypt operation (a verify), matching the real
// "known email, wrong password" path exactly. Previously this was
// recomputed with a fresh `hashPassword` call on every single unknown/
// inactive-email login attempt, which is itself a scrypt hash — making
// every decoy comparison cost TWO scrypt operations (hash the decoy, then
// verify against it) against the real path's ONE (verify against the
// already-stored hash). That doubling was a measurable, exploitable
// timing side-channel an attacker could use to enumerate which admin
// emails exist — exactly the attack this decoy exists to prevent.
// Computed at most once per server process.
let decoyHashPromise: Promise<string> | null = null;
function getDecoyHash(): Promise<string> {
  if (!decoyHashPromise) {
    decoyHashPromise = hashPassword("decoy-comparison-value");
  }
  return decoyHashPromise;
}

export async function adminLogin(input: unknown): Promise<AdminLoginResult> {
  // Pre-deployment hardening — checked before touching the request body
  // at all, so a flood of even malformed requests can't burn CPU on
  // parsing/scrypt once the cap is hit. Every attempt counts toward the
  // limit, success or failure (recorded further below, after this gate).
  const clientIp = await getClientIp();
  if (await isAdminLoginRateLimited(clientIp)) {
    return { success: false, message: "Too many login attempts. Please try again in a minute." };
  }

  const parsed = adminLoginSchema.safeParse(input);
  if (!parsed.success) {
    await recordAdminLoginAttempt(clientIp);
    return { success: false, message: "Please enter your email and password." };
  }
  const { email, password } = parsed.data;
  await recordAdminLoginAttempt(clientIp);

  const user = await db.adminUser.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    // Still do a scrypt-equivalent amount of work on an unknown/inactive
    // email so the response takes roughly the same time either way — a
    // cheap guard against account-enumeration-by-timing, on top of the
    // per-IP rate limit above (which bounds total attempts, not timing).
    await verifyPassword({
      plainPassword: password,
      storedHash: await getDecoyHash(),
    });
    return { success: false, message: "Invalid email or password." };
  }

  const valid = await verifyPassword({ plainPassword: password, storedHash: user.passwordHash });
  if (!valid) {
    return { success: false, message: "Invalid email or password." };
  }

  await createAdminSession(user.id);
  return { success: true };
}

export async function adminLogout(): Promise<{ success: true }> {
  await destroyAdminSession();
  return { success: true };
}
