"use server";

import { createCustomerSession, destroyCustomerSession } from "@/lib/customer-portal/session";
import { requestOtpSchema, verifyOtpSchema } from "@/lib/validation/customer-portal";
import { getClientIp } from "@/lib/request-ip";
import { requestOtp, verifyOtp } from "@/server/customer-portal/otp";
import { checkPhoneOnlySignIn } from "@/server/customer-portal/phone-login";

// Deliberately identical whether or not `phone` belongs to a real Klasiq
// customer — requestOtp() itself never checks Customer existence (see its
// own doc comment), so there is no existence-dependent branch to
// accidentally leak here. See docs/PHASE_3_4_REPORT.md "Customer existence
// privacy".
const GENERIC_SENT_MESSAGE = "If that number is registered with Klasiq, we've sent a verification code.";

export type RequestOtpActionResult =
  | { success: true; message: string }
  | {
      success: false;
      error: {
        type: "VALIDATION" | "INVALID_PHONE" | "COOLDOWN" | "RATE_LIMITED" | "PROVIDER_UNAVAILABLE";
        message: string;
        retryAfterSeconds?: number;
      };
    };

export async function requestOtpAction(input: unknown): Promise<RequestOtpActionResult> {
  const parsed = requestOtpSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: { type: "VALIDATION", message: "Please enter your mobile number." },
    };
  }

  const result = await requestOtp(parsed.data.phone);
  if (result.success) {
    return { success: true, message: GENERIC_SENT_MESSAGE };
  }

  if (result.error.type === "COOLDOWN") {
    return {
      success: false,
      error: {
        type: "COOLDOWN",
        message: result.error.message,
        retryAfterSeconds: result.error.retryAfterSeconds,
      },
    };
  }
  return { success: false, error: { type: result.error.type, message: result.error.message } };
}

export type VerifyOtpActionResult =
  | { success: true }
  | {
      success: false;
      error: {
        type: "VALIDATION" | "INVALID_PHONE" | "NO_ACTIVE_CHALLENGE" | "EXPIRED" | "TOO_MANY_ATTEMPTS" | "WRONG_CODE";
        message: string;
      };
    };

export async function verifyOtpAction(input: unknown): Promise<VerifyOtpActionResult> {
  const parsed = verifyOtpSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Enter the 6-digit code." } };
  }

  const result = await verifyOtp(parsed.data.phone, parsed.data.code);
  if (!result.success) {
    return { success: false, error: { type: result.error.type, message: result.error.message } };
  }

  // Always mints a fresh session token — never promotes any client-supplied
  // value into authenticated state (session-fixation resistance). See
  // docs/PHASE_3_4_REPORT.md "Session fixation".
  await createCustomerSession(result.phoneNormalized);
  return { success: true };
}

export async function customerLogoutAction(): Promise<{ success: true }> {
  await destroyCustomerSession();
  return { success: true };
}

export type SignInWithPhoneActionResult =
  | { success: true }
  | { success: false; error: { type: "VALIDATION" | "OTP_REQUIRED" | "INVALID_PHONE" | "RATE_LIMITED"; message: string } };

/** TEMPORARY testing-phase sign-in: mobile number only, no OTP — see
 * src/server/customer-portal/phone-login.ts. Refuses whenever
 * CUSTOMER_OTP_REQUIRED=true, so the OTP flow can't be bypassed then. */
export async function signInWithPhoneAction(input: unknown): Promise<SignInWithPhoneActionResult> {
  const parsed = requestOtpSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: { type: "VALIDATION", message: "Please enter your mobile number." } };
  }

  const result = await checkPhoneOnlySignIn(parsed.data.phone, await getClientIp());
  if (!result.success) return result;

  await createCustomerSession(result.phoneNormalized);
  return { success: true };
}
