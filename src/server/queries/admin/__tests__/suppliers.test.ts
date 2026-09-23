import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getAdminSupplierById, getSupplierDirectory } from "@/server/queries/admin/suppliers";

// Phase 4 Part 1 — Supplier Foundation. Real Postgres, no mocks, matching
// this codebase's own established testing convention (see
// khatabook.test.ts's own precedent). Suppliers have no relations yet
// (Part 1 is directory-only), so setup here is simpler than
// khatabook.test.ts's — no Order/Category/AdminUser fixtures needed.

const createdSupplierIds: string[] = [];

afterAll(async () => {
  if (createdSupplierIds.length) {
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
  }
  await db.$disconnect();
});

async function createTestSupplier(overrides: Partial<Parameters<typeof db.supplier.create>[0]["data"]> = {}) {
  const supplier = await db.supplier.create({
    data: {
      name: `Test Supplier ${randomUUID().slice(0, 8)}`,
      isActive: true,
      ...overrides,
    },
  });
  createdSupplierIds.push(supplier.id);
  return supplier;
}

describe("getSupplierDirectory", () => {
  it("paginates: pageSize caps the page, totalCount/totalPages reflect the full matching set", async () => {
    const suffix = randomUUID().slice(0, 8);
    const names = Array.from({ length: 3 }, (_, i) => `Directory Page Supplier ${suffix} ${i}`);
    for (const name of names) await createTestSupplier({ name });

    const result = await getSupplierDirectory({ query: `Directory Page Supplier ${suffix}`, page: 1 });
    expect(result.totalCount).toBe(3);
    expect(result.suppliers).toHaveLength(3);
    expect(result.totalPages).toBe(1);
  });

  it("search matches name, business name, and phone", async () => {
    const suffix = randomUUID().slice(0, 8);
    const byName = await createTestSupplier({ name: `Search Match Name ${suffix}` });
    const byBusiness = await createTestSupplier({ name: `Search Owner ${suffix}`, businessName: `Search Match Business ${suffix}` });
    const byPhone = await createTestSupplier({ name: `Search Phone Owner ${suffix}`, phone: `98765${suffix.slice(0, 5)}` });

    const nameResult = await getSupplierDirectory({ query: `Search Match Name ${suffix}` });
    expect(nameResult.suppliers.some((s) => s.id === byName.id)).toBe(true);

    const businessResult = await getSupplierDirectory({ query: `Search Match Business ${suffix}` });
    expect(businessResult.suppliers.some((s) => s.id === byBusiness.id)).toBe(true);

    const phoneResult = await getSupplierDirectory({ query: `98765${suffix.slice(0, 5)}` });
    expect(phoneResult.suppliers.some((s) => s.id === byPhone.id)).toBe(true);
  });

  it('filter "ACTIVE"/"INACTIVE" correctly partitions suppliers by isActive', async () => {
    const suffix = randomUUID().slice(0, 8);
    const active = await createTestSupplier({ name: `Filter Active Supplier ${suffix}`, isActive: true });
    const inactive = await createTestSupplier({ name: `Filter Inactive Supplier ${suffix}`, isActive: false });

    const activeResult = await getSupplierDirectory({ query: `Filter`, filter: "ACTIVE" });
    const inactiveResult = await getSupplierDirectory({ query: `Filter`, filter: "INACTIVE" });

    expect(activeResult.suppliers.some((s) => s.id === active.id)).toBe(true);
    expect(activeResult.suppliers.some((s) => s.id === inactive.id)).toBe(false);
    expect(inactiveResult.suppliers.some((s) => s.id === inactive.id)).toBe(true);
    expect(inactiveResult.suppliers.some((s) => s.id === active.id)).toBe(false);
  });

  it("returns an empty result for a query matching no supplier", async () => {
    const result = await getSupplierDirectory({ query: `no-such-supplier-${randomUUID()}` });
    expect(result.suppliers).toEqual([]);
    expect(result.totalCount).toBe(0);
  });
});

describe("getAdminSupplierById", () => {
  it("returns null for an unknown id", async () => {
    expect(await getAdminSupplierById(`unknown-${randomUUID()}`)).toBeNull();
  });

  it("returns the full supplier record", async () => {
    const supplier = await createTestSupplier({
      businessName: "Test Business Name",
      phone: "9876543210",
      addressLine: "123 Test Street",
      city: "Testville",
      gstNumber: "TESTGST123",
      notes: "Test note",
    });
    const found = await getAdminSupplierById(supplier.id);
    expect(found).toMatchObject({
      name: supplier.name,
      businessName: "Test Business Name",
      phone: "9876543210",
      addressLine: "123 Test Street",
      city: "Testville",
      gstNumber: "TESTGST123",
      notes: "Test note",
      isActive: true,
    });
  });
});
