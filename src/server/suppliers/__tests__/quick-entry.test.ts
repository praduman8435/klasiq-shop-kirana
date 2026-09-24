import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { createQuickSupplier, recordQuickBill, recordQuickPayment, QuickEntryError } = await import(
  "@/server/suppliers/quick-entry"
);
const { getSupplierNetBalances } = await import("@/server/queries/admin/supplier-balances");
const { getSupplierKhata, getSupplierLedger } = await import("@/server/queries/admin/supplier-ledger");

const supplierIds: string[] = [];
const adminIds: string[] = [];

afterAll(async () => {
  await db.supplierPayment.deleteMany({ where: { supplierId: { in: supplierIds } } });
  await db.supplierPurchase.deleteMany({ where: { supplierId: { in: supplierIds } } });
  await db.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  await db.adminUser.deleteMany({ where: { id: { in: adminIds } } });
  await db.$disconnect();
});

async function setup(openingBalanceInRupees?: number) {
  const admin = await db.adminUser.create({
    data: { name: "Quick Test", email: `quick-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminIds.push(admin.id);
  const supplier = await createQuickSupplier({ name: `Ramesh Traders ${randomUUID().slice(0, 6)}`, phone: "9876543210", openingBalanceInRupees });
  supplierIds.push(supplier.id);
  return { admin, supplierId: supplier.id };
}

const day = (d: string) => new Date(`${d}T06:00:00Z`);
const balance = async (id: string) => (await getSupplierNetBalances([id])).get(id)?.netInPaise ?? 0;

describe("quick supplier flows", () => {
  it("an opening balance shows up as what's owed", async () => {
    const { supplierId } = await setup(1500);
    expect(await balance(supplierId)).toBe(150000);
    const khata = await getSupplierKhata(supplierId);
    expect(khata.entries[0].reference).toBe("Opening balance");
  });

  it("a bill paid in part leaves only the rest owed", async () => {
    const { admin, supplierId } = await setup();
    await recordQuickBill(
      { supplierId, amountInRupees: 5000, billDate: day("2026-09-10"), billNumber: "A-1", photoIds: [], paid: "PART", paidAmountInRupees: 2000, paymentMethod: "UPI" },
      admin,
    );
    expect(await balance(supplierId)).toBe(300000);

    await recordQuickBill(
      { supplierId, amountInRupees: 1000, billDate: day("2026-09-11"), photoIds: [], paid: "FULL", paymentMethod: "CASH" },
      admin,
    );
    expect(await balance(supplierId)).toBe(300000);
  });

  it("a payment clears the oldest bills first and keeps extra as an advance", async () => {
    const { admin, supplierId } = await setup();
    const b = (amountInRupees: number, date: string) =>
      recordQuickBill({ supplierId, amountInRupees, billDate: day(date), photoIds: [], paid: "NONE", paymentMethod: "CASH" }, admin);
    const oldBill = await b(1000, "2026-09-01");
    const newBill = await b(3000, "2026-09-05");

    const pay = await recordQuickPayment({ supplierId, amountInRupees: 2500, paymentDate: day("2026-09-06"), paymentMethod: "CASH" }, admin);
    expect(pay).toMatchObject({ billsPaidCount: 2, advanceInPaise: 0 });

    const allocations = await db.paymentAllocation.findMany({ where: { paymentId: pay.paymentId } });
    const byBill = Object.fromEntries(allocations.map((a) => [a.purchaseId, a.amountInPaise]));
    expect(byBill[oldBill.purchaseId]).toBe(100000);
    expect(byBill[newBill.purchaseId]).toBe(150000);
    expect(await balance(supplierId)).toBe(150000);

    const extra = await recordQuickPayment({ supplierId, amountInRupees: 2000, paymentDate: day("2026-09-07"), paymentMethod: "UPI", givenTo: "Suresh" }, admin);
    expect(extra.advanceInPaise).toBe(50000);
    expect(await balance(supplierId)).toBe(-50000);
    expect((await db.supplierPayment.findUnique({ where: { id: extra.paymentId } }))?.collectedByName).toBe("Suresh");
  });

  it("the list balance, khata and full ledger always agree", async () => {
    const { admin, supplierId } = await setup(700);
    await recordQuickBill({ supplierId, amountInRupees: 1200, billDate: day("2026-09-02"), photoIds: [], paid: "PART", paidAmountInRupees: 200, paymentMethod: "CASH" }, admin);
    await recordQuickPayment({ supplierId, amountInRupees: 400, paymentDate: day("2026-09-03"), paymentMethod: "UPI" }, admin);

    const khata = await getSupplierKhata(supplierId);
    const ledger = await getSupplierLedger({ supplierId });
    expect(khata.balanceInPaise).toBe(await balance(supplierId));
    expect(ledger.closingBalanceInPaise).toBe(khata.balanceInPaise);
    expect(khata.balanceInPaise).toBe(130000); // 700 + 1200 - 200 - 400
    expect(khata.entries[0].balanceInPaise).toBe(khata.balanceInPaise);
  });

  it("refuses a bill photo that was never uploaded", async () => {
    const { admin, supplierId } = await setup();
    await expect(
      recordQuickBill({ supplierId, amountInRupees: 100, billDate: day("2026-09-02"), photoIds: ["nosuchphoto"], paid: "NONE", paymentMethod: "CASH" }, admin),
    ).rejects.toBeInstanceOf(QuickEntryError);
  });
});

describe("opening balance order", () => {
  it("is the oldest entry, so a payment clears it before a bill dated the same day", async () => {
    const { admin, supplierId } = await setup(1500);
    const today = new Date(new Date().toLocaleDateString("en-CA")); // what a date input sends: UTC midnight today
    await recordQuickBill({ supplierId, amountInRupees: 5000, billDate: today, photoIds: [], paid: "NONE", paymentMethod: "CASH" }, admin);

    const pay = await recordQuickPayment({ supplierId, amountInRupees: 1500, paymentDate: today, paymentMethod: "CASH" }, admin);
    const [allocation] = await db.paymentAllocation.findMany({ where: { paymentId: pay.paymentId }, include: { purchase: true } });
    expect(allocation.purchase.reference).toBe("Opening balance");
    expect(allocation.amountInPaise).toBe(150000);
  });
});
