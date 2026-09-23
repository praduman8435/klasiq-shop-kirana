import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Phase 3.6 Part 1 — proves requestOtp() treats a PROVIDER CONSTRUCTION
// failure (e.g. missing WhatsApp credentials in production) identically
// to a send failure: a generic PROVIDER_UNAVAILABLE result, no challenge
// ever created, and no leak of the underlying configuration error. This
// requires mocking the provider MODULE itself (not just injecting a fake
// provider instance, which every other otp.test.ts case already does) —
// this is the one file in the suite that exercises the
// `provider ?? getOtpProvider()` default-resolution path directly.
vi.mock("@/server/otp/provider", () => ({
  getOtpProvider: () => {
    throw new Error("WhatsApp OTP provider is not configured — set WHATSAPP_API_TOKEN, WHATSAPP_PHONE_NUMBER_ID, and WHATSAPP_OTP_TEMPLATE_NAME.");
  },
}));

import { requestOtp } from "@/server/customer-portal/otp";

const createdPhones: string[] = [];

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  const phone = `${firstDigit}${rest}`;
  createdPhones.push(phone);
  return phone;
}

afterAll(async () => {
  await db.otpChallenge.deleteMany({ where: { phoneNormalized: { in: createdPhones.map((p) => `+91${p}`) } } });
  await db.$disconnect();
});

describe("requestOtp — provider construction failure (Phase 3.6 Part 1)", () => {
  it("returns PROVIDER_UNAVAILABLE without leaking the underlying config error, and creates no challenge", async () => {
    const phone = freshTestPhone();

    const result = await requestOtp(phone); // no explicit provider -> getOtpProvider() is called -> throws

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("PROVIDER_UNAVAILABLE");
      expect(result.error.message).not.toContain("WHATSAPP_API_TOKEN");
      expect(result.error.message).not.toContain("not configured");
    }

    const challenge = await db.otpChallenge.findFirst({ where: { phoneNormalized: `+91${phone}` } });
    expect(challenge).toBeNull();
  });
});
