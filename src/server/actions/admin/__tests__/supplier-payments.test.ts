import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as supplier-purchases.test.ts/
// counter-sale.test.ts — exercises the REAL getAdminSession()/
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

// Same reason as supplier-purchases.test.ts: outside a real Next.js
// request, `revalidatePath` throws "static generation store missing".
vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createAdminSession } from "@/lib/admin/session";
import {
  addSupplierPaymentAttachmentAction,
  createSupplierPaymentAction,
  removeSupplierPaymentAttachmentAction,
  updateSupplierPaymentDetailsAction,
} from "@/server/actions/admin/supplier-payments";
import {
  getPurchasePaymentHistory,
  getPurchasePaymentInfo,
  getSupplierPaymentDetail,
  getSupplierPaymentHistory,
  getSupplierPaymentSummary,
} from "@/server/queries/admin/supplier-payments";

const createdAdminIds: string[] = [];
const createdSupplierIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  // Supplier.purchases/.payments both use `onDelete: Restrict` (a
  // Supplier has no hard-delete path at all) — delete payments and
  // purchases before the supplier itself. PaymentAllocation/
  // SupplierPaymentAttachment cascade from SupplierPayment, so deleting
  // payments takes those with them.
  if (createdSupplierIds.length) {
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
      name: "Test Supplier Payment Admin",
      email: `test-supplier-payment-admin-${randomUUID()}@example.com`,
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
  return db.supplierPurchase.create({
    data: { supplierId, purchaseDate: new Date(purchaseDate), totalInPaise },
  });
}

describe("createSupplierPaymentAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const supplier = await createTestSupplier();
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createSupplierPaymentAction — validation", () => {
  it("rejects a zero payment amount", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 0,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects a negative payment amount", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: -50,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects a missing collectedByName", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects an unknown supplier with NOT_FOUND, writing nothing", async () => {
    await signInTestAdmin();
    const before = await db.supplierPayment.count();
    const result = await createSupplierPaymentAction({
      supplierId: `unknown-${randomUUID()}`,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
    expect(await db.supplierPayment.count()).toBe(before);
  });

  it("rejects an allocation greater than the payment amount", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects zero and negative allocation amounts", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const zero = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 0 }],
    });
    expect(zero.success).toBe(false);

    const negative = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: -10 }],
    });
    expect(negative.success).toBe(false);
  });

  it("rejects an allocation to an unknown purchase", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: `unknown-${randomUUID()}`, amountInRupees: 50 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });

  it("rejects cross-supplier allocation — Supplier A payment allocated to Supplier B's purchase", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();
    const purchaseB = await createTestPurchase(supplierB.id, 50000);

    const before = await db.supplierPayment.count({ where: { supplierId: supplierA.id } });
    const result = await createSupplierPaymentAction({
      supplierId: supplierA.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchaseB.id, amountInRupees: 100 }],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
    // Rolled back entirely — no half-created payment for supplier A.
    expect(await db.supplierPayment.count({ where: { supplierId: supplierA.id } })).toBe(before);
  });

  it("rejects an allocation exceeding the purchase's CURRENT outstanding after prior payments", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const first = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-01",
      amountInRupees: 400,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 400 }],
    });
    expect(first.success).toBe(true);

    // Only ₹100 remains outstanding (500 - 400); attempting ₹150 must fail.
    const second = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-05",
      amountInRupees: 150,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 150 }],
    });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.type).toBe("VALIDATION");
  });

  it("rejects a duplicate purchaseId across allocations in one submission", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [
        { purchaseId: purchase.id, amountInRupees: 50 },
        { purchaseId: purchase.id, amountInRupees: 50 },
      ],
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("VALIDATION");
  });
});

describe("createSupplierPaymentAction — success paths", () => {
  it("partial payment against one purchase leaves the correct outstanding", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh Kumar",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    expect(result.success).toBe(true);

    const info = await getPurchasePaymentInfo(purchase.id);
    expect(info?.paidInPaise).toBe(20000);
    expect(info?.outstandingInPaise).toBe(30000);
  });

  it("multiple payments against one purchase accumulate correctly", async () => {
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
    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-08",
      amountInRupees: 150,
      paymentMethod: "UPI",
      collectedByName: "Amit",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 150 }],
    });

    const info = await getPurchasePaymentInfo(purchase.id);
    expect(info?.paidInPaise).toBe(25000);
    expect(info?.outstandingInPaise).toBe(25000);

    const history = await getPurchasePaymentHistory(purchase.id);
    expect(history).toHaveLength(2);
  });

  it("one payment allocated across multiple purchases", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchaseA = await createTestPurchase(supplier.id, 50000, "2026-08-01");
    const purchaseB = await createTestPurchase(supplier.id, 30000, "2026-08-05");

    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 400,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [
        { purchaseId: purchaseA.id, amountInRupees: 300 },
        { purchaseId: purchaseB.id, amountInRupees: 100 },
      ],
    });
    expect(result.success).toBe(true);

    const infoA = await getPurchasePaymentInfo(purchaseA.id);
    const infoB = await getPurchasePaymentInfo(purchaseB.id);
    expect(infoA?.outstandingInPaise).toBe(20000);
    expect(infoB?.outstandingInPaise).toBe(20000);
  });

  it("the exact Part 19 worked example: two purchases, three payments", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase1 = await createTestPurchase(supplier.id, 50000, "2026-08-01");
    const purchase2 = await createTestPurchase(supplier.id, 30000, "2026-08-02");

    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-03",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase1.id, amountInRupees: 100 }],
    });
    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-04",
      amountInRupees: 200,
      paymentMethod: "UPI",
      collectedByName: "Ramesh",
      allocations: [
        { purchaseId: purchase1.id, amountInRupees: 150 },
        { purchaseId: purchase2.id, amountInRupees: 50 },
      ],
    });

    expect((await getPurchasePaymentInfo(purchase1.id))?.outstandingInPaise).toBe(25000);
    expect((await getPurchasePaymentInfo(purchase2.id))?.outstandingInPaise).toBe(25000);

    let summary = await getSupplierPaymentSummary(supplier.id);
    expect(summary.totalPurchasesInPaise).toBe(80000);
    expect(summary.totalPaidInPaise).toBe(30000);
    expect(summary.outstandingInPaise).toBe(50000);

    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-05",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [
        { purchaseId: purchase1.id, amountInRupees: 50 },
        { purchaseId: purchase2.id, amountInRupees: 50 },
      ],
    });

    expect((await getPurchasePaymentInfo(purchase1.id))?.outstandingInPaise).toBe(20000);
    expect((await getPurchasePaymentInfo(purchase2.id))?.outstandingInPaise).toBe(20000);

    summary = await getSupplierPaymentSummary(supplier.id);
    expect(summary.outstandingInPaise).toBe(40000);
  });

  it("unallocated portion of a payment is left as supplier credit, not silently allocated", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 30000);

    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 150 }],
    });
    expect(result.success).toBe(true);

    const purchaseInfo = await getPurchasePaymentInfo(purchase.id);
    expect(purchaseInfo?.outstandingInPaise).toBe(15000); // 30000 - 15000, never reduced by the unallocated ₹50

    const summary = await getSupplierPaymentSummary(supplier.id);
    expect(summary.creditInPaise).toBe(5000); // 20000 received - 15000 allocated
    expect(summary.outstandingInPaise).toBe(15000); // never netted against credit
  });

  it("collected-by name persists exactly as entered and is never replaced by the recording admin", async () => {
    const admin = await signInTestAdmin();
    const supplier = await createTestSupplier();

    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh Kumar",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const detail = await getSupplierPaymentDetail(supplier.id, result.id);
    expect(detail?.collectedByName).toBe("Ramesh Kumar");
    expect(detail?.collectedByName).not.toBe(admin.name);
    expect(detail?.createdByAdminUser?.name).toBe(admin.name);
  });

  it("persists multiple payment proof attachments and each can be removed independently", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 200,
      paymentMethod: "UPI",
      collectedByName: "Ramesh",
      attachments: [
        { url: "https://example.com/receipt-front.jpg", originalFilename: "receipt-front.jpg" },
        { url: "https://example.com/signed-receipt.jpg", originalFilename: "signed-receipt.jpg" },
        { url: "https://example.com/upi-screenshot.jpg", originalFilename: "upi-screenshot.jpg" },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const detail = await getSupplierPaymentDetail(supplier.id, result.id);
    expect(detail?.attachments).toHaveLength(3);

    const removeResult = await removeSupplierPaymentAttachmentAction({ id: detail!.attachments[0].id });
    expect(removeResult.success).toBe(true);

    const afterRemove = await getSupplierPaymentDetail(supplier.id, result.id);
    expect(afterRemove?.attachments).toHaveLength(2);
  });

  it("addSupplierPaymentAttachmentAction adds a new proof image after creation", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const addResult = await addSupplierPaymentAttachmentAction({ paymentId: result.id, url: "https://example.com/added.jpg" });
    expect(addResult.success).toBe(true);

    const detail = await getSupplierPaymentDetail(supplier.id, result.id);
    expect(detail?.attachments).toHaveLength(1);
  });
});

describe("updateSupplierPaymentDetailsAction", () => {
  it("updates date/method/collectedByName/reference/notes without touching amount or allocations", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);
    const created = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
    });
    expect(created.success).toBe(true);
    if (!created.success) return;

    const updateResult = await updateSupplierPaymentDetailsAction({
      id: created.id,
      paymentDate: "2026-08-10",
      paymentMethod: "UPI",
      collectedByName: "Suresh",
      reference: "UPI-REF-123",
    });
    expect(updateResult.success).toBe(true);

    const persisted = await db.supplierPayment.findUniqueOrThrow({ where: { id: created.id } });
    expect(persisted.collectedByName).toBe("Suresh");
    expect(persisted.paymentMethod).toBe("UPI");
    expect(persisted.amountInPaise).toBe(20000); // unchanged

    const info = await getPurchasePaymentInfo(purchase.id);
    expect(info?.paidInPaise).toBe(20000); // allocation unaffected by the edit
  });
});

describe("query layer — history and pagination", () => {
  it("getSupplierPaymentHistory orders newest-first and reports allocated/unallocated per payment", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 100000);

    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-01",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 80 }],
    });
    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-10",
      amountInRupees: 50,
      paymentMethod: "UPI",
      collectedByName: "Ramesh",
    });

    const history = await getSupplierPaymentHistory({ supplierId: supplier.id, page: 1 });
    expect(history.totalCount).toBe(2);
    expect(history.payments[0].paymentDate.toISOString().slice(0, 10)).toBe("2026-08-10");
    expect(history.payments[0].unallocatedInPaise).toBe(5000);
    expect(history.payments[1].allocatedInPaise).toBe(8000);
    expect(history.payments[1].unallocatedInPaise).toBe(2000);
  });

  it("getSupplierPaymentDetail returns null when the payment belongs to a different supplier", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();
    const result = await createSupplierPaymentAction({
      supplierId: supplierA.id,
      paymentDate: "2026-08-16",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(await getSupplierPaymentDetail(supplierA.id, result.id)).not.toBeNull();
    expect(await getSupplierPaymentDetail(supplierB.id, result.id)).toBeNull();
  });
});

describe("transactional integrity", () => {
  it("rolls back an aborted multi-step transaction entirely — no half-created payment remains", async () => {
    const supplier = await createTestSupplier();
    const before = await db.supplierPayment.count({ where: { supplierId: supplier.id } });

    await expect(
      db.$transaction(async (tx) => {
        await tx.supplierPayment.create({
          data: {
            supplierId: supplier.id,
            paymentDate: new Date("2026-08-16"),
            amountInPaise: 10000,
            paymentMethod: "CASH",
            collectedByName: "Ramesh",
          },
        });
        throw new Error("simulated failure after the payment row was created");
      }),
    ).rejects.toThrow("simulated failure");

    expect(await db.supplierPayment.count({ where: { supplierId: supplier.id } })).toBe(before);
  });
});

describe("inventory isolation — Part 3's central invariant", () => {
  it("recording a supplier payment with allocations and proof does not change any Product/ProductVariant/InventoryAdjustment row", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000);

    const [productsBefore, variantsBefore, stockBefore, adjustmentsBefore] = await Promise.all([
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    const result = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-16",
      amountInRupees: 200,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 200 }],
      attachments: [{ url: "https://example.com/receipt.jpg" }],
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
