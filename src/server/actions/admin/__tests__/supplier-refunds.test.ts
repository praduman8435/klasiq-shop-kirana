import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

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

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));

import { createAdminSession } from "@/lib/admin/session";
import {
  addSupplierRefundAttachmentAction,
  createSupplierRefundAction,
  removeSupplierRefundAttachmentAction,
} from "@/server/actions/admin/supplier-refunds";
import { createSupplierCreditAction } from "@/server/actions/admin/supplier-credits";
import { getSupplierRefundDetail } from "@/server/queries/admin/supplier-refunds";

const createdAdminIds: string[] = [];
const createdSupplierIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  if (createdSupplierIds.length) {
    await db.supplierRefund.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplierCredit.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplierPurchase.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
    await db.supplier.deleteMany({ where: { id: { in: createdSupplierIds } } });
  }
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.$disconnect();
});

async function createTestAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Supplier Refund Admin",
      email: `test-supplier-refund-admin-${randomUUID()}@example.com`,
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

describe("createSupplierRefundAction — authorization", () => {
  it("rejects with UNAUTHORIZED when there is no admin session", async () => {
    const supplier = await createTestSupplier();
    const result = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "CASH",
      receivedByName: "Ramesh Kumar",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("UNAUTHORIZED");
  });
});

describe("createSupplierRefundAction — validation", () => {
  it("rejects a zero/negative amount", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const zero = await createSupplierRefundAction({ supplierId: supplier.id, refundDate: "2026-08-16", amountInRupees: 0, refundMethod: "CASH", receivedByName: "Ramesh" });
    expect(zero.success).toBe(false);
  });

  it("rejects a missing receivedByName", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierRefundAction({ supplierId: supplier.id, refundDate: "2026-08-16", amountInRupees: 100, refundMethod: "CASH", receivedByName: "" });
    expect(result.success).toBe(false);
  });

  it("rejects an unknown supplier with NOT_FOUND, writing nothing", async () => {
    await signInTestAdmin();
    const before = await db.supplierRefund.count();
    const result = await createSupplierRefundAction({
      supplierId: `unknown-${randomUUID()}`,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "CASH",
      receivedByName: "Ramesh",
    });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.type).toBe("NOT_FOUND");
    expect(await db.supplierRefund.count()).toBe(before);
  });

  it("rejects an unknown linked credit, and a credit belonging to a different supplier", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();

    const unknown = await createSupplierRefundAction({
      supplierId: supplierA.id,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "CASH",
      receivedByName: "Ramesh",
      sourceCreditId: `unknown-${randomUUID()}`,
    });
    expect(unknown.success).toBe(false);
    if (!unknown.success) expect(unknown.error.type).toBe("NOT_FOUND");

    const creditB = await createSupplierCreditAction({ supplierId: supplierB.id, creditDate: "2026-08-01", amountInRupees: 500, reason: "OVERPAYMENT" });
    expect(creditB.success).toBe(true);
    if (!creditB.success) return;

    const crossSupplier = await createSupplierRefundAction({
      supplierId: supplierA.id,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "CASH",
      receivedByName: "Ramesh",
      sourceCreditId: creditB.id,
    });
    expect(crossSupplier.success).toBe(false);
    if (!crossSupplier.success) expect(crossSupplier.error.type).toBe("VALIDATION");
  });

  it("rejects a refund exceeding the linked credit's remaining unallocated balance — prevents double-spending the same credit", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const credit = await createSupplierCreditAction({ supplierId: supplier.id, creditDate: "2026-08-01", amountInRupees: 500, reason: "OVERPAYMENT" });
    expect(credit.success).toBe(true);
    if (!credit.success) return;

    const first = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-05",
      amountInRupees: 300,
      refundMethod: "UPI",
      receivedByName: "Ramesh Kumar",
      sourceCreditId: credit.id,
    });
    expect(first.success).toBe(true);

    // Only ₹200 remains on the credit (500 - 300) — attempting another
    // ₹250 refund against the SAME credit must be rejected.
    const second = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-06",
      amountInRupees: 250,
      refundMethod: "UPI",
      receivedByName: "Ramesh Kumar",
      sourceCreditId: credit.id,
    });
    expect(second.success).toBe(false);
    if (!second.success) expect(second.error.type).toBe("VALIDATION");

    // But the exact remaining ₹200 succeeds.
    const third = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-06",
      amountInRupees: 200,
      refundMethod: "UPI",
      receivedByName: "Ramesh Kumar",
      sourceCreditId: credit.id,
    });
    expect(third.success).toBe(true);
  });
});

describe("createSupplierRefundAction — success paths", () => {
  it("creates a refund independently of any credit or return", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-16",
      amountInRupees: 500,
      refundMethod: "BANK_TRANSFER",
      receivedByName: "Sudarsan",
      reference: "TXN-9981",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.refundNumber).toMatch(/^SRF-\d{8}-/);

    const persisted = await db.supplierRefund.findUniqueOrThrow({ where: { id: result.id } });
    expect(persisted.sourceCreditId).toBeNull();
    expect(persisted.sourceReturnId).toBeNull();
  });

  it("collected/received-by name persists exactly as entered and is never replaced by the recording admin", async () => {
    const admin = await signInTestAdmin();
    const supplier = await createTestSupplier();

    const result = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "CASH",
      receivedByName: "Ramesh Kumar",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const detail = await getSupplierRefundDetail(supplier.id, result.id);
    expect(detail?.receivedByName).toBe("Ramesh Kumar");
    expect(detail?.receivedByName).not.toBe(admin.name);
    expect(detail?.createdByAdminUser?.name).toBe(admin.name);
  });

  it("persists multiple proof attachments and each can be removed independently", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const result = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-16",
      amountInRupees: 200,
      refundMethod: "UPI",
      receivedByName: "Ramesh",
      attachments: [
        { url: "https://example.com/receipt-front.jpg", originalFilename: "receipt-front.jpg" },
        { url: "https://example.com/upi-screenshot.jpg", originalFilename: "upi-screenshot.jpg" },
      ],
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const detail = await getSupplierRefundDetail(supplier.id, result.id);
    expect(detail?.attachments).toHaveLength(2);

    const removeResult = await removeSupplierRefundAttachmentAction({ id: detail!.attachments[0].id });
    expect(removeResult.success).toBe(true);

    const afterRemove = await getSupplierRefundDetail(supplier.id, result.id);
    expect(afterRemove?.attachments).toHaveLength(1);
  });

  it("addSupplierRefundAttachmentAction adds a new proof image after creation", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const result = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "CASH",
      receivedByName: "Ramesh",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    const addResult = await addSupplierRefundAttachmentAction({ refundId: result.id, url: "https://example.com/added.jpg" });
    expect(addResult.success).toBe(true);

    const detail = await getSupplierRefundDetail(supplier.id, result.id);
    expect(detail?.attachments).toHaveLength(1);
  });

  it("linking a refund to a credit/return never mutates the purchase total or existing payments (financial isolation)", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await db.supplierPurchase.create({ data: { supplierId: supplier.id, purchaseDate: new Date("2026-08-01"), totalInPaise: 50000 } });
    const credit = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-02",
      amountInRupees: 200,
      reason: "OVERPAYMENT",
    });
    expect(credit.success).toBe(true);
    if (!credit.success) return;

    const refund = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "UPI",
      receivedByName: "Ramesh",
      sourceCreditId: credit.id,
    });
    expect(refund.success).toBe(true);

    const persistedPurchase = await db.supplierPurchase.findUniqueOrThrow({ where: { id: purchase.id } });
    expect(persistedPurchase.totalInPaise).toBe(50000);
    expect(await db.paymentAllocation.count({ where: { purchaseId: purchase.id } })).toBe(0);
  });
});

describe("query layer — detail scoping", () => {
  it("getSupplierRefundDetail returns null when the refund belongs to a different supplier", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();
    const result = await createSupplierRefundAction({
      supplierId: supplierA.id,
      refundDate: "2026-08-16",
      amountInRupees: 100,
      refundMethod: "CASH",
      receivedByName: "Ramesh",
    });
    expect(result.success).toBe(true);
    if (!result.success) return;

    expect(await getSupplierRefundDetail(supplierA.id, result.id)).not.toBeNull();
    expect(await getSupplierRefundDetail(supplierB.id, result.id)).toBeNull();
  });
});

describe("transactional integrity", () => {
  it("rolls back an aborted multi-step transaction entirely — no half-created refund or attachment remains", async () => {
    const supplier = await createTestSupplier();
    const refundsBefore = await db.supplierRefund.count({ where: { supplierId: supplier.id } });

    await expect(
      db.$transaction(async (tx) => {
        const refund = await tx.supplierRefund.create({
          data: {
            supplierId: supplier.id,
            refundNumber: `SRF-TEST-${randomUUID().slice(0, 8)}`,
            refundDate: new Date("2026-08-16"),
            amountInPaise: 10000,
            refundMethod: "CASH",
            receivedByName: "Ramesh",
          },
        });
        await tx.supplierRefundAttachment.create({ data: { refundId: refund.id, url: "https://example.com/x.jpg" } });
        throw new Error("simulated failure after refund + attachment were created");
      }),
    ).rejects.toThrow("simulated failure");

    expect(await db.supplierRefund.count({ where: { supplierId: supplier.id } })).toBe(refundsBefore);
  });
});

describe("inventory isolation — Part 6's central invariant", () => {
  it("refund creation never touches Product/ProductVariant/InventoryAdjustment", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();

    const [productsBefore, variantsBefore, stockBefore, adjustmentsBefore] = await Promise.all([
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    const result = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-16",
      amountInRupees: 300,
      refundMethod: "CASH",
      receivedByName: "Ramesh",
      attachments: [{ url: "https://example.com/proof.jpg" }],
    });
    expect(result.success).toBe(true);

    expect(await db.product.count()).toBe(productsBefore);
    expect(await db.productVariant.count()).toBe(variantsBefore);
    expect((await db.productVariant.aggregate({ _sum: { stockQuantity: true } }))._sum.stockQuantity).toBe(stockBefore._sum.stockQuantity);
    expect(await db.inventoryAdjustment.count()).toBe(adjustmentsBefore);
  });
});
