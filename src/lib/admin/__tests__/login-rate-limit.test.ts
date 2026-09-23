import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { isAdminLoginRateLimited, recordAdminLoginAttempt } from "@/lib/admin/login-rate-limit";

afterAll(async () => {
  await db.adminLoginAttempt.deleteMany({ where: { ipAddress: { startsWith: "203.0.113." } } });
  await db.$disconnect();
});

function freshIp(): string {
  return `203.0.113.${Math.floor(Math.random() * 254) + 1}-${randomUUID().slice(0, 8)}`;
}

describe("Admin login rate limiting — pre-deployment hardening (2026-08-10)", () => {
  it("is not rate-limited before any attempts are recorded", async () => {
    const ip = freshIp();
    expect(await isAdminLoginRateLimited(ip)).toBe(false);
  });

  it("allows exactly 5 attempts, then blocks the 6th within the same window", async () => {
    const ip = freshIp();
    for (let i = 0; i < 5; i++) {
      expect(await isAdminLoginRateLimited(ip)).toBe(false);
      await recordAdminLoginAttempt(ip);
    }
    expect(await isAdminLoginRateLimited(ip)).toBe(true);
  });

  it("scopes the limit per IP — a different IP is unaffected by another IP's attempts", async () => {
    const rateLimitedIp = freshIp();
    const otherIp = freshIp();
    for (let i = 0; i < 5; i++) {
      await recordAdminLoginAttempt(rateLimitedIp);
    }
    expect(await isAdminLoginRateLimited(rateLimitedIp)).toBe(true);
    expect(await isAdminLoginRateLimited(otherIp)).toBe(false);
  });
});
