import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// next/headers' cookies() only works inside a real Next.js request scope —
// a bare Vitest run has none. Mocked here with a simple in-memory store
// (vi.hoisted so the test file and the mock factory share the exact same
// Map) — this exercises the REAL session.ts code end to end (real cookie
// name, real 3-arg `.set()` call, real `.delete()` shape), not a parallel
// reimplementation. See docs/PHASE_3_4_REPORT.md "Testing — session".
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
  CUSTOMER_SESSION_COOKIE_NAME,
  cleanupExpiredCustomerSessions,
  createCustomerSession,
  destroyCustomerSession,
  getCustomerSession,
} from "@/lib/customer-portal/session";

const createdCustomerIds: string[] = [];
const usedPhones: string[] = [];

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  const phone = `+91${firstDigit}${rest}`;
  usedPhones.push(phone);
  return phone;
}

async function createTestCustomer(phoneNormalized: string, displayName: string) {
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-T${randomUUID().slice(0, 6).toUpperCase()}`,
      displayName,
      primaryPhone: phoneNormalized.replace("+91", ""),
      primaryPhoneNormalized: phoneNormalized,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  // Every test here creates a real CustomerSession row (createCustomerSession
  // writes to the shared dev database, same as any other integration test in
  // this suite) — these must be torn down explicitly, they are not covered
  // by any other file's cleanup.
  if (usedPhones.length) {
    await db.customerSession.deleteMany({ where: { phoneNormalized: { in: usedPhones } } });
  }
  if (createdCustomerIds.length) {
    await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  }
  await db.$disconnect();
});

describe("createCustomerSession / getCustomerSession", () => {
  it("a valid session resolves the linked Customer", async () => {
    const phone = freshTestPhone();
    const customer = await createTestCustomer(phone, "Session Test Customer");

    await createCustomerSession(phone);
    const session = await getCustomerSession();

    expect(session).not.toBeNull();
    expect(session?.phoneNormalized).toBe(phone);
    expect(session?.customer?.id).toBe(customer.id);
  });

  it("a verified phone with no Customer record resolves a session with customer: null (never a fabricated Customer)", async () => {
    const phone = freshTestPhone();
    await createCustomerSession(phone);
    const session = await getCustomerSession();

    expect(session).not.toBeNull();
    expect(session?.phoneNormalized).toBe(phone);
    expect(session?.customer).toBeNull();
  });

  it("issues a strong, opaque token — long, random, and different every time", async () => {
    const phoneA = freshTestPhone();
    await createCustomerSession(phoneA);
    const tokenA = store.get(CUSTOMER_SESSION_COOKIE_NAME)!;
    store.clear();

    const phoneB = freshTestPhone();
    await createCustomerSession(phoneB);
    const tokenB = store.get(CUSTOMER_SESSION_COOKIE_NAME)!;

    expect(tokenA.length).toBeGreaterThanOrEqual(32);
    expect(tokenB.length).toBeGreaterThanOrEqual(32);
    expect(tokenA).not.toBe(tokenB);
  });

  it("stores only a hash of the token server-side — the raw cookie value is never a valid lookup key", async () => {
    const phone = freshTestPhone();
    await createCustomerSession(phone);
    const rawToken = store.get(CUSTOMER_SESSION_COOKIE_NAME)!;

    const byRawToken = await db.customerSession.findUnique({ where: { tokenHash: rawToken } });
    expect(byRawToken).toBeNull();

    const row = await db.customerSession.findFirst({ where: { phoneNormalized: phone } });
    expect(row).not.toBeNull();
    expect(row?.tokenHash).not.toBe(rawToken);
    expect(row?.tokenHash).not.toContain(rawToken);
  });

  it("rejects a missing session (no cookie)", async () => {
    const session = await getCustomerSession();
    expect(session).toBeNull();
  });

  it("rejects an unknown/invalid token", async () => {
    store.set(CUSTOMER_SESSION_COOKIE_NAME, "a-made-up-token-that-was-never-issued");
    const session = await getCustomerSession();
    expect(session).toBeNull();
  });

  it("rejects an expired session and cleans up the row", async () => {
    const phone = freshTestPhone();
    await createCustomerSession(phone);

    const row = await db.customerSession.findFirstOrThrow({ where: { phoneNormalized: phone } });
    await db.customerSession.update({ where: { id: row.id }, data: { expiresAt: new Date(Date.now() - 1000) } });

    const session = await getCustomerSession();
    expect(session).toBeNull();

    const stillThere = await db.customerSession.findUnique({ where: { id: row.id } });
    expect(stillThere).toBeNull();
  });
});

describe("destroyCustomerSession — logout", () => {
  it("invalidates the session and clears the cookie", async () => {
    const phone = freshTestPhone();
    await createCustomerSession(phone);
    expect(await getCustomerSession()).not.toBeNull();

    await destroyCustomerSession();

    expect(store.has(CUSTOMER_SESSION_COOKIE_NAME)).toBe(false);
    expect(await getCustomerSession()).toBeNull();
  });

  it("deletes the underlying session row, not just the cookie", async () => {
    const phone = freshTestPhone();
    await createCustomerSession(phone);
    const row = await db.customerSession.findFirstOrThrow({ where: { phoneNormalized: phone } });

    await destroyCustomerSession();

    const stillThere = await db.customerSession.findUnique({ where: { id: row.id } });
    expect(stillThere).toBeNull();
  });

  it("does not throw when there is no session to destroy", async () => {
    await expect(destroyCustomerSession()).resolves.toBeUndefined();
  });
});

describe("cross-customer authorization boundary", () => {
  it("Customer A's session can never resolve Customer B's data — there is no ID input to this lookup at all", async () => {
    const phoneA = freshTestPhone();
    const phoneB = freshTestPhone();
    const customerA = await createTestCustomer(phoneA, "Customer A");
    const customerB = await createTestCustomer(phoneB, "Customer B");

    await createCustomerSession(phoneA);
    // getCustomerSession() takes NO arguments — there is no customerId,
    // phone, or order number a caller could supply to redirect it toward
    // a different customer. Its only input is the request's own cookie.
    const session = await getCustomerSession();

    expect(session?.customer?.id).toBe(customerA.id);
    expect(session?.customer?.id).not.toBe(customerB.id);
  });
});

describe("cleanupExpiredCustomerSessions — Phase 3.4 Part 3", () => {
  it("deletes sessions past their expiresAt and leaves valid ones alone", async () => {
    const expiredPhone = freshTestPhone();
    await createCustomerSession(expiredPhone);
    const expiredRow = await db.customerSession.findFirstOrThrow({
      where: { phoneNormalized: expiredPhone },
    });
    await db.customerSession.update({
      where: { id: expiredRow.id },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const validPhone = freshTestPhone();
    store.clear();
    await createCustomerSession(validPhone);

    await cleanupExpiredCustomerSessions();

    expect(await db.customerSession.findUnique({ where: { id: expiredRow.id } })).toBeNull();
    const validRemaining = await db.customerSession.count({ where: { phoneNormalized: validPhone } });
    expect(validRemaining).toBe(1);
  });

  it("is safe to call with nothing to clean up", async () => {
    await expect(cleanupExpiredCustomerSessions()).resolves.toBeUndefined();
  });
});
