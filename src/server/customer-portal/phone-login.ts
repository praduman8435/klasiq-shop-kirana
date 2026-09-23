import "server-only";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";

/**
 * TEMPORARY (testing phase, 2026-09-24): /track opens a customer's orders
 * from their mobile number alone — no OTP — because WhatsApp OTP delivery
 * isn't set up yet. The OTP flow (src/server/customer-portal/otp.ts) is
 * untouched; set CUSTOMER_OTP_REQUIRED=true to switch back to it.
 *
 * Without a code, anyone who knows a number can open that customer's
 * orders (items, address), so this must be switched off before real
 * customers use the store.
 */
export function isCustomerOtpRequired(): boolean {
  return process.env.CUSTOMER_OTP_REQUIRED === "true";
}

// Phone-only sign-in has no code to brute-force, but it can still be
// scripted to walk through numbers — cap it per IP, same rolling-window
// shape as the admin login limit (src/lib/admin/login-rate-limit.ts).
const WINDOW_MS = 10 * 60_000;
const MAX_ATTEMPTS_PER_WINDOW = 10;
const CLEANUP_OLDER_THAN_MS = 60 * 60_000;

export type PhoneOnlySignInResult =
  | { success: true; phoneNormalized: string }
  | { success: false; error: { type: "OTP_REQUIRED" | "INVALID_PHONE" | "RATE_LIMITED"; message: string } };

export async function checkPhoneOnlySignIn(rawPhone: string, ipAddress: string): Promise<PhoneOnlySignInResult> {
  if (isCustomerOtpRequired()) {
    return { success: false, error: { type: "OTP_REQUIRED", message: "Please verify your number with a code." } };
  }

  const normalized = normalizePhoneNumber(rawPhone);
  if (!normalized.valid) {
    return { success: false, error: { type: "INVALID_PHONE", message: "Please enter a valid 10-digit mobile number." } };
  }

  const recent = await db.orderLookupAttempt.count({
    where: { ipAddress, createdAt: { gte: new Date(Date.now() - WINDOW_MS) } },
  });
  if (recent >= MAX_ATTEMPTS_PER_WINDOW) {
    return {
      success: false,
      error: { type: "RATE_LIMITED", message: "Too many tries. Please wait a few minutes and try again." },
    };
  }

  await db.orderLookupAttempt.create({ data: { ipAddress } });
  db.orderLookupAttempt
    .deleteMany({ where: { createdAt: { lt: new Date(Date.now() - CLEANUP_OLDER_THAN_MS) } } })
    .catch(() => {});

  return { success: true, phoneNormalized: normalized.normalized };
}
