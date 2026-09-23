import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as every other admin action test
// this session — exercises the REAL getAdminSession()/createAdminSession()
// code, not a stubbed session object.
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAdminSession } from "@/lib/admin/session";
import { anonymizeCustomerAction } from "@/server/actions/admin/customers";

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

async function signInAsAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Anonymize Action Admin",
      email: `test-anonymize-action-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  createdAdminIds.push(admin.id);
  await createAdminSession(admin.id);
}

async function createTestCustomer() {
  const suffix = randomUUID().slice(0, 8);
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-ANON${suffix.toUpperCase()}`,
      displayName: "Test Anonymize Target",
      primaryPhone: "9876543210",
      primaryPhoneNormalized: `+91987654${suffix.slice(0, 4)}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

describe("anonymizeCustomerAction — authorization (personal-data audit, 2026-08-10)", () => {
  it("returns UNAUTHORIZED and never touches the customer row when there is no admin session", async () => {
    const customer = await createTestCustomer();
    const result = await anonymizeCustomerAction({ id: customer.id });
    expect(result).toEqual({ success: false, error: { type: "UNAUTHORIZED", message: expect.any(String) } });

    const unchanged = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(unchanged.displayName).toBe("Test Anonymize Target");
  });

  it("erases the customer's profile when a real admin session exists", async () => {
    await signInAsAdmin();
    const customer = await createTestCustomer();

    const result = await anonymizeCustomerAction({ id: customer.id });
    expect(result).toEqual({ success: true });

    const erased = await db.customer.findUniqueOrThrow({ where: { id: customer.id } });
    expect(erased.displayName).toBeNull();
    expect(erased.active).toBe(false);
  });

  it("returns VALIDATION for a malformed input, never calling the domain function", async () => {
    await signInAsAdmin();
    const result = await anonymizeCustomerAction({ id: "" });
    expect(result).toEqual({ success: false, error: { type: "VALIDATION", message: expect.any(String) } });
  });
});
