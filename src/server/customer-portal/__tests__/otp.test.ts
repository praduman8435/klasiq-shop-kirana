import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { OTP_CONFIG } from "@/lib/otp-config";
import { cleanupExpiredOtpChallenges, requestOtp, verifyOtp } from "@/server/customer-portal/otp";
import type { OtpProvider } from "@/server/otp/provider";

// Real Postgres integration tests, real scrypt hashing — never a real
// WhatsApp/SMS send. A fake, in-memory OtpProvider is injected into every
// requestOtp() call so no test depends on (or waits for) a real message;
// see docs/PHASE_3_4_REPORT.md "Development/test provider".

const createdPhones: string[] = [];

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  const phone = `${firstDigit}${rest}`;
  createdPhones.push(phone);
  return phone;
}

function createTestProvider() {
  const sent: { phoneNormalized: string; code: string; purpose: string }[] = [];
  const provider: OtpProvider = {
    async sendOtp(params) {
      sent.push(params);
    },
  };
  return { provider, sent };
}

/** Pushes the most recent challenge's createdAt into the past — the only
 * reliable way to test cooldown-expiry and rate-limit-window behavior
 * without a real wait. */
async function backdateLatestChallenge(phoneNormalized: string, secondsAgo: number) {
  const latest = await db.otpChallenge.findFirst({
    where: { phoneNormalized },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) throw new Error("no challenge to backdate");
  await db.otpChallenge.update({
    where: { id: latest.id },
    data: { createdAt: new Date(Date.now() - secondsAgo * 1000) },
  });
}

async function expireLatestChallenge(phoneNormalized: string) {
  const latest = await db.otpChallenge.findFirst({
    where: { phoneNormalized },
    orderBy: { createdAt: "desc" },
  });
  if (!latest) throw new Error("no challenge to expire");
  await db.otpChallenge.update({
    where: { id: latest.id },
    data: { expiresAt: new Date(Date.now() - 1000) },
  });
}

afterAll(async () => {
  await db.otpChallenge.deleteMany({ where: { phoneNormalized: { in: createdPhones.map((p) => `+91${p}`) } } });
  await db.$disconnect();
});

describe("requestOtp — generation and delivery", () => {
  it("generates a cryptographically-shaped 6-digit numeric, zero-padded code", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();

    const result = await requestOtp(phone, provider);
    expect(result.success).toBe(true);
    expect(sent).toHaveLength(1);
    expect(sent[0]!.code).toMatch(/^\d{6}$/);
    expect(sent[0]!.phoneNormalized).toBe(`+91${phone}`);
  });

  it("rejects an invalid phone number without calling the provider", async () => {
    const { provider, sent } = createTestProvider();
    const result = await requestOtp("12345", provider);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_PHONE");
    expect(sent).toHaveLength(0);
  });

  it("does not create a challenge when the provider fails to send", async () => {
    const phone = freshTestPhone();
    const failingProvider: OtpProvider = {
      async sendOtp() {
        throw new Error("simulated provider outage");
      },
    };
    const result = await requestOtp(phone, failingProvider);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("PROVIDER_UNAVAILABLE");

    const challenge = await db.otpChallenge.findFirst({ where: { phoneNormalized: `+91${phone}` } });
    expect(challenge).toBeNull();
  });
});

describe("verifyOtp — correctness", () => {
  it("succeeds with the correct code", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();
    await requestOtp(phone, provider);

    const result = await verifyOtp(phone, sent[0]!.code);
    expect(result.success).toBe(true);
    if (result.success) expect(result.phoneNormalized).toBe(`+91${phone}`);
  });

  it("fails with an incorrect code", async () => {
    const phone = freshTestPhone();
    const { provider } = createTestProvider();
    await requestOtp(phone, provider);

    const result = await verifyOtp(phone, "000000");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("WRONG_CODE");
  });

  it("reuses Phase 3.1's phone normalization — a differently-formatted number still matches", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();
    await requestOtp(phone, provider);

    const formatted = `+91 ${phone.slice(0, 5)} ${phone.slice(5)}`;
    const result = await verifyOtp(formatted, sent[0]!.code);
    expect(result.success).toBe(true);
  });

  it("rejects an invalid phone shape without querying for a challenge", async () => {
    const result = await verifyOtp("not-a-phone", "123456");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_PHONE");
  });

  it("fails when no challenge has ever been requested for this phone", async () => {
    const phone = freshTestPhone();
    const result = await verifyOtp(phone, "123456");
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NO_ACTIVE_CHALLENGE");
  });
});

describe("verifyOtp — expiration", () => {
  it("succeeds before expiry", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();
    await requestOtp(phone, provider);
    const result = await verifyOtp(phone, sent[0]!.code);
    expect(result.success).toBe(true);
  });

  it("fails after expiry, even with the correct code", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();
    await requestOtp(phone, provider);
    await expireLatestChallenge(`+91${phone}`);

    const result = await verifyOtp(phone, sent[0]!.code);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("EXPIRED");
  });
});

describe("verifyOtp — attempt limit", () => {
  it("increments attemptCount on each wrong guess", async () => {
    const phone = freshTestPhone();
    const { provider } = createTestProvider();
    await requestOtp(phone, provider);

    await verifyOtp(phone, "000000");
    let challenge = await db.otpChallenge.findFirst({ where: { phoneNormalized: `+91${phone}` } });
    expect(challenge?.attemptCount).toBe(1);

    await verifyOtp(phone, "111111");
    challenge = await db.otpChallenge.findFirst({ where: { phoneNormalized: `+91${phone}` } });
    expect(challenge?.attemptCount).toBe(2);
  });

  it("locks the challenge after the configured max attempts — even the correct code is then refused", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();
    await requestOtp(phone, provider);

    for (let i = 0; i < OTP_CONFIG.maxAttempts; i++) {
      const result = await verifyOtp(phone, "000000");
      expect(result.success).toBe(false);
    }

    const result = await verifyOtp(phone, sent[0]!.code);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("TOO_MANY_ATTEMPTS");
  });
});

describe("verifyOtp — replay resistance", () => {
  it("consumes the challenge on success — the same code cannot be replayed", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();
    await requestOtp(phone, provider);

    const first = await verifyOtp(phone, sent[0]!.code);
    expect(first.success).toBe(true);

    const replay = await verifyOtp(phone, sent[0]!.code);
    expect(replay.success).toBe(false);
    if (!replay.success) expect(replay.error.type).toBe("NO_ACTIVE_CHALLENGE");
  });
});

describe("requestOtp — replacement semantics", () => {
  it("a new request supersedes the earlier challenge — the old code stops working, only the new one succeeds", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();

    await requestOtp(phone, provider);
    const firstCode = sent[0]!.code;

    // Bypass the cooldown deterministically instead of waiting.
    await backdateLatestChallenge(`+91${phone}`, OTP_CONFIG.resendCooldownSeconds + 1);
    await requestOtp(phone, provider);
    const secondCode = sent[1]!.code;

    const oldResult = await verifyOtp(phone, firstCode);
    expect(oldResult.success).toBe(false);

    const newResult = await verifyOtp(phone, secondCode);
    expect(newResult.success).toBe(true);
  });
});

describe("requestOtp — resend cooldown and rate limiting", () => {
  it("rejects a second request before the cooldown elapses", async () => {
    const phone = freshTestPhone();
    const { provider } = createTestProvider();

    await requestOtp(phone, provider);
    const second = await requestOtp(phone, provider);

    expect(second.success).toBe(false);
    if (!second.success) {
      expect(second.error.type).toBe("COOLDOWN");
      expect(second.error).toMatchObject({ retryAfterSeconds: expect.any(Number) });
      if (second.error.type === "COOLDOWN") {
        expect(second.error.retryAfterSeconds).toBeGreaterThan(0);
      }
    }
  });

  it("allows a new request once the cooldown has elapsed", async () => {
    const phone = freshTestPhone();
    const { provider, sent } = createTestProvider();

    await requestOtp(phone, provider);
    await backdateLatestChallenge(`+91${phone}`, OTP_CONFIG.resendCooldownSeconds + 1);

    const result = await requestOtp(phone, provider);
    expect(result.success).toBe(true);
    expect(sent).toHaveLength(2);
  });

  it("enforces the rolling-window request cap even when the cooldown is respected each time", async () => {
    const phone = freshTestPhone();
    const { provider } = createTestProvider();

    for (let i = 0; i < OTP_CONFIG.maxRequestsPerWindow; i++) {
      const result = await requestOtp(phone, provider);
      expect(result.success).toBe(true);
      await backdateLatestChallenge(`+91${phone}`, OTP_CONFIG.resendCooldownSeconds + 1);
    }

    const overLimit = await requestOtp(phone, provider);
    expect(overLimit.success).toBe(false);
    if (!overLimit.success) expect(overLimit.error.type).toBe("RATE_LIMITED");
  });
});

describe("cleanupExpiredOtpChallenges — Phase 3.4 Part 3", () => {
  it("deletes challenges past the retention window and leaves recent ones alone", async () => {
    const oldPhone = freshTestPhone();
    const recentPhone = freshTestPhone();
    const { provider } = createTestProvider();

    await requestOtp(oldPhone, provider);
    // Well past the 24-hour retention window — worthless regardless of
    // consumed/expired state.
    await backdateLatestChallenge(`+91${oldPhone}`, 25 * 60 * 60);

    await requestOtp(recentPhone, provider);

    await cleanupExpiredOtpChallenges();

    const oldRemaining = await db.otpChallenge.count({ where: { phoneNormalized: `+91${oldPhone}` } });
    const recentRemaining = await db.otpChallenge.count({ where: { phoneNormalized: `+91${recentPhone}` } });
    expect(oldRemaining).toBe(0);
    expect(recentRemaining).toBe(1);
  });

  it("is safe to call with nothing to clean up", async () => {
    await expect(cleanupExpiredOtpChallenges()).resolves.toBeUndefined();
  });
});
