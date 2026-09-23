import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getCustomerByCustomerId,
  getCustomerByNormalizedPrimaryPhone,
  getRecentCustomers,
  searchCustomers,
} from "@/server/queries/admin/customers";

let customerAId: string;
let customerBId: string;
let customerAIdField: string;
const uniqueSuffix = randomUUID().slice(0, 8);
const displayNameA = `Test Search Parent ${uniqueSuffix}`;
const phoneA = "9812300001";
const phoneB = "9812300002";

beforeAll(async () => {
  const a = await db.customer.create({
    data: {
      customerId: `KLQ-TEST${uniqueSuffix.slice(0, 2).toUpperCase()}A`,
      displayName: displayNameA,
      primaryPhone: phoneA,
      primaryPhoneNormalized: `+91${phoneA}`,
      whatsappPhone: phoneB,
      whatsappPhoneNormalized: `+91${phoneB}`,
    },
  });
  customerAId = a.id;
  customerAIdField = a.customerId;

  const b = await db.customer.create({
    data: {
      customerId: `KLQ-TEST${uniqueSuffix.slice(0, 2).toUpperCase()}B`,
      displayName: `Unrelated Name ${uniqueSuffix}`,
      primaryPhone: phoneB,
      primaryPhoneNormalized: `+91${phoneB}`,
    },
  });
  customerBId = b.id;
});

afterAll(async () => {
  await db.customer.deleteMany({ where: { id: { in: [customerAId, customerBId] } } });
  await db.$disconnect();
});

describe("searchCustomers", () => {
  it("finds an exact customerId match case-insensitively", async () => {
    const results = await searchCustomers(customerAIdField.toLowerCase());
    expect(results.some((c) => c.id === customerAId)).toBe(true);
  });

  it("finds by partial displayName", async () => {
    const results = await searchCustomers(displayNameA.split(" ")[2]!);
    expect(results.some((c) => c.id === customerAId)).toBe(true);
  });

  it("finds by primaryPhone in any input format", async () => {
    const results = await searchCustomers("98123 00001");
    expect(results.some((c) => c.id === customerAId)).toBe(true);
  });

  it("finds a customer by a phone that matches another customer's whatsappPhone", async () => {
    const results = await searchCustomers(phoneB);
    const ids = results.map((c) => c.id);
    // phoneB is customer B's primaryPhone AND customer A's whatsappPhone —
    // both should surface, since the query OR-matches either field.
    expect(ids).toContain(customerAId);
    expect(ids).toContain(customerBId);
  });

  it("returns an empty array for a blank query", async () => {
    expect(await searchCustomers("   ")).toEqual([]);
  });

  it("returns an empty array for a query matching nothing", async () => {
    const results = await searchCustomers(`no-such-customer-${randomUUID()}`);
    expect(results).toEqual([]);
  });

  // Phase 3.6.5 Part 1 — the search a real cashier types is rarely a
  // complete value; these prove the `contains`-based partial matching that
  // replaced the old exact-customerId/exact-phone-only behavior.
  it("finds by a partial (prefix) customerId fragment, not just an exact match", async () => {
    const suffix = customerAIdField.slice("KLQ-".length);
    const results = await searchCustomers(suffix.slice(0, 3));
    expect(results.some((c) => c.id === customerAId)).toBe(true);
  });

  it("finds by a partial phone-number fragment", async () => {
    const results = await searchCustomers(phoneA.slice(-6));
    expect(results.some((c) => c.id === customerAId)).toBe(true);
  });

  it("does not attempt a phone match for a 1-2 digit fragment (avoids a near-useless flood)", async () => {
    // "00" appears in both test phones' last digits — with no digit-count
    // floor this would match everyone; the floor keeps it name/id-only.
    const results = await searchCustomers("00");
    expect(results.some((c) => c.id === customerAId || c.id === customerBId)).toBe(false);
  });
});

describe("getRecentCustomers", () => {
  it("returns customers ordered by lastOrderAt, most recent first, excluding those who never ordered", async () => {
    const suffix = randomUUID().slice(0, 8);
    const older = await db.customer.create({
      data: {
        customerId: `KLQ-REC${suffix.slice(0, 3).toUpperCase()}A`,
        displayName: `Recent Older ${suffix}`,
        lastOrderAt: new Date(Date.now() - 60 * 60 * 1000),
      },
    });
    const newer = await db.customer.create({
      data: {
        customerId: `KLQ-REC${suffix.slice(0, 3).toUpperCase()}B`,
        displayName: `Recent Newer ${suffix}`,
        lastOrderAt: new Date(),
      },
    });
    const neverOrdered = await db.customer.create({
      data: {
        customerId: `KLQ-REC${suffix.slice(0, 3).toUpperCase()}C`,
        displayName: `Recent Never Ordered ${suffix}`,
      },
    });

    try {
      const recents = await getRecentCustomers(50);
      const ids = recents.map((c) => c.id);
      expect(ids).not.toContain(neverOrdered.id);
      expect(ids.indexOf(newer.id)).toBeLessThan(ids.indexOf(older.id));
    } finally {
      await db.customer.deleteMany({ where: { id: { in: [older.id, newer.id, neverOrdered.id] } } });
    }
  });

  it("respects the limit parameter", async () => {
    const recents = await getRecentCustomers(1);
    expect(recents.length).toBeLessThanOrEqual(1);
  });
});

describe("getCustomerByCustomerId", () => {
  it("returns the matching customer", async () => {
    const found = await getCustomerByCustomerId(customerAIdField);
    expect(found?.id).toBe(customerAId);
  });

  it("returns null for an unknown customerId", async () => {
    expect(await getCustomerByCustomerId("KLQ-000000")).toBeNull();
  });
});

describe("getCustomerByNormalizedPrimaryPhone", () => {
  it("finds a customer regardless of input phone format", async () => {
    const found = await getCustomerByNormalizedPrimaryPhone("+91 98123-00001");
    expect(found?.id).toBe(customerAId);
  });

  it("returns null for an invalid phone", async () => {
    expect(await getCustomerByNormalizedPrimaryPhone("not-a-phone")).toBeNull();
  });
});
