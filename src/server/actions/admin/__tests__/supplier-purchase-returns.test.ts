import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as every other Phase 4 action
// test file — exercises the REAL getAdminSession()/createAdminSession(),
// not a stubbed session object.
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
import { createSupplierPurchaseReturnAction } from "@/server/actions/admin/supplier-purchase-returns";
import { createSupplierPurchaseReceiptAction } from "@/server/actions/admin/supplier-purchase-receipts";
import { createSupplierPaymentAction } from "@/server/actions/admin/supplier-payments";
import {
  getPurchaseReturnHistory,
  getPurchaseReturnSummary,
  getReturnableVariantsForPurchase,
  getSupplierPurchaseReturnDetail,
  getSupplierRecentReturns,
} from "@/server/queries/admin/supplier-purchase-returns";
import { getPurchasePaymentInfo } from "@/server/queries/admin/supplier-payments";

const createdAdminIds: string[] = [];
const createdSupplierIds: string[] = [];
const createdProductIds: string[] = [];
const createdCategoryIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  // Supplier.purchases/.payments both use `onDelete: Restrict`, and so
  // does SupplierPurchaseReturn.purchaseId — returns, receipts, and
  // payments must all go before purchases, purchases before the
  // supplier. Deleting a Product cascades its ProductVariants, which
  // cascades their InventoryAdjustment rows.
  if (createdSupplierIds.length) {
    await db.supplierPurchaseReturn.deleteMany({ where: { purchase: { supplierId: { in: createdSupplierIds } } } });
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
      name: "Test Supplier Return Admin",
      email: `test-supplier-return-admin-${randomUUID()}@example.com`,
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
  const category = await db.category.create({ data: { slug: `test-supreturn-cat-${suffix}`, name: `Test Return Category ${suffix}` } });
  createdCategoryIds.push(category.id);
  const product = await db.product.create({ data: { slug: `test-supreturn-product-${suffix}`, name: `Test Return Product ${suffix}`, categoryId: category.id } });
  createdProductIds.push(product.id);
  return db.productVariant.create({
    data: {
      productId: product.id,
      size: "M",
      sku: `TEST-SUPRETURN-SKU-${suffix}`,
      priceInPaise: 50000,
      stockQuantity: overrides.stockQuantity ?? 0,
    },
  });
}

/** Receives `quantity` of `variantId` against `purchaseId` via the REAL
 *  Part 4 action — not a direct db insert — so the variant's actual
 *  stock genuinely increases too (return validation checks live stock,
 *  not just the receipt-item ledger). */
async function receive(purchaseId: string, variantId: string, quantity: number) {
  const result = await createSupplierPurchaseReceiptAction({
    purchaseId,
    receivedAt: "2026-08-05",
    items: [{ productVariantId: variantId, quantity }],
  });
  expect(result.success).toBe(true);
  return result;
}

function idempotencyKey() {
  return `test-${randomUUID()}`;
}

describe("createSupplierPurchaseReturnAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant();
    const result = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createSupplierPurchaseReturnAction — validation", () => {
  it("rejects an unknown purchase with NOT_FOUND, writing nothing", async () => {
    await signInTestAdmin();
    const variant = await createTestVariant();
    const before = await db.supplierPurchaseReturn.count();
    const result = await createSupplierPurchaseReturnAction({
      purchaseId: `unknown-${randomUUID()}`,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
    expect(await db.supplierPurchaseReturn.count()).toBe(before);
  });

  it("rejects an unknown/invalid variant, writing nothing", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const result = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: `unknown-${randomUUID()}`, quantity: 5 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
    expect(await db.supplierPurchaseReturn.count({ where: { purchaseId: purchase.id } })).toBe(0);
  });

  it("rejects a zero item list and a zero/negative quantity", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 20 });
    await receive(purchase.id, variant.id, 20);

    const empty = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [],
    });
    expect(empty.success).toBe(false);

    const zero = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 0 }],
    });
    expect(zero.success).toBe(false);
  });

  it("rejects a duplicate variant within one return", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 20 });
    await receive(purchase.id, variant.id, 20);

    const result = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [
        { productVariantId: variant.id, quantity: 3 },
        { productVariantId: variant.id, quantity: 2 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects returning more than received: Received 20, Returned 5, Attempt 16 → reject", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 20 });
    await receive(purchase.id, variant.id, 20);

    const first = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-10",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    expect(first.success).toBe(true);

    // Returnable is now 20 - 5 = 15; attempting 16 must fail.
    const second = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 16 }],
    });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.type).toBe("VALIDATION");
  });

  it("rejects returning more than current stock even when returnable allows it: Received 20, Returned 5, Stock 8, Attempt 10 → reject", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 20 });
    await receive(purchase.id, variant.id, 20);

    await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-10",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    // Stock is now 20 - 5 = 15. Manually sell/consume down to 8 to
    // simulate "current stock is lower than returnable" without
    // involving the customer-order machinery.
    await db.productVariant.update({ where: { id: variant.id }, data: { stockQuantity: 8 } });

    // Returnable is 15 (20 received - 5 returned), but only 8 in stock —
    // attempting 10 must fail even though 10 <= returnable.
    const result = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 10 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");

    // And confirm 8 succeeds (Part 17's own worked example).
    const success = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 8 }],
    });
    expect(success.success).toBe(true);

    const fresh = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(fresh.stockQuantity).toBe(0);

    // Final: Received 20, Returned 13 (5+8), Returnable 7.
    const variants = await getReturnableVariantsForPurchase(purchase.id);
    const info = variants.find((v) => v.productVariantId === variant.id)!;
    expect(info.receivedQuantity).toBe(20);
    expect(info.alreadyReturnedQuantity).toBe(13);
    expect(info.returnableQuantity).toBe(7);
  });
});

describe("createSupplierPurchaseReturnAction — idempotency (Part 11/22)", () => {
  it("a repeat submission with the same idempotencyKey returns the same return and does not reduce stock twice", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 20 });
    await receive(purchase.id, variant.id, 20);
    const key = idempotencyKey();

    const first = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: key,
      items: [{ productVariantId: variant.id, quantity: 10 }],
    });
    expect(first.success).toBe(true);
    if (!first.success) return;

    const stockAfterFirst = (await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity;
    expect(stockAfterFirst).toBe(30); // 20 initial + 20 received - 10 returned

    const second = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: key,
      items: [{ productVariantId: variant.id, quantity: 10 }],
    });
    expect(second.success).toBe(true);
    if (!second.success) return;
    expect(second.id).toBe(first.id);

    const stockAfterSecond = (await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity;
    expect(stockAfterSecond).toBe(30); // unchanged — not reduced again
    expect(await db.supplierPurchaseReturn.count({ where: { purchaseId: purchase.id } })).toBe(1);
  });
});

describe("createSupplierPurchaseReturnAction — success paths", () => {
  it("creates a return with multiple items and reduces each variant's stock with a linked InventoryAdjustment", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variantA = await createTestVariant({ stockQuantity: 0 });
    const variantB = await createTestVariant({ stockQuantity: 0 });
    await receive(purchase.id, variantA.id, 20);
    await receive(purchase.id, variantB.id, 30);

    const result = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      reference: "Truck #4",
      idempotencyKey: idempotencyKey(),
      items: [
        { productVariantId: variantA.id, quantity: 5 },
        { productVariantId: variantB.id, quantity: 3 },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.returnNumber).toMatch(/^RSUP-\d{8}-/);

    const freshA = await db.productVariant.findUniqueOrThrow({ where: { id: variantA.id } });
    const freshB = await db.productVariant.findUniqueOrThrow({ where: { id: variantB.id } });
    expect(freshA.stockQuantity).toBe(15);
    expect(freshB.stockQuantity).toBe(27);

    const adjustments = await db.inventoryAdjustment.findMany({ where: { supplierPurchaseReturnId: result.id } });
    expect(adjustments).toHaveLength(2);
    expect(adjustments.every((a) => a.reason === "SUPPLIER_RETURN")).toBe(true);
    const adjA = adjustments.find((a) => a.productVariantId === variantA.id)!;
    expect(adjA.delta).toBe(-5);
    expect(adjA.previousQuantity).toBe(20);
    expect(adjA.newQuantity).toBe(15);
  });

  it("supports multiple returns against one purchase — cumulative returned quantity (Part 18)", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 0 });
    await receive(purchase.id, variant.id, 100);

    await createSupplierPurchaseReturnAction({ purchaseId: purchase.id, returnDate: "2026-08-01", reason: "DAMAGED", idempotencyKey: idempotencyKey(), items: [{ productVariantId: variant.id, quantity: 20 }] });
    await createSupplierPurchaseReturnAction({ purchaseId: purchase.id, returnDate: "2026-08-05", reason: "DEFECTIVE", idempotencyKey: idempotencyKey(), items: [{ productVariantId: variant.id, quantity: 30 }] });
    await createSupplierPurchaseReturnAction({ purchaseId: purchase.id, returnDate: "2026-08-10", reason: "WRONG_ITEM", idempotencyKey: idempotencyKey(), items: [{ productVariantId: variant.id, quantity: 10 }] });

    const fresh = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(fresh.stockQuantity).toBe(40); // 100 - 60

    const variants = await getReturnableVariantsForPurchase(purchase.id);
    const info = variants.find((v) => v.productVariantId === variant.id)!;
    expect(info.receivedQuantity).toBe(100);
    expect(info.alreadyReturnedQuantity).toBe(60);
    expect(info.returnableQuantity).toBe(40);

    const summary = await getPurchaseReturnSummary(purchase.id);
    expect(summary.totalReturnedUnits).toBe(60);
    expect(summary.returnCount).toBe(3);

    const history = await getPurchaseReturnHistory(purchase.id);
    expect(history).toHaveLength(3);
    expect(history[0].returnDate.toISOString().slice(0, 10)).toBe("2026-08-10"); // newest first
  });

  it("does not change purchase total or payment/outstanding figures (Part 15)", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 0 });
    await receive(purchase.id, variant.id, 20);

    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-02",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    const paymentInfoBefore = await getPurchasePaymentInfo(purchase.id);

    const result = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    expect(result.success).toBe(true);

    const persistedPurchase = await db.supplierPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(persistedPurchase.totalInPaise).toBe(50000); // unchanged

    const paymentInfoAfter = await getPurchasePaymentInfo(purchase.id);
    expect(paymentInfoAfter?.paidInPaise).toBe(paymentInfoBefore?.paidInPaise);
    expect(paymentInfoAfter?.outstandingInPaise).toBe(paymentInfoBefore?.outstandingInPaise);

    // And the payment record itself is untouched.
    const payments = await db.supplierPayment.findMany({ where: { supplierId: supplier.id } });
    expect(payments).toHaveLength(1);
    expect(payments[0].amountInPaise).toBe(20000);
  });
});

describe("query layer — history, detail scoping, and isolation", () => {
  it("getSupplierPurchaseReturnDetail returns null when the return belongs to a different purchase", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchaseA = await createTestPurchase(supplier.id, 50000);
    const purchaseB = await createTestPurchase(supplier.id, 30000);
    const variant = await createTestVariant({ stockQuantity: 0 });
    await receive(purchaseA.id, variant.id, 20);

    const result = await createSupplierPurchaseReturnAction({
      purchaseId: purchaseA.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(await getSupplierPurchaseReturnDetail(purchaseA.id, result.id)).not.toBeNull();
    expect(await getSupplierPurchaseReturnDetail(purchaseB.id, result.id)).toBeNull();
  });

  it("getSupplierRecentReturns reports returns across every purchase for a supplier, newest first", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase1 = await createTestPurchase(supplier.id, 50000, "2026-08-01");
    const purchase2 = await createTestPurchase(supplier.id, 30000, "2026-08-02");
    const variant = await createTestVariant({ stockQuantity: 0 });
    await receive(purchase1.id, variant.id, 20);
    await receive(purchase2.id, variant.id, 20);

    await createSupplierPurchaseReturnAction({ purchaseId: purchase1.id, returnDate: "2026-08-05", reason: "DAMAGED", idempotencyKey: idempotencyKey(), items: [{ productVariantId: variant.id, quantity: 5 }] });
    await createSupplierPurchaseReturnAction({ purchaseId: purchase2.id, returnDate: "2026-08-12", reason: "DEFECTIVE", idempotencyKey: idempotencyKey(), items: [{ productVariantId: variant.id, quantity: 7 }] });

    const recent = await getSupplierRecentReturns(supplier.id);
    expect(recent).toHaveLength(2);
    expect(recent[0].returnDate.toISOString().slice(0, 10)).toBe("2026-08-12");
    expect(recent[0].totalUnits).toBe(7);
  });

  it("existing customer ReturnRequest data is completely unaffected by supplier returns (Part 20 isolation)", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 0 });
    await receive(purchase.id, variant.id, 20);

    const customerReturnsBefore = await db.returnRequest.count();

    await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });

    expect(await db.returnRequest.count()).toBe(customerReturnsBefore);
  });
});

describe("transactional integrity", () => {
  it("rolls back an aborted multi-step transaction entirely — no half-created return, item, or adjustment remains", async () => {
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const variant = await createTestVariant({ stockQuantity: 40 });

    const returnsBefore = await db.supplierPurchaseReturn.count({ where: { purchaseId: purchase.id } });
    const adjustmentsBefore = await db.inventoryAdjustment.count({ where: { productVariantId: variant.id } });
    const stockBefore = (await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity;

    await expect(
      db.$transaction(async (tx) => {
        const supplierReturn = await tx.supplierPurchaseReturn.create({
          data: {
            purchaseId: purchase.id,
            returnNumber: `RSUP-TEST-${randomUUID().slice(0, 8)}`,
            returnDate: new Date("2026-08-16"),
            reason: "DAMAGED",
            items: { create: [{ productVariantId: variant.id, quantity: 15 }] },
          },
        });
        await tx.productVariant.update({ where: { id: variant.id }, data: { stockQuantity: { decrement: 15 } } });
        await tx.inventoryAdjustment.create({
          data: {
            productVariantId: variant.id,
            previousQuantity: stockBefore,
            newQuantity: stockBefore - 15,
            delta: -15,
            reason: "SUPPLIER_RETURN",
            supplierPurchaseReturnId: supplierReturn.id,
          },
        });
        throw new Error("simulated failure after return + inventory adjustment were created");
      }),
    ).rejects.toThrow("simulated failure");

    expect(await db.supplierPurchaseReturn.count({ where: { purchaseId: purchase.id } })).toBe(returnsBefore);
    expect(await db.inventoryAdjustment.count({ where: { productVariantId: variant.id } })).toBe(adjustmentsBefore);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(stockBefore);
  });
});

describe("Part 22 — critical negative tests: only a confirmed return ever reduces inventory", () => {
  it("purchase creation, payment creation, and an invalid/failed return attempt all leave inventory completely unchanged", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const variant = await createTestVariant({ stockQuantity: 50 });

    const [productsBefore, variantsBefore, stockBefore, adjustmentsBefore] = await Promise.all([
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    // 1. Purchase creation — no inventory movement.
    const purchase = await db.supplierPurchase.create({ data: { supplierId: supplier.id, purchaseDate: new Date("2026-08-01"), totalInPaise: 50000 } });
    expect((await db.productVariant.aggregate({ _sum: { stockQuantity: true } }))._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore);

    // 2. Payment creation — no inventory movement.
    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-02",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
    });
    expect((await db.productVariant.aggregate({ _sum: { stockQuantity: true } }))._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore);

    // 3. An invalid return attempt (nothing has been received yet, so
    //    returnable quantity is 0) — must be rejected, no movement.
    const invalidAttempt = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-10",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    expect(invalidAttempt.success).toBe(false);
    expect((await db.productVariant.aggregate({ _sum: { stockQuantity: true } }))._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore);

    // 4. Receive, THEN a valid confirmed return — only now does
    //    inventory actually move.
    await receive(purchase.id, variant.id, 20);
    const validReturn = await createSupplierPurchaseReturnAction({
      purchaseId: purchase.id,
      returnDate: "2026-08-16",
      reason: "DAMAGED",
      idempotencyKey: idempotencyKey(),
      items: [{ productVariantId: variant.id, quantity: 5 }],
    });
    expect(validReturn.success).toBe(true);

    // productsBefore/variantsBefore were captured AFTER createTestVariant()
    // already created its product/variant, so no further creation is
    // expected here — only the stock quantity should have moved.
    expect(await db.product.count()).toBe(productsBefore);
    expect(await db.productVariant.count()).toBe(variantsBefore);
    const freshVariant = await db.productVariant.findUniqueOrThrow({ where: { id: variant.id } });
    expect(freshVariant.stockQuantity).toBe(65); // 50 + 20 received - 5 returned
  });
});
