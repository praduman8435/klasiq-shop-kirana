import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as supplier-purchases.test.ts/
// supplier-payments.test.ts — exercises the REAL getAdminSession()/
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

// Same reason as the other Phase 4 action test files: outside a real
// Next.js request, `revalidatePath` throws "static generation store
// missing".
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createAdminSession } from "@/lib/admin/session";
import { createSupplierPurchaseReceiptAction } from "@/server/actions/admin/supplier-purchase-receipts";
import { createSupplierPaymentAction } from "@/server/actions/admin/supplier-payments";
import {
  getPurchaseReceiptHistory,
  getPurchaseReceivingSummary,
  getSupplierPurchaseReceiptDetail,
  getSupplierRecentReceipts,
} from "@/server/queries/admin/supplier-purchase-receipts";
import { getPurchasePaymentInfo } from "@/server/queries/admin/supplier-payments";

const createdAdminIds: string[] = [];
const createdSupplierIds: string[] = [];
const createdProductIds: string[] = [];
const createdCategoryIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  // Supplier.purchases/.payments both use `onDelete: Restrict` — delete
  // payments and purchases (which cascade their own receipts/bills/
  // adjustments-by-SetNull) before the supplier itself. Deleting a
  // Product cascades its ProductVariants (onDelete: Cascade), which
  // cascades their InventoryAdjustment rows too (onDelete: Cascade on
  // InventoryAdjustment.productVariantId) — see schema.prisma.
  if (createdSupplierIds.length) {
    // SupplierPurchaseReceipt.purchaseId is ALSO `onDelete: Restrict`
    // (see that model's own schema doc comment) — receipts must go
    // before purchases, same as payments.
    await db.supplierPurchaseReceipt.deleteMany({ where: { purchase: { supplierId: { in: createdSupplierIds } } } });
    await db.supplierPayment.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplierPurchase.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
  }
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCategoryIds.length) await db.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.$disconnect();
});

async function createTestAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Receipt Admin",
      email: `test-receipt-admin-${randomUUID()}@example.com`,
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

async function createTestVariant(overrides: { stockQuantity?: number } = {}) {
  const suffix = randomUUID().slice(0, 8);
  const category = await db.category.create({ data: { slug: `test-receipt-cat-${suffix}`, name: `Test Receipt Category ${suffix}` } });
  createdCategoryIds.push(category.id);
  const product = await db.product.create({ data: { slug: `test-receipt-product-${suffix}`, name: `Test Receipt Product ${suffix}`, categoryId: category.id } });
  createdProductIds.push(product.id);
  return db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-RECEIPT-SKU-${suffix}`,
      priceInPaise: 50000,
      stockQuantity: overrides.stockQuantity ?? 10,
    },
  });
}

describe("createSupplierPurchaseReceiptAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant();
    const result = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: variant.id, quantity: 10 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createSupplierPurchaseReceiptAction — validation", () => {
  it("rejects an unknown purchase with NOT_FOUND, writing nothing", async () => {
    await signInTestAdmin();
    const variant = await createTestVariant();
    const before = await db.supplierPurchaseReceipt.count();
    const result = await createSupplierPurchaseReceiptAction({
      purchaseId: `unknown-${randomUUID()}`,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: variant.id, quantity: 10 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
    expect(await db.supplierPurchaseReceipt.count()).toBe(before);
  });

  it("rejects a receipt with zero items", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const result = await createSupplierPurchaseReceiptAction({ purchaseId: purchase.id, receivedAt: "2026-08-16", items: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects a zero or negative quantity", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant();

    const zero = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: variant.id, quantity: 0 }],
    });
    expect(zero.success).toBe(false);

    const negative = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: variant.id, quantity: -5 }],
    });
    expect(negative.success).toBe(false);
  });

  it("rejects an unknown product variant, writing nothing", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const before = await db.inventoryAdjustment.count();

    const result = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: `unknown-${randomUUID()}`, quantity: 10 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
    expect(await db.inventoryAdjustment.count()).toBe(before);
    expect(await db.supplierPurchaseReceipt.count({ where: { purchaseId: purchase.id } })).toBe(0);
  });

  it("rejects a duplicate variant within one receipt", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant();

    const result = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      items: [
        { productVariantId: variant.id, quantity: 10 },
        { productVariantId: variant.id, quantity: 5 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });
});

describe("createSupplierPurchaseReceiptAction — success paths", () => {
  it("creates a receipt with multiple lines and increases each variant's stock with an auditable InventoryAdjustment", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variantA = await createTestVariant({ stockQuantity: 100 });
    const variantB = await createTestVariant({ stockQuantity: 50 });

    const result = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      reference: "Delivery challan #1",
      items: [
        { productVariantId: variantA.id, quantity: 20, unitCostInRupees: 150 },
        { productVariantId: variantB.id, quantity: 30 },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const freshA = await db.productVariant.findUniqueOrThrow({ where: { id: variantA.id } });
    const freshB = await db.productVariant.findUniqueOrThrow({ where: { id: variantB.id } });
    expect(freshA.stockQuantity).toBe(120);
    expect(freshB.stockQuantity).toBe(80);

    const adjustments = await db.inventoryAdjustment.findMany({ where: { supplierPurchaseReceiptId: result.id } });
    expect(adjustments).toHaveLength(2);
    expect(adjustments.every((a) => a.reason === "STOCK_RECEIVED")).toBe(true);
    const adjA = adjustments.find((a) => a.productVariantId === variantA.id)!;
    expect(adjA.previousQuantity).toBe(100);
    expect(adjA.newQuantity).toBe(120);
    expect(adjA.delta).toBe(20);

    const receiptItems = await db.supplierPurchaseReceiptItem.findMany({ where: { receiptId: result.id } });
    expect(receiptItems).toHaveLength(2);
    const itemA = receiptItems.find((i) => i.productVariantId === variantA.id)!;
    expect(itemA.unitCostInPaise).toBe(15000);
    const itemB = receiptItems.find((i) => i.productVariantId === variantB.id)!;
    expect(itemB.unitCostInPaise).toBeNull();
  });

  it("supports multiple receiving events against one purchase — partial receiving accumulates correctly", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 0 });

    const first = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-01",
      items: [{ productVariantId: variant.id, quantity: 20 }],
    });
    expect(first.success).toBe(true);

    const second = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-10",
      items: [{ productVariantId: variant.id, quantity: 10 }],
    });
    expect(second.success).toBe(true);

    const fresh = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(fresh.stockQuantity).toBe(30);

    const summary = await getPurchaseReceivingSummary(purchase.id);
    expect(summary.totalReceivedUnits).toBe(30);
    expect(summary.receiptCount).toBe(2);
    expect(summary.lastReceivedAt?.toISOString().slice(0, 10)).toBe("2026-08-10");

    const history = await getPurchaseReceiptHistory(purchase.id);
    expect(history).toHaveLength(2);
    expect(history[0].receivedAt.toISOString().slice(0, 10)).toBe("2026-08-10"); // newest first
  });

  it("does not change the purchase's financial total or the accounting figures Payments already established", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant();

    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-05",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });

    const paymentInfoBefore = await getPurchasePaymentInfo(purchase.id);

    const result = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: variant.id, quantity: 25, unitCostInRupees: 250 }],
    });
    expect(result.success).toBe(true);

    const persistedPurchase = await db.supplierPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(persistedPurchase.totalInPaise).toBe(50000); // unchanged by receiving

    const paymentInfoAfter = await getPurchasePaymentInfo(purchase.id);
    expect(paymentInfoAfter?.paidInPaise).toBe(paymentInfoBefore?.paidInPaise);
    expect(paymentInfoAfter?.outstandingInPaise).toBe(paymentInfoBefore?.outstandingInPaise);
  });
});

describe("query layer — history and detail scoping", () => {
  it("getSupplierPurchaseReceiptDetail returns null when the receipt belongs to a different purchase", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchaseA = await createTestPurchase(supplier.id, 50000);
    const purchaseB = await createTestPurchase(supplier.id, 30000);
    const variant = await createTestVariant();

    const result = await createSupplierPurchaseReceiptAction({
      purchaseId: purchaseA.id,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: variant.id, quantity: 10 }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(await getSupplierPurchaseReceiptDetail(purchaseA.id, result.id)).not.toBeNull();
    expect(await getSupplierPurchaseReceiptDetail(purchaseB.id, result.id)).toBeNull();
  });

  it("getSupplierRecentReceipts reports receipts across every purchase for a supplier, newest first", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase1 = await createTestPurchase(supplier.id, 50000, "2026-08-01");
    const purchase2 = await createTestPurchase(supplier.id, 30000, "2026-08-02");
    const variant = await createTestVariant();

    await createSupplierPurchaseReceiptAction({ purchaseId: purchase1.id, receivedAt: "2026-08-05", items: [{ productVariantId: variant.id, quantity: 5 }] });
    await createSupplierPurchaseReceiptAction({ purchaseId: purchase2.id, receivedAt: "2026-08-12", items: [{ productVariantId: variant.id, quantity: 7 }] });

    const recent = await getSupplierRecentReceipts(supplier.id);
    expect(recent).toHaveLength(2);
    expect(recent[0].receivedAt.toISOString().slice(0, 10)).toBe("2026-08-12");
    expect(recent[0].totalUnits).toBe(7);
  });
});

describe("transactional integrity", () => {
  it("rolls back an aborted multi-step transaction entirely — no half-created receipt, item, or adjustment remains", async () => {
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 40 });

    const receiptsBefore = await db.supplierPurchaseReceipt.count({ where: { purchaseId: purchase.id } });
    const adjustmentsBefore = await db.inventoryAdjustment.count({ where: { productVariantId: variant.id } });
    const stockBefore = (await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity;

    await expect(
      db.$transaction(async (tx) => {
        const receipt = await tx.supplierPurchaseReceipt.create({
          data: { purchaseId: purchase.id, receivedAt: new Date("2026-08-16"), items: { create: [{ productVariantId: variant.id, quantity: 15 }] } },
        });
        await tx.productVariant.update({ where: { id: variant.id }, data: { stockQuantity: { increment: 15 } } });
        await tx.inventoryAdjustment.create({
          data: {
            productVariantId: variant.id,
            previousQuantity: stockBefore,
            newQuantity: stockBefore + 15,
            delta: 15,
            reason: "STOCK_RECEIVED",
            supplierPurchaseReceiptId: receipt.id,
          },
        });
        throw new Error("simulated failure after receipt + inventory adjustment were created");
      }),
    ).rejects.toThrow("simulated failure");

    expect(await db.supplierPurchaseReceipt.count({ where: { purchaseId: purchase.id } })).toBe(receiptsBefore);
    expect(await db.inventoryAdjustment.count({ where: { productVariantId: variant.id } })).toBe(adjustmentsBefore);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(stockBefore);
  });
});

describe("Part 18 — the critical negative test: Purchase ≠ Inventory, Payment ≠ Inventory", () => {
  it("creating a purchase with bills, then a payment against it, changes NEITHER ProductVariant stock NOR InventoryAdjustment count — only an explicit receipt does", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const variant = await createTestVariant({ stockQuantity: 60 });

    const [productsBefore, variantsBefore, stockBefore, adjustmentsBefore] = await Promise.all([
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    // 1. Create purchase with 2 bills — no inventory movement expected.
    const purchase = await db.supplierPurchase.create({
      data: {
        supplierId: supplier.id,
        purchaseDate: new Date("2026-08-01"),
        totalInPaise: 50000,
        bills: { create: [{ billDate: new Date("2026-08-01"), amountInPaise: 30000 }, { billDate: new Date("2026-08-01"), amountInPaise: 20000 }] },
      },
    });

    expect(await db.productVariant.count()).toBe(variantsBefore);
    expect((await db.productVariant.aggregate({ _sum: { stockQuantity: true } }))._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore);

    // 2. Record a supplier payment — still no inventory movement expected.
    const paymentResult = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-03",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    expect(paymentResult.success).toBe(true);

    expect(await db.product.count()).toBe(productsBefore);
    expect(await db.productVariant.count()).toBe(variantsBefore);
    expect((await db.productVariant.aggregate({ _sum: { stockQuantity: true } }))._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore);

    // 3. Only NOW does an explicit Receive Inventory action move stock.
    const receiptResult = await createSupplierPurchaseReceiptAction({
      purchaseId: purchase.id,
      receivedAt: "2026-08-16",
      items: [{ productVariantId: variant.id, quantity: 20 }],
    });
    expect(receiptResult.success).toBe(true);

    const freshVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(freshVariant.stockQuantity).toBe(80);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore + 1);
  });
});
