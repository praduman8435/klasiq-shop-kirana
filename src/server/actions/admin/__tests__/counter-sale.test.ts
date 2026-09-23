import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as returns.test.ts (Phase 3.5 Part
// 3) — exercises the REAL getAdminSession()/createAdminSession(), not a
// stubbed session object.
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

import { createAdminSession } from "@/lib/admin/session";
import {
  createCounterSaleCustomerAction,
  getRecentCustomersForCounterSaleAction,
  searchCustomersForCounterSaleAction,
} from "@/server/actions/admin/counter-sale";

const createdAdminIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.$disconnect();
});

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

async function createTestAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Counter Sale Action Admin",
      email: `test-counter-sale-action-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  createdAdminIds.push(admin.id);
  return admin;
}

describe("createCounterSaleCustomerAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const result = await createCounterSaleCustomerAction({ primaryPhone: freshTestPhone() });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createCounterSaleCustomerAction — validation", () => {
  it("rejects a request with no phone at all", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    const result = await createCounterSaleCustomerAction({ displayName: "No Phone" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });
});

describe("createCounterSaleCustomerAction — success path", () => {
  it("an authenticated admin creates a real, findable customer via the shared Phase 3.1 engine", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    const phone = freshTestPhone();
    const result = await createCounterSaleCustomerAction({
      displayName: "Inline Action Customer",
      primaryPhone: phone,
      whatsappPhone: freshTestPhone(),
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    createdCustomerIds.push(result.customer.id);

    expect(result.customer.customerId.startsWith("KLQ-")).toBe(true);
    expect(result.customer.displayName).toBe("Inline Action Customer");

    const persisted = await db.customer.findUniqueOrThrow({ where: { id: result.customer.id } });
    expect(persisted.primaryPhoneNormalized).toBe(`+91${phone}`);
    expect(persisted.whatsappPhoneNormalized).not.toBeNull();
  });

  it("resolves to the SAME customer, never a duplicate, when called twice for the same phone", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    const phone = freshTestPhone();
    const first = await createCounterSaleCustomerAction({ displayName: "First", primaryPhone: phone });
    expect(first.success).toBe(true);
    if (!first.success) return;
    createdCustomerIds.push(first.customer.id);

    const second = await createCounterSaleCustomerAction({ displayName: "Second", primaryPhone: phone });
    expect(second.success).toBe(true);
    if (!second.success) return;

    expect(second.customer.id).toBe(first.customer.id);
    expect(second.customer.displayName).toBe("First");
  });
});

describe("getRecentCustomersForCounterSaleAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const result = await getRecentCustomersForCounterSaleAction();
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("getRecentCustomersForCounterSaleAction — success path", () => {
  it("an authenticated admin receives the recent-customers list", async () => {
    const admin = await createTestAdmin();
    await createAdminSession(admin.id);

    const result = await getRecentCustomersForCounterSaleAction();
    expect(result.success).toBe(true);
    if (result.success) expect(Array.isArray(result.customers)).toBe(true);
  });
});

describe("searchCustomersForCounterSaleAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const result = await searchCustomersForCounterSaleAction({ query: "test" });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});
