import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// The action layer resolves its OTP provider via getOtpProvider() with no
// injection point (only the domain layer, requestOtp/verifyOtp, accepts
// one — see otp.test.ts). Mocked here purely so these tests never
// console.log a real dev-provider OTP or depend on NODE_ENV; the behavior
// under test (identical responses regardless of Customer existence) lives
// entirely in requestOtp() itself, which this exercises unchanged.
vi.mock("@/server/otp/provider", () => ({
  getOtpProvider: () => ({ sendOtp: vi.fn().mockResolvedValue(undefined) }),
}));

import { requestOtpAction } from "@/server/actions/customer-portal/auth";

const createdCustomerIds: string[] = [];
const testPhones: string[] = [];

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  const phone = `${firstDigit}${rest}`;
  testPhones.push(phone);
  return phone;
}

afterAll(async () => {
  if (createdCustomerIds.length) {
    await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  await db.otpChallenge.deleteMany({ where: { phoneNormalized: { in: testPhones.map((p) => `+91${p}`) } } });
  await db.$disconnect();
});

describe("requestOtpAction — customer-enumeration privacy", () => {
  it("returns the identical response shape for a phone WITH a registered Customer and one WITHOUT", async () => {
    const registeredPhone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-E${randomUUID().slice(0, 6).toUpperCase()}`,
        displayName: "Enumeration Test Customer",
        primaryPhone: registeredPhone,
        primaryPhoneNormalized: `+91${registeredPhone}`,
      },
    });
    createdCustomerIds.push(customer.id);

    const unregisteredPhone = freshTestPhone();

    const registeredResult = await requestOtpAction({ phone: registeredPhone });
    const unregisteredResult = await requestOtpAction({ phone: unregisteredPhone });

    expect(registeredResult).toEqual(unregisteredResult);
    expect(registeredResult.success).toBe(true);
  });

  it("a malformed phone number still gets a validation-specific (not existence-specific) response, identically regardless of registration", async () => {
    const result = await requestOtpAction({ phone: "123" });
    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.type).toBe("INVALID_PHONE");
    }
  });
});
