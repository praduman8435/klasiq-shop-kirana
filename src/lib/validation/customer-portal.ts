import { z } from "zod";

// Deliberately loose — the real validity check is
// src/lib/phone.ts's normalizePhoneNumber, called inside requestOtp/
// verifyOtp (src/server/customer-portal/otp.ts), which returns a clean
// INVALID_PHONE domain error either way. This schema only guards against
// obviously-wrong input shapes before any database/provider work happens.
export const requestOtpSchema = z.object({
  phone: z.string().trim().min(1, "Please enter your mobile number.").max(20),
});

export const verifyOtpSchema = z.object({
  phone: z.string().trim().min(1).max(20),
  code: z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code."),
});
