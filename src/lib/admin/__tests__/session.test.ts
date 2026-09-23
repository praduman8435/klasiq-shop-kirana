import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Deep security audit (2026-08-09) — this codebase's customer-session
// module (src/lib/customer-portal/__tests__/session.test.ts) already has
// this exact test shape; the admin-session module (src/lib/admin/session.ts)
// had none at all, including no regression test proving an expired admin
// session is actually rejected. Same mocking approach: a real in-memory
// cookie store (vi.hoisted so the mock factory and this file share the
// same Map), exercising the REAL session.ts code end to end.
const { store } = vi.hoisted(() => ({ store: new Map<string, string>() }));

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
}));

import {
  ADMIN_SESSION_COOKIE_NAME,
  createAdminSession,
  destroyAdminSession,
  getAdminSession,
} from "@/lib/admin/session";

const createdAdminIds: string[] = [];

async function createTestAdmin(overrides?: { isActive?: boolean }) {
  const admin = await db.adminUser.create({
    data: {
      name: "Session Test Admin",
      email: `test-admin-session-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
      isActive: overrides?.isActive ?? true,
    },
  });
  createdAdminIds.push(admin.id);
  return admin;
}

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  if (createdAdminIds.length) {
    await db.adminSession.deleteMany({ where: { adminUserId: { in: createdAdminIds } } });
    await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  }
  await db.$disconnect();
});

describe("createAdminSession / getAdminSession", () => {
  it("a valid session resolves the linked AdminUser", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    const resolved = await getAdminSession();
    expect(resolved?.id).toBe(admin.id);
  });

  it("issues a strong, opaque token — long, random, and different every time", async () => {
    const adminA = await createTestAdmin();
    await createAdminSession(adminA.id);
    const tokenA = store.get(ADMIN_SESSION_COOKIE_NAME)!;
    store.clear();

    const adminB = await createTestAdmin();
    await createAdminSession(adminB.id);
    const tokenB = store.get(ADMIN_SESSION_COOKIE_NAME)!;

    expect(tokenA.length).toBeGreaterThanOrEqual(32);
    expect(tokenB.length).toBeGreaterThanOrEqual(32);
    expect(tokenA).not.toBe(tokenB);
  });

  it("stores only a hash of the token server-side — the raw cookie value is never a valid lookup key", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);
    const rawToken = store.get(ADMIN_SESSION_COOKIE_NAME)!;

    const byRawToken = await db.adminSession.findUnique({ where: { tokenHash: rawToken } });
    expect(byRawToken).toBeNull();

    const row = await db.adminSession.findFirst({ where: { adminUserId: admin.id } });
    expect(row).not.toBeNull();
    expect(row?.tokenHash).not.toBe(rawToken);
    expect(row?.tokenHash).not.toContain(rawToken);
  });

  it("rejects a missing session (no cookie)", async () => {
    expect(await getAdminSession()).toBeNull();
  });

  it("rejects an unknown/invalid token", async () => {
    store.set(ADMIN_SESSION_COOKIE_NAME, "a-made-up-token-that-was-never-issued");
    expect(await getAdminSession()).toBeNull();
  });

  // Adversarial scenario explicitly required by the deep security audit:
  // "Reuse of an expired session." A session token that was genuinely
  // issued, then aged past its own expiresAt, must be rejected exactly
  // like one that never existed — and the stale row must be cleaned up,
  // not left around for a later, equally-invalid replay attempt to find.
  it("rejects an expired session and cleans up the row (replay of an expired session)", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    const row = await db.adminSession.findFirstOrThrow({ where: { adminUserId: admin.id } });
    await db.adminSession.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    expect(await getAdminSession()).toBeNull();

    const stillThere = await db.adminSession.findUnique({ where: { id: row.id } });
    expect(stillThere).toBeNull();
  });

  it("rejects a session belonging to a deactivated admin account", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    await db.adminUser.update({ where: { id: admin.id }, data: { isActive: false } });

    expect(await getAdminSession()).toBeNull();
  });
});

describe("destroyAdminSession — logout", () => {
  it("invalidates the session and clears the cookie", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);
    expect(await getAdminSession()).not.toBeNull();

    await destroyAdminSession();

    expect(store.has(ADMIN_SESSION_COOKIE_NAME)).toBe(false);
    expect(await getAdminSession()).toBeNull();
  });

  it("deletes the underlying session row, not just the cookie", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);
    const row = await db.adminSession.findFirstOrThrow({ where: { adminUserId: admin.id } });

    await destroyAdminSession();

    expect(await db.adminSession.findUnique({ where: { id: row.id } })).toBeNull();
  });

  it("does not throw when there is no session to destroy", async () => {
    await expect(destroyAdminSession()).resolves.toBeUndefined();
  });
});
