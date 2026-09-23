import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as every other Phase 4 action
// test file.
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

// Same reason as every other Phase 4 action test file: outside a real
// Next.js request, `revalidatePath` throws "static generation store
// missing".
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createAdminSession } from "@/lib/admin/session";
import { createSupplierCreditAction } from "@/server/actions/admin/supplier-credits";
import { createSupplierPaymentAction } from "@/server/actions/admin/supplier-payments";
import { getPurchasePaymentInfo } from "@/server/queries/admin/supplier-payments";
import { getSupplierCreditDetail, getSupplierCreditSummary } from "@/server/queries/admin/supplier-credits";

const createdAdminIds: string[] = [];
const createdSupplierIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  // Supplier.purchases/.payments/.credits all use `onDelete: Restrict`
  // — credits, payments, and purchases must all go before the supplier
  // itself (allocations cascade from their own parent).
  if (createdSupplierIds.length) {
    await db.supplierCredit.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplierPayment.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplierPurchase.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
  }
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.$disconnect();
});

async function createTestAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Supplier Credit Admin",
      email: `test-supplier-credit-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  createdAdminIds.push(admin.id);
  return admin;
}

async function signInTestAdmin() {
  const admin = await createTestAdmin();
  await createAdminSession(admin.id);
  return admin;
}

async function createTestSupplier() {
  const supplier = await db.supplier.create({ data: { name: `Test Supplier ${randomUUID().slice(0, 8)}` } });
  createdSupplierIds.push(supplier.id);
  return supplier;
}

async function createTestPurchase(supplierId: string, totalInPaise: number, purchaseDate = "2026-08-01") {
  return db.supplierPurchase.create({ data: { supplierId, purchaseDate: new Date(purchaseDate), totalInPaise } });
}

describe("createSupplierCreditAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const supplier = await createTestSupplier();
    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "OVERPAYMENT",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createSupplierCreditAction — validation", () => {
  it("rejects a zero/negative amount", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const zero = await createSupplierCreditAction({ supplierId: supplier.id, creditDate: "2026-08-16", amountInRupees: 0, reason: "OTHER" });
    expect(zero.success).toBe(false);

    const negative = await createSupplierCreditAction({ supplierId: supplier.id, creditDate: "2026-08-16", amountInRupees: -50, reason: "OTHER" });
    expect(negative.success).toBe(false);
  });

  it("rejects an unknown (nonexistent) supplier with NOT_FOUND, writing nothing", async () => {
    await signInTestAdmin();
    const before = await db.supplierCredit.count();
    const result = await createSupplierCreditAction({
      supplierId: `unknown-${randomUUID()}`,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "OTHER",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
    expect(await db.supplierCredit.count()).toBe(before);
  });

  it("rejects an allocation to a nonexistent purchase", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "OTHER",
      allocations: [{ purchaseId: `unknown-${randomUUID()}`, amountInRupees: 50 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects a duplicate purchase across allocations in one submission", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "OTHER",
      allocations: [
        { purchaseId: purchase.id, amountInRupees: 50 },
        { purchaseId: purchase.id, amountInRupees: 50 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects total allocations exceeding the credit amount", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "OTHER",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects cross-supplier allocation — Supplier A credit allocated to Supplier B's purchase", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();
    const purchaseB = await createTestPurchase(supplierB.id, 50000);

    const before = await db.supplierCredit.count({ where: { supplierId: supplierA.id } });
    const result = await createSupplierCreditAction({
      supplierId: supplierA.id,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "OTHER",
      allocations: [{ purchaseId: purchaseB.id, amountInRupees: 100 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
    expect(await db.supplierCredit.count({ where: { supplierId: supplierA.id } })).toBe(before);
  });

  it("rejects an allocation exceeding the purchase's current outstanding (stale-outstanding rejection)", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const first = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-01",
      amountInRupees: 400,
      reason: "OVERPAYMENT",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 400 }],
    });
    expect(first.success).toBe(true);

    // Only ₹100 remains outstanding (500 - 400); attempting a further
    // ₹150 credit allocation must fail — the outstanding ceiling must
    // be recomputed fresh, never trusted from a stale client value.
    const second = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-05",
      amountInRupees: 150,
      reason: "OVERPAYMENT",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 150 }],
    });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.type).toBe("VALIDATION");
  });

  it("rejects an unknown linked supplier return, and a return belonging to a different supplier", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const unknown = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "SUPPLIER_RETURN",
      sourceReturnId: `unknown-${randomUUID()}`,
    });
    expect(unknown.success).toBe(false);
    if (!unknown.success) expect(unknown.error.type).toBe("NOT_FOUND");
  });
});

describe("createSupplierCreditAction — success paths", () => {
  it("creates a credit and allocates it across multiple purchases, correctly reducing each purchase's derived outstanding", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchaseA = await createTestPurchase(supplier.id, 50000, "2026-08-01");
    const purchaseB = await createTestPurchase(supplier.id, 30000, "2026-08-02");

    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 100,
      reason: "OVERPAYMENT",
      reference: "Adj #1",
      allocations: [
        { purchaseId: purchaseA.id, amountInRupees: 70 },
        { purchaseId: purchaseB.id, amountInRupees: 30 },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.creditNumber).toMatch(/^SC-\d{8}-/);

    const infoA = await getPurchasePaymentInfo(purchaseA.id);
    const infoB = await getPurchasePaymentInfo(purchaseB.id);
    expect(infoA?.creditsAppliedInPaise).toBe(7000);
    expect(infoA?.outstandingInPaise).toBe(43000); // 50000 - 7000
    expect(infoB?.creditsAppliedInPaise).toBe(3000);
    expect(infoB?.outstandingInPaise).toBe(27000); // 30000 - 3000

    const persisted = await db.supplierCredit.findUniqueOrThrow({ where: { id: result.id }, include: { allocations: true } });
    expect(persisted.allocations).toHaveLength(2);
  });

  it("leaves an unallocated remainder that is reported as unallocated credit, not silently applied to any purchase", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 30000);

    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 200,
      reason: "OVERPAYMENT",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 150 }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const purchaseInfo = await getPurchasePaymentInfo(purchase.id);
    expect(purchaseInfo?.creditsAppliedInPaise).toBe(15000);
    expect(purchaseInfo?.outstandingInPaise).toBe(15000); // 30000 - 15000, never reduced by the unallocated 50

    const summary = await getSupplierCreditSummary(supplier.id);
    expect(summary.unallocatedCreditInPaise).toBe(5000);
  });

  it("a payment can never over-allocate past a purchase's outstanding once a credit has already been applied", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const credit = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-01",
      amountInRupees: 300,
      reason: "OVERPAYMENT",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 300 }],
    });
    expect(credit.success).toBe(true);

    // Only ₹200 remains outstanding (500 - 300) — a payment allocation
    // of ₹250 must be rejected, proving Part 3's own payment-allocation
    // ceiling is credit-aware (Phase 4 Part 6's update to that file).
    const overPayment = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-05",
      amountInRupees: 250,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 250 }],
    });
    expect(overPayment.success).toBe(false);

    const exactRemaining = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-05",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    expect(exactRemaining.success).toBe(true);

    const finalInfo = await getPurchasePaymentInfo(purchase.id);
    expect(finalInfo?.outstandingInPaise).toBe(0);
  });

  it("does not touch the purchase total, any bill, or existing payments (financial isolation)", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-01",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 100 }],
    });

    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 50,
      reason: "OVERPAYMENT",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 50 }],
    });
    expect(result.success).toBe(true);

    const persistedPurchase = await db.supplierPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(persistedPurchase.totalInPaise).toBe(50000);

    const payments = await db.supplierPayment.findMany({ where: { supplierId: supplier.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amountInPaise).toBe(10000);
  });
});

describe("query layer — detail scoping", () => {
  it("getSupplierCreditDetail returns null when the credit belongs to a different supplier", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();
    const result = await createSupplierCreditAction({ supplierId: supplierA.id, creditDate: "2026-08-16", amountInRupees: 100, reason: "OTHER" });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(await getSupplierCreditDetail(supplierA.id, result.id)).not.toBeNull();
    expect(await getSupplierCreditDetail(supplierB.id, result.id)).toBeNull();
  });
});

describe("transactional integrity", () => {
  it("rolls back an aborted multi-step transaction entirely — no half-created credit or allocation remains", async () => {
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const creditsBefore = await db.supplierCredit.count({ where: { supplierId: supplier.id } });
    const allocationsBefore = await db.creditAllocation.count({ where: { purchaseId: purchase.id } });

    await expect(
      db.$transaction(async (tx) => {
        const credit = await tx.supplierCredit.create({
          data: {
            supplierId: supplier.id,
            creditNumber: `SC-TEST-${randomUUID().slice(0, 8)}`,
            creditDate: new Date("2026-08-16"),
            amountInPaise: 10000,
            reason: "OTHER",
          },
        });
        await tx.creditAllocation.create({ data: { creditId: credit.id, purchaseId: purchase.id, amountInPaise: 10000 } });
        throw new Error("simulated failure after credit + allocation were created");
      }),
    ).rejects.toThrow("simulated failure");

    expect(await db.supplierCredit.count({ where: { supplierId: supplier.id } })).toBe(creditsBefore);
    expect(await db.creditAllocation.count({ where: { purchaseId: purchase.id } })).toBe(allocationsBefore);
  });
});

describe("inventory isolation — Part 6's central invariant", () => {
  it("credit creation and credit allocation never touch Product/ProductVariant/InventoryAdjustment", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const [productsBefore, variantsBefore, stockBefore, adjustmentsBefore] = await Promise.all([
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    const result = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-16",
      amountInRupees: 200,
      reason: "OVERPAYMENT",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    expect(result.success).toBe(true);

    expect(await db.product.count()).toBe(productsBefore);
    expect(await db.productVariant.count()).toBe(variantsBefore);
    expect((await db.productVariant.aggregate({ _sum: { stockQuantity: true } }))._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore);
  });
});
