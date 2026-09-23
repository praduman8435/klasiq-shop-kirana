import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { checkPhoneOnlySignIn } = await import("@/server/customer-portal/phone-login");

const ip = `test-phone-login-${Date.now()}`;

afterEach(() => {
  vi.unstubAllEnvs();
});

afterAll(async () => {
  await db.orderLookupAttempt.deleteMany({ where: { ipAddress: { startsWith: "test-phone-login-" } } });
  await db.$disconnect();
});

describe("checkPhoneOnlySignIn", () => {
  it("normalises a valid mobile number", async () => {
    const result = await checkPhoneOnlySignIn("98765 43210", `${ip}-a`);
    expect(result).toEqual({ success: true, phoneNormalized: "+919876543210" });
  });

  it("rejects an invalid number without counting it", async () => {
    const result = await checkPhoneOnlySignIn("12345", `${ip}-b`);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("INVALID_PHONE");
    expect(await db.orderLookupAttempt.count({ where: { ipAddress: `${ip}-b` } })).toBe(0);
  });

  it("stops after 10 tries from the same IP", async () => {
    for (let i = 0; i < 10; i++) {
      expect((await checkPhoneOnlySignIn("9876543210", `${ip}-c`)).success).toBe(true);
    }
    const blocked = await checkPhoneOnlySignIn("9876543210", `${ip}-c`);
    expect(blocked.success).toBe(false);
    if (!blocked.success) expect(blocked.error.type).toBe("RATE_LIMITED");
  });

  it("refuses entirely when OTP is required again", async () => {
    vi.stubEnv("CUSTOMER_OTP_REQUIRED", "true");
    const result = await checkPhoneOnlySignIn("9876543210", `${ip}-d`);
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("OTP_REQUIRED");
  });
});
