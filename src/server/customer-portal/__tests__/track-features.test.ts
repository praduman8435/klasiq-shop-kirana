import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { db } = await import("@/lib/db");
const { cancelOrderByCustomer } = await import("@/server/commerce/cancel-order");
const { updateOrderStatus } = await import("@/server/commerce/update-order-status");
const { reorderIntoBasket } = await import("@/server/customer-portal/reorder");
const { createKhataCustomer } = await import("@/server/khatabook/quick-khata");
const claims = await import("@/server/khatabook/payment-claims");

let categoryId: string;
let admin: { id: string };
const productIds: string[] = [];
const variantIds: string[] = [];
const orderIds: string[] = [];
const customerIds: string[] = [];
const basketIds: string[] = [];

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { slug: `test-track-${randomUUID()}`, name: "Test Track" } })).id;
  admin = await db.adminUser.create({
    data: { name: "Track Test", email: `track-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
});

afterAll(async () => {
  await db.basketItem.deleteMany({ where: { basketId: { in: basketIds } } });
  await db.basket.deleteMany({ where: { id: { in: basketIds } } });
  await db.inventoryAdjustment.deleteMany({ where: { productVariantId: { in: variantIds } } });
  await db.khataPaymentClaim.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.paymentReceipt.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.khataCollection.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.khataEntry.deleteMany({ where: { customerId: { in: customerIds } } });
  await db.orderItem.deleteMany({ where: { orderId: { in: orderIds } } });
  await db.order.deleteMany({ where: { id: { in: orderIds } } });
  await db.customer.deleteMany({ where: { id: { in: customerIds } } });
  await db.productVariant.deleteMany({ where: { id: { in: variantIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.adminUser.delete({ where: { id: admin.id } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function phone() {
  return `9${Math.floor(100_000_000 + Math.random() * 899_999_999)}`;
}

async function customer() {
  const p = phone();
  const c = await db.customer.create({
    data: { customerId: `KLQ-T${randomUUID().slice(0, 8).toUpperCase()}`, displayName: "Asha", primaryPhone: p, primaryPhoneNormalized: `+91${p}` },
  });
  customerIds.push(c.id);
  return c;
}

async function variant(opts: { price?: number; stock?: number; active?: boolean; name?: string } = {}) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-track-p-${suffix}`, name: opts.name ?? `Atta ${suffix.slice(0, 4)}`, categoryId, isActive: opts.active ?? true },
  });
  productIds.push(product.id);
  const stock = opts.stock ?? 10;
  const v = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "1 kg",
      sku: `TEST-TRACK-${suffix}`,
      priceInPaise: opts.price ?? 5000,
      stockQuantity: stock,
      stockStatus: stock === 0 ? "OUT_OF_STOCK" : "IN_STOCK",
    },
  });
  variantIds.push(v.id);
  return { product, variant: v };
}

async function onlineOrder(customerDbId: string, lines: { variantId: string; productId: string; name: string; qty: number; price: number }[], over: Partial<{ status: "PENDING" | "CONFIRMED" | "PREPARING" | "READY_FOR_PICKUP" | "OUT_FOR_DELIVERY" | "DELIVERED"; paymentStatus: "UNPAID" | "PAID"; fulfillmentType: "STORE_PICKUP" | "LOCAL_DELIVERY" }> = {}) {
  const total = lines.reduce((s, l) => s + l.qty * l.price, 0);
  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-TRK-${randomUUID().slice(0, 8).toUpperCase()}`,
      accessToken: randomUUID(),
      source: "ONLINE",
      customerId: customerDbId,
      customerName: "Asha",
      customerMobile: "9800000000",
      fulfillmentType: over.fulfillmentType ?? "LOCAL_DELIVERY",
      paymentMethod: "CASH_ON_DELIVERY",
      paymentStatus: over.paymentStatus ?? "UNPAID",
      status: over.status ?? "PENDING",
      subtotalInPaise: total,
      deliveryFeeInPaise: 0,
      totalInPaise: total,
      amountReceivedInPaise: 0,
      outstandingInPaise: 0,
      items: {
        create: lines.map((l) => ({
          productId: l.productId,
          productVariantId: l.variantId,
          productName: l.name,
          size: "1 kg",
          skuSnapshot: "SKU",
          unitPriceInPaise: l.price,
          quantity: l.qty,
          lineTotalInPaise: l.qty * l.price,
          effectiveLineTotalInPaise: l.qty * l.price,
        })),
      },
    },
  });
  orderIds.push(order.id);
  return order;
}

describe("customer cancels their own order", () => {
  it("cancels before it leaves the shop, puts the stock back and records who and why", async () => {
    const c = await customer();
    const { product, variant: v } = await variant({ stock: 10 });
    const order = await onlineOrder(c.id, [{ variantId: v.id, productId: product.id, name: product.name, qty: 3, price: 5000 }], { status: "PREPARING" });

    const result = await cancelOrderByCustomer({ orderNumber: order.orderNumber, customerDbId: c.id, reason: "Ordered by mistake" });
    expect(result).toEqual({ success: true });

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after.status).toBe("CANCELLED");
    expect(after.cancelledBy).toBe("CUSTOMER");
    expect(after.cancelReason).toBe("Ordered by mistake");
    expect(after.cancelledAt).not.toBeNull();
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stockQuantity).toBe(13);

    // A second tap can't restore stock twice.
    const again = await cancelOrderByCustomer({ orderNumber: order.orderNumber, customerDbId: c.id, reason: "Ordered by mistake" });
    expect(again.success).toBe(false);
    expect((await db.productVariant.findUniqueOrThrow({ where: { id: v.id } })).stockQuantity).toBe(13);
  });

  it("allows a pickup order that's ready but not collected", async () => {
    const c = await customer();
    const { product, variant: v } = await variant();
    const order = await onlineOrder(c.id, [{ variantId: v.id, productId: product.id, name: product.name, qty: 1, price: 5000 }], {
      status: "READY_FOR_PICKUP",
      fulfillmentType: "STORE_PICKUP",
    });
    expect((await cancelOrderByCustomer({ orderNumber: order.orderNumber, customerDbId: c.id, reason: "Other reason" })).success).toBe(true);
  });

  it("refuses once it's out for delivery, delivered, or already paid", async () => {
    const c = await customer();
    const { product, variant: v } = await variant();
    const line = [{ variantId: v.id, productId: product.id, name: product.name, qty: 1, price: 5000 }];
    for (const over of [{ status: "OUT_FOR_DELIVERY" as const }, { status: "DELIVERED" as const }, { status: "CONFIRMED" as const, paymentStatus: "PAID" as const }]) {
      const order = await onlineOrder(c.id, line, over);
      const result = await cancelOrderByCustomer({ orderNumber: order.orderNumber, customerDbId: c.id, reason: "Other reason" });
      expect(result.success).toBe(false);
      if (!result.success) expect(result.error.type).toBe("NOT_ALLOWED");
      expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe(over.status);
    }
  });

  it("treats someone else's order as not found", async () => {
    const owner = await customer();
    const stranger = await customer();
    const { product, variant: v } = await variant();
    const order = await onlineOrder(owner.id, [{ variantId: v.id, productId: product.id, name: product.name, qty: 1, price: 5000 }]);
    const result = await cancelOrderByCustomer({ orderNumber: order.orderNumber, customerDbId: stranger.id, reason: "Other reason" });
    expect(result).toMatchObject({ success: false, error: { type: "NOT_FOUND" } });
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).status).toBe("PENDING");
  });

  it("marks a shop cancellation as by the shop", async () => {
    const c = await customer();
    const { product, variant: v } = await variant();
    const order = await onlineOrder(c.id, [{ variantId: v.id, productId: product.id, name: product.name, qty: 1, price: 5000 }]);
    expect((await updateOrderStatus({ orderNumber: order.orderNumber, newStatus: "CANCELLED", adminUserId: admin.id })).success).toBe(true);
    expect((await db.order.findUniqueOrThrow({ where: { id: order.id } })).cancelledBy).toBe("SHOP");
  });
});

describe("order again", () => {
  it("adds what's available at today's price, skips the rest, and never doubles on a second tap", async () => {
    const c = await customer();
    const atta = await variant({ price: 5000, stock: 10, name: "Atta" });
    const salt = await variant({ price: 2000, stock: 1, name: "Salt" });
    const gone = await variant({ stock: 0, name: "Maggi" });
    const old = await variant({ active: false, name: "Old soap" });
    const order = await onlineOrder(
      c.id,
      [
        { variantId: atta.variant.id, productId: atta.product.id, name: "Atta", qty: 2, price: 4500 },
        { variantId: salt.variant.id, productId: salt.product.id, name: "Salt", qty: 3, price: 2000 },
        { variantId: gone.variant.id, productId: gone.product.id, name: "Maggi", qty: 1, price: 1400 },
        { variantId: old.variant.id, productId: old.product.id, name: "Old soap", qty: 1, price: 3000 },
      ],
      { status: "DELIVERED" },
    );
    const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
    basketIds.push(basket.id);

    const result = await reorderIntoBasket({ orderNumber: order.orderNumber, customerDbId: c.id, basketId: basket.id });
    expect(result.success).toBe(true);
    if (!result.success) return;
    expect(result.added.map((l) => [l.name, l.quantity])).toEqual([
      ["Atta", 2],
      ["Salt", 1],
    ]);
    expect(result.skipped.map((s) => [s.name, s.reason])).toEqual([
      ["Salt", "Only 1 available"],
      ["Maggi", "Out of stock"],
      ["Old soap", "No longer sold"],
    ]);
    expect(result.priceChanged).toBe(true);

    const items = await db.basketItem.findMany({ where: { basketId: basket.id }, orderBy: { priceInPaiseAtAdd: "desc" } });
    expect(items.map((i) => [i.quantity, i.priceInPaiseAtAdd])).toEqual([
      [2, 5000],
      [1, 2000],
    ]);

    await reorderIntoBasket({ orderNumber: order.orderNumber, customerDbId: c.id, basketId: basket.id });
    const again = await db.basketItem.findMany({ where: { basketId: basket.id } });
    expect(again.reduce((s, i) => s + i.quantity, 0)).toBe(3);
  });

  it("can't reorder someone else's order", async () => {
    const owner = await customer();
    const stranger = await customer();
    const { product, variant: v } = await variant();
    const order = await onlineOrder(owner.id, [{ variantId: v.id, productId: product.id, name: product.name, qty: 1, price: 5000 }]);
    const basket = await db.basket.create({ data: { accessToken: randomUUID() } });
    basketIds.push(basket.id);
    const result = await reorderIntoBasket({ orderNumber: order.orderNumber, customerDbId: stranger.id, basketId: basket.id });
    expect(result.success).toBe(false);
    expect(await db.basketItem.count({ where: { basketId: basket.id } })).toBe(0);
  });
});

describe("Mera Khata online payments", () => {
  async function khataCustomer(openingRupees: number) {
    const created = await createKhataCustomer({ name: "Ramesh", phone: phone(), openingBalanceInRupees: openingRupees }, admin);
    const c = await db.customer.findUniqueOrThrow({ where: { customerId: created.customerId } });
    customerIds.push(c.id);
    return c;
  }

  it("shows the balance, holds a claim as 'being checked', and clears the khata only when the shop confirms", async () => {
    const c = await khataCustomer(500);
    let khata = await claims.getCustomerKhata(c.id);
    expect(khata.dueInPaise).toBe(50000);
    expect(khata.payableInPaise).toBe(50000);

    await claims.createKhataPaymentClaim({ customerDbId: c.id, amountInPaise: 20000, upiReference: "412345678901" });
    khata = await claims.getCustomerKhata(c.id);
    expect(khata.dueInPaise).toBe(50000); // nothing changes until confirmed
    expect(khata.pendingInPaise).toBe(20000);
    expect(khata.payableInPaise).toBe(30000);

    // Can't claim more than what's left after pending claims.
    await expect(claims.createKhataPaymentClaim({ customerDbId: c.id, amountInPaise: 30001 })).rejects.toThrow(/more than/);

    const [pending] = await claims.getPendingKhataPaymentClaims(c.id);
    await claims.confirmKhataPaymentClaim(pending.id, admin);
    khata = await claims.getCustomerKhata(c.id);
    expect(khata.dueInPaise).toBe(30000);
    expect(khata.pending).toHaveLength(0);
    expect(khata.events[0]).toMatchObject({ type: "PAYMENT", amountInPaise: 20000, paymentMethod: "UPI", note: null });

    const claim = await db.khataPaymentClaim.findUniqueOrThrow({ where: { id: pending.id } });
    expect(claim.status).toBe("CONFIRMED");
    expect(claim.collectionId).not.toBeNull();

    // Deciding twice is refused and records nothing extra.
    await expect(claims.confirmKhataPaymentClaim(pending.id, admin)).rejects.toThrow(/already checked/);
    expect((await claims.getCustomerKhata(c.id)).dueInPaise).toBe(30000);
  });

  it("leaves the khata alone when the shop says it wasn't received, and tells the customer", async () => {
    const c = await khataCustomer(300);
    const { id } = await claims.createKhataPaymentClaim({ customerDbId: c.id, amountInPaise: 30000 });
    await claims.rejectKhataPaymentClaim(id, admin);
    const khata = await claims.getCustomerKhata(c.id);
    expect(khata.dueInPaise).toBe(30000);
    expect(khata.rejected.map((r) => r.amountInPaise)).toEqual([30000]);
    await expect(claims.rejectKhataPaymentClaim(id, admin)).rejects.toThrow(/already checked/);
  });

  it("won't confirm more than is now due (the shop already took cash), and caps waiting claims", async () => {
    const c = await khataCustomer(100);
    const { id } = await claims.createKhataPaymentClaim({ customerDbId: c.id, amountInPaise: 10000 });
    await db.khataEntry.updateMany({ where: { customerId: c.id }, data: { outstandingInPaise: 5000 } });
    await expect(claims.confirmKhataPaymentClaim(id, admin)).rejects.toThrow(/more than/);
    expect((await db.khataPaymentClaim.findUniqueOrThrow({ where: { id } })).status).toBe("PENDING");

    const d = await khataCustomer(1000);
    for (let i = 0; i < claims.MAX_PENDING_CLAIMS; i++) await claims.createKhataPaymentClaim({ customerDbId: d.id, amountInPaise: 1000 });
    await expect(claims.createKhataPaymentClaim({ customerDbId: d.id, amountInPaise: 1000 })).rejects.toThrow(/earlier payments/);
  });

  it("refuses a claim when nothing is due", async () => {
    const c = await customer();
    await expect(claims.createKhataPaymentClaim({ customerDbId: c.id, amountInPaise: 1000 })).rejects.toThrow(/Nothing is due/);
  });
});
