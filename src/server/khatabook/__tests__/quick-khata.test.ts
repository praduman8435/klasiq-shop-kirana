import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { createCounterSale } = await import("@/server/commerce/counter-sale");
const { KhataError, createKhataCustomer, getKhataTimeline, recordCollection, recordUdhaar } = await import(
  "@/server/khatabook/quick-khata"
);
const { getKhataList } = await import("@/server/queries/admin/khata-list");

let categoryId: string;
let admin: { id: string };
const productIds: string[] = [];
const customerIds: string[] = [];

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { slug: `test-khata-${randomUUID()}`, name: "Test Khata" } })).id;
  admin = await db.adminUser.create({
    data: { name: "Khata Test", email: `khata-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
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
  await db.adminUser.delete({ where: { id: admin.id } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function freshPhone() {
  return `9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
}

async function newCustomer(opening?: number) {
  const result = await createKhataCustomer({ name: "Sunita", phone: freshPhone(), openingBalanceInRupees: opening }, admin);
  const customer = await db.customer.findUniqueOrThrow({ where: { customerId: result.customerId } });
  customerIds.push(customer.id);
  return customer;
}

/** A counter sale of ₹`total` where only ₹`paid` was paid (rest on khata). */
async function billUdhaar(customerDbId: string, total: number, paid: number) {
  const suffix = randomUUID();
  const product = await db.product.create({ data: { slug: `test-khata-p-${suffix}`, name: "Test Atta", categoryId } });
  productIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "1 kg", sku: `TEST-KHATA-${suffix}`, priceInPaise: total * 100, stockQuantity: 5 },
  });
  const sale = await createCounterSale({
    lines: [{ productVariantId: variant.id, quantity: 1 }],
    customer: { mode: "EXISTING", customerId: customerDbId },
    paymentMethod: "CASH",
    idempotencyKey: randomUUID(),
    adminUserId: admin.id,
    payment: { mode: "PARTIAL", amountReceivedInPaise: paid * 100 },
  });
  if (!sale.success) throw new Error(JSON.stringify(sale.error));
  return db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
}

const day = (d: string) => new Date(`${d}T06:00:00Z`);

describe("KhataBook quick entries", () => {
  it("adds a customer with purana udhaar, and reopens them by phone instead of duplicating", async () => {
    const customer = await newCustomer(800);
    const timeline = await getKhataTimeline(customer.id);
    expect(timeline.dueInPaise).toBe(80000);
    expect(timeline.events[0]).toMatchObject({ type: "OPENING", amountInPaise: 80000 });

    const again = await createKhataCustomer({ name: "Sunita again", phone: customer.primaryPhone!, openingBalanceInRupees: 500 }, admin);
    expect(again).toEqual({ customerId: customer.customerId, existed: true });
    expect((await getKhataTimeline(customer.id)).dueInPaise).toBe(80000);
  });

  it("one payment clears purana udhaar, then the oldest bill, then quick udhaar", async () => {
    const customer = await newCustomer(300);
    const order = await billUdhaar(customer.id, 1000, 400); // ₹600 on khata
    await recordUdhaar({ customerId: customer.customerId, amountInRupees: 200, note: "doodh, bread", entryDate: new Date(Date.now() + 60_000) }, admin);
    expect((await getKhataTimeline(customer.id)).dueInPaise).toBe(110000);

    const result = await recordCollection({ customerId: customer.customerId, amountInRupees: 700, paymentMethod: "UPI", collectedAt: new Date() }, admin);
    expect(result.dueAfterInPaise).toBe(40000);

    const updatedOrder = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(updatedOrder.outstandingInPaise).toBe(20000); // 600 - (700 - 300 opening)
    expect(updatedOrder.paymentStatus).toBe("PARTIALLY_PAID");
    const receipt = await db.paymentReceipt.findFirstOrThrow({ where: { orderId: order.id } });
    expect(receipt).toMatchObject({ amountInPaise: 40000, outstandingBeforeInPaise: 60000, outstandingAfterInPaise: 20000 });
    expect(receipt.collectionId).toBe(result.collectionId);

    const entries = await db.khataEntry.findMany({ where: { customerId: customer.id }, orderBy: { entryDate: "asc" } });
    expect(entries.map((e) => [e.kind, e.outstandingInPaise])).toEqual([
      ["OPENING_BALANCE", 0],
      ["UDHAAR", 20000],
    ]);
  });

  it("refuses to collect more than is due", async () => {
    const customer = await newCustomer(100);
    await expect(
      recordCollection({ customerId: customer.customerId, amountInRupees: 150, paymentMethod: "CASH", collectedAt: new Date() }, admin),
    ).rejects.toBeInstanceOf(KhataError);
  });

  it("the timeline's running balance always ends at the real balance", async () => {
    const customer = await newCustomer(250);
    await billUdhaar(customer.id, 500, 100);
    await recordUdhaar({ customerId: customer.customerId, amountInRupees: 90, entryDate: new Date() }, admin);
    await recordCollection({ customerId: customer.customerId, amountInRupees: 300, paymentMethod: "CASH", collectedAt: new Date() }, admin);

    const timeline = await getKhataTimeline(customer.id);
    expect(timeline.dueInPaise).toBe(44000); // 250 + 400 + 90 - 300
    expect(timeline.events[0].balanceInPaise).toBe(timeline.dueInPaise);
    // A split payment shows once, as a single "Paisa mila" line.
    expect(timeline.events.filter((e) => e.type === "PAYMENT")).toHaveLength(1);
  });

  it("lists who owes, biggest first on Lena hai and oldest first on Collect", async () => {
    const small = await newCustomer();
    const big = await newCustomer();
    await recordUdhaar({ customerId: small.customerId, amountInRupees: 50, entryDate: day("2026-01-01") }, admin);
    await recordUdhaar({ customerId: big.customerId, amountInRupees: 5000, entryDate: day("2026-03-01") }, admin);

    const ids = (rows: { customerId: string }[]) => rows.map((r) => r.customerId).filter((id) => id === small.customerId || id === big.customerId);
    expect(ids((await getKhataList({ tab: "DUE" })).rows)).toEqual([big.customerId, small.customerId]);
    expect(ids((await getKhataList({ tab: "COLLECT" })).rows)).toEqual([small.customerId, big.customerId]);
  });
});
