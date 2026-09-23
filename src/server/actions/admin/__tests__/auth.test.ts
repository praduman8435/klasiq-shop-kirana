import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as every other admin action test
// this session, extended with a mocked `headers()` so adminLogin's new
// getClientIp() (src/lib/request-ip.ts) can be driven per-test via a
// literal x-forwarded-for value.
const { store, requestHeaders } = vi.hoisted(() => ({
  store: new Map<string, string>(),
  requestHeaders: new Map<string, string>(),
}));

vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (name: string) => (store.has(name) ? { name, value: store.get(name)! } : undefined),
    set: (name: string, value: string) => {
      store.set(name, value);
    },
    delete: (arg: string | { name: string }) => {
      store.delete(typeof arg === "string" ? arg : arg.name);
    },
  }),
  headers: async () => ({
    get: (name: string) => requestHeaders.get(name.toLowerCase()) ?? null,
  }),
}));

import * as passwordModule from "@/lib/admin/password";
import { hashPassword } from "@/lib/admin/password";
import { adminLogin } from "@/server/actions/admin/auth";

const createdAdminIds: string[] = [];

beforeEach(() => {
  store.clear();
  requestHeaders.clear();
});

afterAll(async () => {
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.adminLoginAttempt.deleteMany({ where: { ipAddress: { startsWith: "198.51.100." } } });
  await db.$disconnect();
});

function freshTestIp(): string {
  return `198.51.100.${Math.floor(Math.random() * 254) + 1}-${randomUUID().slice(0, 8)}`;
}

function setClientIp(ip: string) {
  requestHeaders.set("x-forwarded-for", ip);
}

async function createTestAdmin(password: string) {
  const passwordHash = await hashPassword(password);
  const admin = await db.adminUser.create({
    data: {
      name: "Test Auth Admin",
      email: `test-auth-${randomUUID()}@example.com`,
      passwordHash,
      isActive: true,
    },
  });
  createdAdminIds.push(admin.id);
  return admin;
}

describe("adminLogin", () => {
  it("succeeds with the correct email and password", async () => {
    setClientIp(freshTestIp());
    const admin = await createTestAdmin("correct-horse-battery-staple");

    const result = await adminLogin({ email: admin.email, password: "correct-horse-battery-staple" });
    expect(result).toEqual({ success: true });
  });

  it("fails with the wrong password, with a generic message", async () => {
    setClientIp(freshTestIp());
    const admin = await createTestAdmin("correct-horse-battery-staple");

    const result = await adminLogin({ email: admin.email, password: "wrong-password" });
    expect(result).toEqual({ success: false, message: "Invalid email or password." });
  });

  it("fails identically for a genuinely unknown email (no account enumeration)", async () => {
    setClientIp(freshTestIp());
    const result = await adminLogin({ email: `no-such-admin-${randomUUID()}@example.com`, password: "anything" });
    expect(result).toEqual({ success: false, message: "Invalid email or password." });
  });

  it("fails for a deactivated account, with the same generic message", async () => {
    setClientIp(freshTestIp());
    const admin = await createTestAdmin("correct-horse-battery-staple");
    await db.adminUser.update({ where: { id: admin.id }, data: { isActive: false } });

    const result = await adminLogin({ email: admin.email, password: "correct-horse-battery-staple" });
    expect(result).toEqual({ success: false, message: "Invalid email or password." });
  });

  describe("decoy comparison — enumeration-timing regression (deep security audit, 2026-08-09)", () => {
    // Previously the unknown/inactive-email branch called hashPassword()
    // (a fresh scrypt hash) on EVERY such attempt, before also calling
    // verifyPassword() (a second scrypt op) — double the cost of the
    // "known email, wrong password" branch, which only ever calls
    // verifyPassword() once. That made average response time a reliable
    // signal for enumerating which admin emails exist. The fix memoizes
    // the decoy hash so hashPassword() runs at most once per process,
    // regardless of how many unknown-email attempts arrive.
    it("never calls hashPassword() again after the first unknown-email attempt", async () => {
      const hashSpy = vi.spyOn(passwordModule, "hashPassword");

      setClientIp(freshTestIp());
      await adminLogin({ email: `no-such-admin-a-${randomUUID()}@example.com`, password: "anything" });
      const callsAfterFirst = hashSpy.mock.calls.length;
      expect(callsAfterFirst).toBeGreaterThanOrEqual(0);

      setClientIp(freshTestIp());
      await adminLogin({ email: `no-such-admin-b-${randomUUID()}@example.com`, password: "anything" });
      // Whatever hashPassword() was called for the first unknown-email
      // attempt (at most once, to build the memoized decoy on first use),
      // a SECOND unknown-email attempt must add zero further calls — the
      // memoized value is reused, never recomputed.
      expect(hashSpy.mock.calls.length).toBe(callsAfterFirst);

      hashSpy.mockRestore();
    });
  });

  describe("rate limiting (pre-deployment hardening, 2026-08-10)", () => {
    it("allows 5 attempts from the same IP, then blocks the 6th with a clear message", async () => {
      const ip = freshTestIp();
      setClientIp(ip);
      const admin = await createTestAdmin("correct-horse-battery-staple");

      for (let i = 0; i < 5; i++) {
        const result = await adminLogin({ email: admin.email, password: "wrong-password" });
        expect(result.success).toBe(false);
        if (!result.success) expect(result.message).not.toMatch(/too many/i);
      }

      const sixth = await adminLogin({ email: admin.email, password: "correct-horse-battery-staple" });
      expect(sixth).toEqual({ success: false, message: expect.stringMatching(/too many/i) });
    });

    it("a different IP is not affected by another IP being rate-limited", async () => {
      const rateLimitedIp = freshTestIp();
      const otherIp = freshTestIp();
      const admin = await createTestAdmin("correct-horse-battery-staple");

      setClientIp(rateLimitedIp);
      for (let i = 0; i < 5; i++) {
        await adminLogin({ email: admin.email, password: "wrong-password" });
      }
      const blocked = await adminLogin({ email: admin.email, password: "correct-horse-battery-staple" });
      expect(blocked.success).toBe(false);

      setClientIp(otherIp);
      const stillWorks = await adminLogin({ email: admin.email, password: "correct-horse-battery-staple" });
      expect(stillWorks).toEqual({ success: true });
    });

    it("counts a malformed request toward the same limit", async () => {
      const ip = freshTestIp();
      setClientIp(ip);

      for (let i = 0; i < 5; i++) {
        await adminLogin({ email: "not-an-email" });
      }
      const sixth = await adminLogin({ email: "still-not-an-email" });
      expect(sixth).toEqual({ success: false, message: expect.stringMatching(/too many/i) });
    });
  });
});
