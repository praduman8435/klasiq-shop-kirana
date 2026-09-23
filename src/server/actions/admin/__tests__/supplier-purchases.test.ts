import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as counter-sale.test.ts/
// returns.test.ts — exercises the REAL getAdminSession()/
// createAdminSession(), not a stubbed session object.
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

// This is the first admin-action test suite in this codebase to call an
// action that reaches `revalidatePath` directly (existing suites like
// counter-sale.test.ts only exercise sub-actions that never call it) —
// outside a real Next.js request, `revalidatePath` throws "static
// generation store missing", unrelated to anything this feature does.
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createAdminSession } from "@/lib/admin/session";
import {
  addSupplierPurchaseBillAttachmentAction,
  createSupplierPurchaseAction,
  removeSupplierPurchaseBillAttachmentAction,
  updateSupplierPurchaseBillAction,
  updateSupplierPurchaseDetailsAction,
} from "@/server/actions/admin/supplier-purchases";
import {
  getSupplierPurchaseDetail,
  getSupplierPurchaseHistory,
  getSupplierPurchaseSummary,
} from "@/server/queries/admin/supplier-purchases";

const createdAdminIds: string[] = [];
const createdSupplierIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  // Supplier.purchases uses `onDelete: Restrict` (a Supplier deliberately
  // has no hard-delete path at all — see Supplier's own schema doc
  // comment), so a test supplier with purchases must have its purchases
  // deleted first. SupplierPurchase → bills → attachments IS Cascade, so
  // deleting the purchases is enough to take their bills/attachments
  // with them.
  if (createdSupplierIds.length) {
    await db.supplierPurchase.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
  }
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.$disconnect();
});

async function createTestAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Supplier Purchase Admin",
      email: `test-supplier-purchase-admin-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  createdAdminIds.push(admin.id);
  return admin;
}

async function createTestSupplier() {
  const supplier = await db.supplier.create({
    data: { name: `Test Supplier ${randomUUID().slice(0, 8)}` },
  });
  createdSupplierIds.push(supplier.id);
  return supplier;
}

async function signInTestAdmin() {
  const admin = await createTestAdmin();
  await createAdminSession(admin.id);
  return admin;
}

describe("createSupplierPurchaseAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const supplier = await createTestSupplier();
    const result = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [{ billDate: "2026-08-16", amountInRupees: 100, attachments: [] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createSupplierPurchaseAction — validation", () => {
  it("rejects a purchase with zero bills", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects a bill with a zero or negative amount", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [{ billDate: "2026-08-16", amountInRupees: 0, attachments: [] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects an unknown supplier id with NOT_FOUND, writing nothing", async () => {
    await signInTestAdmin();
    const purchaseCountBefore = await db.supplierPurchase.count();
    const result = await createSupplierPurchaseAction({
      supplierId: `unknown-${randomUUID()}`,
      purchaseDate: "2026-08-16",
      bills: [{ billDate: "2026-08-16", amountInRupees: 100, attachments: [] }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
    expect(await db.supplierPurchase.count()).toBe(purchaseCountBefore);
  });
});

describe("createSupplierPurchaseAction — success path (multiple bills + attachments)", () => {
  it("persists one purchase with all its bills and attachments, with a total derived from the bills", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const result = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      reference: "Delivery challan #9",
      notes: "Two invoices from one visit",
      bills: [
        {
          billNumber: "SH-1021",
          billDate: "2026-08-16",
          amountInRupees: 300,
          attachments: [
            { url: "https://example.com/bill1-front.jpg", originalFilename: "front.jpg" },
            { url: "https://example.com/bill1-back.jpg", originalFilename: "back.jpg" },
          ],
        },
        {
          billNumber: "SH-1022",
          billDate: "2026-08-16",
          amountInRupees: 185,
          attachments: [{ url: "https://example.com/bill2.jpg" }],
        },
      ],
    });

    expect(result.success).toBe(true);
    if (!result.success) return;

    const persisted = await db.supplierPurchase.findUniqueOrThrow({
      where: { id: result.id },
      include: { bills: { include: { attachments: true } } },
    });

    // 300 + 185 rupees = 48500 paise — total is DERIVED from the bills,
    // never independently entered.
    expect(persisted.totalInPaise).toBe(48500);
    expect(persisted.bills).toHaveLength(2);
    const bill1 = persisted.bills.find((b) => b.billNumber === "SH-1021")!;
    const bill2 = persisted.bills.find((b) => b.billNumber === "SH-1022")!;
    expect(bill1.amountInPaise).toBe(30000);
    expect(bill2.amountInPaise).toBe(18500);
    expect(bill1.attachments).toHaveLength(2);
    expect(bill2.attachments).toHaveLength(1);
    expect(bill1.attachments.map((a) => a.originalFilename).sort()).toEqual(["back.jpg", "front.jpg"]);
  });
});

describe("editing recomputes the derived purchase total", () => {
  it("updateSupplierPurchaseBillAction changes the bill amount and the parent purchase's totalInPaise together", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const created = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [
        { billNumber: "A", billDate: "2026-08-16", amountInRupees: 100, attachments: [] },
        { billNumber: "B", billDate: "2026-08-16", amountInRupees: 200, attachments: [] },
      ],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const beforeEdit = await db.supplierPurchase.findUniqueOrThrow({
      where: { id: created.id },
      include: { bills: true },
    });
    expect(beforeEdit.totalInPaise).toBe(30000);
    const billA = beforeEdit.bills.find((b) => b.billNumber === "A")!;

    const updateResult = await updateSupplierPurchaseBillAction({
      id: billA.id,
      billNumber: "A",
      billDate: "2026-08-16",
      amountInRupees: 500,
    });
    expect(updateResult.success).toBe(true);

    const afterEdit = await db.supplierPurchase.findUniqueOrThrow({ where: { id: created.id } });
    // 500 + 200 rupees = 70000 paise — recomputed, never left drifting.
    expect(afterEdit.totalInPaise).toBe(70000);
  });

  it("updateSupplierPurchaseDetailsAction updates date/reference/notes without touching totalInPaise", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const created = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [{ billDate: "2026-08-16", amountInRupees: 100, attachments: [] }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const result = await updateSupplierPurchaseDetailsAction({
      id: created.id,
      purchaseDate: "2026-08-10",
      reference: "Updated reference",
      notes: "Updated notes",
    });
    expect(result.success).toBe(true);

    const persisted = await db.supplierPurchase.findUniqueOrThrow({ where: { id: created.id } });
    expect(persisted.reference).toBe("Updated reference");
    expect(persisted.totalInPaise).toBe(10000);
  });
});

describe("bill attachment add/remove", () => {
  it("adds and removes an attachment via the dedicated actions", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const created = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [{ billDate: "2026-08-16", amountInRupees: 100, attachments: [] }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const purchase = await db.supplierPurchase.findUniqueOrThrow({ where: { id: created.id }, include: { bills: true } });
    const billId = purchase.bills[0].id;

    const addResult = await addSupplierPurchaseBillAttachmentAction({ billId, url: "https://example.com/added.jpg" });
    expect(addResult.success).toBe(true);
    if (!addResult.success) return;

    const afterAdd = await db.supplierPurchaseBillAttachment.findMany({ where: { billId } });
    expect(afterAdd).toHaveLength(1);

    const removeResult = await removeSupplierPurchaseBillAttachmentAction({ id: addResult.id });
    expect(removeResult.success).toBe(true);

    const afterRemove = await db.supplierPurchaseBillAttachment.findMany({ where: { billId } });
    expect(afterRemove).toHaveLength(0);
  });
});

describe("query layer — retrieval and pagination", () => {
  it("getSupplierPurchaseSummary aggregates total/count/latest date across a supplier's purchases", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-01",
      bills: [{ billDate: "2026-08-01", amountInRupees: 100, attachments: [] }],
    });
    await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [{ billDate: "2026-08-16", amountInRupees: 200, attachments: [] }],
    });

    const summary = await getSupplierPurchaseSummary(supplier.id);
    expect(summary.purchaseCount).toBe(2);
    expect(summary.totalInPaise).toBe(30000);
    expect(summary.latestPurchaseDate?.toISOString().slice(0, 10)).toBe("2026-08-16");
  });

  it("getSupplierPurchaseHistory paginates and orders newest-first", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    for (const date of ["2026-08-01", "2026-08-05", "2026-08-10"]) {
      await createSupplierPurchaseAction({
        supplierId: supplier.id,
        purchaseDate: date,
        bills: [{ billDate: date, amountInRupees: 50, attachments: [] }],
      });
    }

    const history = await getSupplierPurchaseHistory({ supplierId: supplier.id, page: 1 });
    expect(history.totalCount).toBe(3);
    expect(history.purchases[0].purchaseDate.toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(history.purchases.every((p) => p.billCount === 1)).toBe(true);
  });

  it("getSupplierPurchaseDetail returns null when the purchase belongs to a different supplier", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();
    const created = await createSupplierPurchaseAction({
      supplierId: supplierA.id,
      purchaseDate: "2026-08-16",
      bills: [{ billDate: "2026-08-16", amountInRupees: 100, attachments: [] }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    expect(await getSupplierPurchaseDetail(supplierA.id, created.id)).not.toBeNull();
    expect(await getSupplierPurchaseDetail(supplierB.id, created.id)).toBeNull();
  });
});

describe("transactional integrity", () => {
  it("rolls back an aborted multi-step transaction entirely — no half-created purchase remains", async () => {
    const supplier = await createTestSupplier();
    const before = await db.supplierPurchase.count({ where: { supplierId: supplier.id } });

    await expect(
      db.$transaction(async (tx) => {
        await tx.supplierPurchase.create({
          data: { supplierId: supplier.id, purchaseDate: new Date("2026-08-16"), totalInPaise: 10000 },
        });
        throw new Error("simulated failure after the purchase row was created");
      }),
    ).rejects.toThrow("simulated failure");

    const after = await db.supplierPurchase.count({ where: { supplierId: supplier.id } });
    expect(after).toBe(before);
  });
});

describe("inventory isolation — Part 2's central invariant", () => {
  it("creating a supplier purchase with bills and attachments does not change any Product/ProductVariant/InventoryAdjustment row", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const [productsBefore, variantsBefore, stockBefore, adjustmentsBefore] = await Promise.all([
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    const result = await createSupplierPurchaseAction({
      supplierId: supplier.id,
      purchaseDate: "2026-08-16",
      bills: [
        { billNumber: "SH-1", billDate: "2026-08-16", amountInRupees: 300, attachments: [{ url: "https://example.com/a.jpg" }] },
        { billNumber: "SH-2", billDate: "2026-08-16", amountInRupees: 185, attachments: [] },
      ],
    });
    expect(result.success).toBe(true);

    const [productsAfter, variantsAfter, stockAfter, adjustmentsAfter] = await Promise.all([
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    expect(productsAfter).toBe(productsBefore);
    expect(variantsAfter).toBe(variantsBefore);
    expect(stockAfter._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(adjustmentsAfter).toBe(adjustmentsBefore);
  });
});
