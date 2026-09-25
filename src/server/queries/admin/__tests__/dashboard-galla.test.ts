import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { createCounterSale } = await import("@/server/commerce/counter-sale");
const { createKhataCustomer, recordCollection, recordUdhaar } = await import("@/server/khatabook/quick-khata");
const { createQuickSupplier, recordQuickBill, recordQuickPayment } = await import("@/server/suppliers/quick-entry");
const { getDashboardOverview } = await import("@/server/queries/admin/dashboard");

let categoryId: string;
let admin: { id: string };
const productIds: string[] = [];
const customerIds: string[] = [];
const supplierIds: string[] = [];

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { slug: `test-galla-${randomUUID()}`, name: "Test Galla" } })).id;
  admin = await db.adminUser.create({
    data: { name: "Galla Test", email: `galla-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
});

afterAll(async () => {
  const orders = await db.order.findMany({ where: { customerId: { in: customerIds } }, select: { id: true } });
  await db.paymentReceipt.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.khataCollection.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.khataEntry.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orders.map((o) => o.id) } } });
  await db.order.deleteMany({ where: { id: { in: orders.map((o) => o.id) } } });
  await db.customer.deleteMany({ where: { id: { in: customerIds } } });
  await db.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.supplierPayment.deleteMany({ where: { supplierId: { in: supplierIds } } });
  await db.supplierPurchase.deleteMany({ where: { supplierId: { in: supplierIds } } });
  await db.supplier.deleteMany({ where: { id: { in: supplierIds } } });
  await db.adminUser.delete({ where: { id: admin.id } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function sale(customerDbId: string, total: number, paid: number, paymentMethod: "CASH" | "UPI") {
  const suffix = randomUUID();
  const product = await db.product.create({ data: { slug: `test-galla-p-${suffix}`, name: "Test Atta", categoryId } });
  productIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "1 kg", sku: `TEST-GALLA-${suffix}`, priceInPaise: total * 100, stockQuantity: 5 },
  });
  const result = await createCounterSale({
    lines: [{ productVariantId: variant.id, quantity: 1 }],
    customer: { mode: "EXISTING", customerId: customerDbId },
    paymentMethod,
    idempotencyKey: randomUUID(),
    adminUserId: admin.id,
    payment: { mode: "PARTIAL", amountReceivedInPaise: paid * 100 },
  });
  if (!result.success) throw new Error(JSON.stringify(result.error));
}

describe("dashboard galla (today's cash & UPI)", () => {
  it("adds up counter sales, udhaar paid back and supplier payments by how the money moved", async () => {
    const before = (await getDashboardOverview()).today;

    const created = await createKhataCustomer({ name: "Sunita", phone: `9${Math.floor(100_000_000 + Math.random() * 899_999_999)}` }, admin);
    const customer = await db.customer.findUniqueOrThrow({ where: { customerId: created.customerId } });
    customerIds.push(customer.id);

    await sale(customer.id, 100, 100, "CASH"); // ₹100 cash, paid in full
    await sale(customer.id, 200, 50, "UPI"); // ₹50 UPI now, ₹150 udhaar
    await recordUdhaar({ customerId: customer.customerId, amountInRupees: 40, entryDate: new Date() }, admin);
    // ₹60 cash today, and ₹30 entered now but dated yesterday: only the ₹60 is today's galla.
    await recordCollection({ customerId: customer.customerId, amountInRupees: 60, paymentMethod: "CASH", collectedAt: new Date() }, admin);
    await recordCollection(
      { customerId: customer.customerId, amountInRupees: 30, paymentMethod: "CASH", collectedAt: new Date(Date.now() - 86_400_000) },
      admin,
    );

    const supplier = await createQuickSupplier({ name: `Galla Traders ${randomUUID().slice(0, 6)}` });
    supplierIds.push(supplier.id);
    await recordQuickBill({ supplierId: supplier.id, amountInRupees: 1000, billDate: new Date(), photoIds: [], paid: "NONE", paymentMethod: "CASH" }, admin);
    await recordQuickPayment({ supplierId: supplier.id, amountInRupees: 300, paymentDate: new Date(), paymentMethod: "CASH" }, admin);
    // A bank transfer never touches the drawer or UPI.
    await recordQuickPayment({ supplierId: supplier.id, amountInRupees: 200, paymentDate: new Date(), paymentMethod: "BANK_TRANSFER" }, admin);

    const after = (await getDashboardOverview()).today;
    const delta = (pick: (t: typeof after) => number) => pick(after) - pick(before);

    expect(delta((t) => t.galla.counterSales.CASH)).toBe(10000);
    expect(delta((t) => t.galla.counterSales.UPI)).toBe(5000);
    expect(delta((t) => t.galla.udhaarRepaid.CASH)).toBe(6000);
    expect(delta((t) => t.galla.paidToSuppliers.CASH)).toBe(30000);
    expect(delta((t) => t.galla.paidToSuppliers.UPI)).toBe(0);
    expect(delta((t) => t.galla.net.CASH)).toBe(10000 + 6000 - 30000);
    expect(delta((t) => t.galla.net.UPI)).toBe(5000);
    expect(delta((t) => t.salesInPaise)).toBe(30000);
    // ₹150 on the UPI bill (the later ₹90 paid back doesn't hide it) + ₹40 quick udhaar.
    expect(delta((t) => t.udhaarGivenInPaise)).toBe(19000);
  });
});
