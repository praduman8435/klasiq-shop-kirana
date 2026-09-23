import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as every other Phase 4 action
// test file — the ledger itself is read-only, but building realistic
// test data still goes through the real create actions.
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
import { createSupplierPaymentAction } from "@/server/actions/admin/supplier-payments";
import { createSupplierCreditAction } from "@/server/actions/admin/supplier-credits";
import { createSupplierRefundAction } from "@/server/actions/admin/supplier-refunds";
import { getPurchasePaymentInfo, getSupplierPaymentSummary } from "@/server/queries/admin/supplier-payments";
import { getSupplierLedger, getSupplierLedgerOpeningBalance, getSupplierLedgerSummary } from "@/server/queries/admin/supplier-ledger";

const createdAdminIds: string[] = [];
const createdSupplierIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  if (createdSupplierIds.length) {
    await db.supplierRefund.deleteMany({ where: { supplierId: { in: createdSupplierIds } } });
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
    data: { name: "Test Ledger Admin", email: `test-ledger-admin-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
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

async function createTestPurchase(supplierId: string, totalInPaise: number, purchaseDate: string) {
  return db.supplierPurchase.create({ data: { supplierId, purchaseDate: new Date(purchaseDate), totalInPaise } });
}

describe("getSupplierLedger — the Part 29 worked scenario", () => {
  it("produces the exact chronological events and reconciles with Supplier Detail's own outstanding calculation", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchaseA = await createTestPurchase(supplier.id, 50000, "2026-08-01");
    const purchaseB = await createTestPurchase(supplier.id, 30000, "2026-08-02");

    const payment1 = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-03",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchaseA.id, amountInRupees: 100 }],
    });
    expect(payment1.success).toBe(true);

    const payment2 = await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-04",
      amountInRupees: 200,
      paymentMethod: "UPI",
      collectedByName: "Ramesh",
      allocations: [
        { purchaseId: purchaseA.id, amountInRupees: 150 },
        { purchaseId: purchaseB.id, amountInRupees: 50 },
      ],
    });
    expect(payment2.success).toBe(true);

    const credit = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-05",
      amountInRupees: 100,
      reason: "OVERPAYMENT",
      allocations: [
        { purchaseId: purchaseA.id, amountInRupees: 70 },
        { purchaseId: purchaseB.id, amountInRupees: 30 },
      ],
    });
    expect(credit.success).toBe(true);

    const refund = await createSupplierRefundAction({
      supplierId: supplier.id,
      refundDate: "2026-08-06",
      amountInRupees: 40,
      refundMethod: "UPI",
      receivedByName: "Sudarsan",
    });
    expect(refund.success).toBe(true);

    // Part 29's exact worked numbers.
    const infoA = await getPurchasePaymentInfo(purchaseA.id);
    const infoB = await getPurchasePaymentInfo(purchaseB.id);
    expect(infoA?.outstandingInPaise).toBe(18000); // 50000 - 25000 payments - 7000 credit
    expect(infoB?.outstandingInPaise).toBe(22000); // 30000 - 5000 payment - 3000 credit

    const paymentSummary = await getSupplierPaymentSummary(supplier.id);
    // Payments-only sub-total, before credits are netted in (used for the
    // separate "Total Paid" line on Supplier Detail).
    expect(paymentSummary.totalPurchasesInPaise - paymentSummary.totalPaidInPaise).toBe(50000); // 80000 - 30000
    // getSupplierPaymentSummary itself nets out credits too (Part 7 fix —
    // see that function's own doc comment): 80000 - 30000 payments -
    // 10000 credits = 40000, the exact figure Supplier Detail's own
    // "Outstanding" stat shows and matching Purchase A + Purchase B
    // outstanding (18000 + 22000).
    expect(paymentSummary.creditsAppliedInPaise).toBe(10000);
    expect(paymentSummary.outstandingInPaise).toBe(40000);

    const ledgerSummary = await getSupplierLedgerSummary(supplier.id);
    // The ledger's own reconciling figure matches Supplier Detail exactly
    // (Section 17) — both net out credits the same way.
    expect(ledgerSummary.purchaseOutstandingInPaise).toBe(40000);
    expect(ledgerSummary.purchaseOutstandingInPaise).toBe(paymentSummary.outstandingInPaise);
    expect(ledgerSummary.purchaseOutstandingInPaise).toBe((infoA?.outstandingInPaise ?? 0) + (infoB?.outstandingInPaise ?? 0));
    expect(ledgerSummary.totalRefundsInPaise).toBe(4000);

    // Chronological order: Purchase A, Purchase B, Payment 1, Payment 2, Credit, Refund.
    const ledger = await getSupplierLedger({ supplierId: supplier.id });
    expect(ledger.events).toHaveLength(6);
    const types = ledger.events.map((e) => e.type);
    expect(types).toEqual(["PURCHASE", "PURCHASE", "PAYMENT", "PAYMENT", "CREDIT", "REFUND"]);

    // Running balance walks: 50000 -> 80000 (purchase B) -> 79900... wait
    // payments are in FULL amount (not allocated-only) per this phase's
    // own accounting semantics (Section 2/6) — verify the exact numbers.
    const balances = ledger.events.map((e) => e.balanceInPaise);
    expect(balances[0]).toBe(50000); // + Purchase A
    expect(balances[1]).toBe(80000); // + Purchase B
    expect(balances[2]).toBe(70000); // - Payment 1 (10000)
    expect(balances[3]).toBe(50000); // - Payment 2 (20000)
    expect(balances[4]).toBe(40000); // - Credit (10000)
    expect(balances[5]).toBe(36000); // - Refund (4000)

    // Closing balance (net account position) DIFFERS from purchase
    // outstanding by exactly the refund amount — Section 17's own
    // "explicitly distinguish, do not hide the difference" requirement.
    expect(ledger.closingBalanceInPaise).toBe(36000);
    expect(ledger.closingBalanceInPaise).toBe(ledgerSummary.purchaseOutstandingInPaise - 4000);
  });
});

describe("getSupplierLedger — same-day deterministic ordering", () => {
  it("orders same-day events Purchase, Payment, Credit, Refund, then by creation time", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    await createTestPurchase(supplier.id, 100000, "2026-08-10");

    // All recorded on the SAME calendar day, in a deliberately
    // scrambled creation order, to prove the sort is by type priority
    // and NOT database insertion order.
    await createSupplierRefundAction({ supplierId: supplier.id, refundDate: "2026-08-10", amountInRupees: 10, refundMethod: "CASH", receivedByName: "A" });
    await createSupplierCreditAction({ supplierId: supplier.id, creditDate: "2026-08-10", amountInRupees: 10, reason: "OTHER" });
    await createSupplierPaymentAction({ supplierId: supplier.id, paymentDate: "2026-08-10", amountInRupees: 10, paymentMethod: "CASH", collectedByName: "B" });

    const ledger = await getSupplierLedger({ supplierId: supplier.id });
    const sameDayTypes = ledger.events.map((e) => e.type);
    expect(sameDayTypes).toEqual(["PURCHASE", "PAYMENT", "CREDIT", "REFUND"]);
  });
});

describe("getSupplierLedger — date filtering and opening balance", () => {
  it("computes an opening balance from events strictly before `from`, and only lists events within [from, to]", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    await createTestPurchase(supplier.id, 50000, "2026-07-01"); // before the window
    await createTestPurchase(supplier.id, 20000, "2026-08-05"); // inside the window

    const from = new Date("2026-08-01T00:00:00");
    const to = new Date("2026-08-31T23:59:59.999");

    const opening = await getSupplierLedgerOpeningBalance(supplier.id, from);
    expect(opening).toBe(50000);

    const ledger = await getSupplierLedger({ supplierId: supplier.id, from, to });
    expect(ledger.openingBalanceInPaise).toBe(50000);
    expect(ledger.events).toHaveLength(1);
    expect(ledger.events[0].balanceInPaise).toBe(70000); // 50000 opening + 20000 in-range purchase
  });
});

describe("getSupplierLedger — type filter and search", () => {
  it("filters to a single event type, and search matches by generated number/reference", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    await createTestPurchase(supplier.id, 50000, "2026-08-01");
    const creditResult = await createSupplierCreditAction({
      supplierId: supplier.id,
      creditDate: "2026-08-05",
      amountInRupees: 100,
      reason: "OTHER",
      reference: "UNIQUE-REF-XYZ",
    });
    expect(creditResult.success).toBe(true);

    const creditsOnly = await getSupplierLedger({ supplierId: supplier.id, types: ["CREDIT"] });
    expect(creditsOnly.events).toHaveLength(1);
    expect(creditsOnly.events[0].type).toBe("CREDIT");

    const bySearch = await getSupplierLedger({ supplierId: supplier.id, query: "unique-ref-xyz" });
    expect(bySearch.events).toHaveLength(1);
    expect(bySearch.events[0].type).toBe("CREDIT");

    const noMatch = await getSupplierLedger({ supplierId: supplier.id, query: "nothing-matches-this" });
    expect(noMatch.events).toHaveLength(0);
    expect(noMatch.totalCount).toBe(0);
  });
});

describe("getSupplierLedger — pagination", () => {
  it("paginates a large event set while keeping running balance correct across pages", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    for (let i = 0; i < 30; i++) {
      await createTestPurchase(supplier.id, 1000, `2026-0${1 + Math.floor(i / 28)}-${String((i % 28) + 1).padStart(2, "0")}`);
    }

    const page1 = await getSupplierLedger({ supplierId: supplier.id, page: 1 });
    expect(page1.events).toHaveLength(25);
    expect(page1.totalCount).toBe(30);
    expect(page1.totalPages).toBe(2);

    const page2 = await getSupplierLedger({ supplierId: supplier.id, page: 2 });
    expect(page2.events).toHaveLength(5);
    // The running balance must continue seamlessly from page 1 into
    // page 2 — page 2's first row balance is page 1's 26th cumulative
    // total, not a balance restarted from zero.
    expect(page2.events[0].balanceInPaise).toBe(page1.events.length * 1000 + 1000);
  });
});

describe("getSupplierLedger — cross-supplier authorization", () => {
  it("never includes another supplier's purchases, payments, credits, or refunds", async () => {
    await signInTestAdmin();
    const supplierA = await createTestSupplier();
    const supplierB = await createTestSupplier();
    await createTestPurchase(supplierA.id, 50000, "2026-08-01");
    await createTestPurchase(supplierB.id, 99999, "2026-08-01");
    await createSupplierCreditAction({ supplierId: supplierB.id, creditDate: "2026-08-02", amountInRupees: 500, reason: "OTHER" });
    await createSupplierRefundAction({ supplierId: supplierB.id, refundDate: "2026-08-03", amountInRupees: 300, refundMethod: "CASH", receivedByName: "X" });

    const ledgerA = await getSupplierLedger({ supplierId: supplierA.id });
    expect(ledgerA.events).toHaveLength(1);
    expect(ledgerA.events.every((e) => e.debitInPaise !== 99999)).toBe(true);
    expect(ledgerA.events.some((e) => e.type === "CREDIT" || e.type === "REFUND")).toBe(false);
  });
});

describe("getSupplierLedger — empty results", () => {
  it("reports zero events for a supplier with no financial activity", async () => {
    const supplier = await createTestSupplier();
    const ledger = await getSupplierLedger({ supplierId: supplier.id });
    expect(ledger.events).toHaveLength(0);
    expect(ledger.totalCount).toBe(0);
    expect(ledger.hasAnyActivityInRange).toBe(false);

    const summary = await getSupplierLedgerSummary(supplier.id);
    expect(summary.hasAnyActivity).toBe(false);
  });
});

describe("Supplier Ledger — no mutation on read, inventory isolation", () => {
  it("reading the ledger creates/modifies nothing — no new rows in any financial or inventory table", async () => {
    await signInTestAdmin();
    const supplier = await createTestSupplier();
    const purchase = await createTestPurchase(supplier.id, 50000, "2026-08-01");
    await createSupplierPaymentAction({
      supplierId: supplier.id,
      paymentDate: "2026-08-02",
      amountInRupees: 100,
      paymentMethod: "CASH",
      collectedByName: "Ramesh",
      allocations: [{ purchaseId: purchase.id, amountInRupees: 100 }],
    });

    const before = await Promise.all([
      db.supplierPurchase.count(),
      db.supplierPayment.count(),
      db.supplierCredit.count(),
      db.supplierRefund.count(),
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    // Read the ledger multiple times, with different filters, exactly
    // as a real page load + a few filter changes would.
    await getSupplierLedger({ supplierId: supplier.id });
    await getSupplierLedger({ supplierId: supplier.id, types: ["PAYMENT"] });
    await getSupplierLedger({ supplierId: supplier.id, query: "ramesh" });
    await getSupplierLedgerSummary(supplier.id);

    const after = await Promise.all([
      db.supplierPurchase.count(),
      db.supplierPayment.count(),
      db.supplierCredit.count(),
      db.supplierRefund.count(),
      db.product.count(),
      db.productVariant.count(),
      db.productVariant.aggregate({ _sum: { stockQuantity: true } }),
      db.inventoryAdjustment.count(),
    ]);

    expect(after[0]).toBe(before[0]);
    expect(after[1]).toBe(before[1]);
    expect(after[2]).toBe(before[2]);
    expect(after[3]).toBe(before[3]);
    expect(after[4]).toBe(before[4]);
    expect(after[5]).toBe(before[5]);
    expect(after[6]._sum.stockQuantity).toBe(before[6]._sum.stockQuantity);
    expect(after[7]).toBe(before[7]);
  });
});
