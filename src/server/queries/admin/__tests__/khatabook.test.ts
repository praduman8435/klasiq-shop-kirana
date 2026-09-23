import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { updateReturnRequestStatus } from "@/server/commerce/admin-returns";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { receivePayment } from "@/server/commerce/receive-payment";
import { receiveReturnRequest } from "@/server/commerce/return-fulfillment";
import { createReturnRequest } from "@/server/commerce/returns";
import {
  getKhataBookCustomerDirectory,
  getKhataBookCustomerProfile,
  getRecentKhataBookCustomers,
  searchKhataBookCustomers,
} from "@/server/queries/admin/khatabook";

// Phase 3.6.5 Part 4 — real Postgres, real createCounterSale/returns chain
// (nothing mocked), proving the KhataBook query layer's aggregation is
// correct against genuine Order/ReturnRequest rows, not fixtures assembled
// by hand.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-khatabook-${randomUUID()}`, name: "Test KhataBook Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test KhataBook Admin", email: `test-khatabook-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  await db.returnRequest.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  await db.paymentReceipt.deleteMany({ where: { orderId: { in: createdOrderIds } } });
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdCustomerIds.length) await db.customer.deleteMany({ where: { id: { in: createdCustomerIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.adminUser.delete({ where: { id: adminUserId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function freshTestPhone(): string {
  const firstDigit = 6 + Math.floor(Math.random() * 4);
  let rest = "";
  for (let i = 0; i < 9; i++) rest += Math.floor(Math.random() * 10);
  return `${firstDigit}${rest}`;
}

async function createVariant(priceInPaise: number, stockQuantity: number) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-khatabook-product-${suffix}`, name: `Test KhataBook Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-KB-SKU-${suffix}`, priceInPaise, stockQuantity },
  });
  return { product, variant };
}

async function createTestCustomer(label: string) {
  const phone = freshTestPhone();
  const customer = await db.customer.create({
    data: {
      customerId: `KLQ-KB${randomUUID().slice(0, 5).toUpperCase()}`,
      displayName: label,
      primaryPhone: phone,
      primaryPhoneNormalized: `+91${phone}`,
      whatsappPhone: phone,
      whatsappPhoneNormalized: `+91${phone}`,
    },
  });
  createdCustomerIds.push(customer.id);
  return customer;
}

describe("searchKhataBookCustomers", () => {
  it("finds by Customer ID and attaches ₹0/₹0 aggregates for a customer with no orders", async () => {
    const customer = await createTestCustomer("Search By Id Customer");
    const results = await searchKhataBookCustomers(customer.customerId);
    const match = results.find((r) => r.id === customer.id);
    expect(match).toBeDefined();
    expect(match!.outstandingInPaise).toBe(0);
    expect(match!.lifetimePurchaseInPaise).toBe(0);
  });

  it("finds by Name", async () => {
    const suffix = randomUUID().slice(0, 8);
    const customer = await createTestCustomer(`Unique Search Name ${suffix}`);
    const results = await searchKhataBookCustomers(`Unique Search Name ${suffix}`);
    expect(results.some((r) => r.id === customer.id)).toBe(true);
  });

  it("finds by Mobile Number and reports an aggregated Outstanding/Lifetime total across two orders", async () => {
    const customer = await createTestCustomer("Search By Phone Customer");
    const { variant: v1 } = await createVariant(50000, 5);
    const { variant: v2 } = await createVariant(30000, 5);

    const sale1 = await createCounterSale({
      lines: [{ productVariantId: v1.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 20000 },
    });
    expect(sale1.success).toBe(true);
    if (sale1.success) createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: sale1.orderNumber } })).id);

    const sale2 = await createCounterSale({
      lines: [{ productVariantId: v2.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(sale2.success).toBe(true);
    if (sale2.success) createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: sale2.orderNumber } })).id);

    const results = await searchKhataBookCustomers(customer.primaryPhone!);
    const match = results.find((r) => r.id === customer.id);
    expect(match).toBeDefined();
    // Order 1: ₹500 total, ₹200 received -> ₹300 outstanding. Order 2: ₹300
    // total, fully paid -> ₹0 outstanding. Combined: ₹300 outstanding, ₹800
    // lifetime.
    expect(match!.outstandingInPaise).toBe(30000);
    expect(match!.lifetimePurchaseInPaise).toBe(80000);
  });

  it("returns an empty array for a query matching no customer", async () => {
    const results = await searchKhataBookCustomers(`no-such-khatabook-customer-${randomUUID()}`);
    expect(results).toEqual([]);
  });
});

describe("getRecentKhataBookCustomers", () => {
  it("reuses getRecentCustomers ordering and attaches aggregates", async () => {
    const customer = await createTestCustomer("Recent KhataBook Customer");
    const { variant } = await createVariant(40000, 5);
    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(sale.success).toBe(true);
    if (sale.success) createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } })).id);

    const results = await getRecentKhataBookCustomers();
    const match = results.find((r) => r.id === customer.id);
    expect(match).toBeDefined();
    expect(match!.lifetimePurchaseInPaise).toBe(40000);
  });
});

describe("getKhataBookCustomerDirectory", () => {
  it("includes a customer who has never ordered — unlike getRecentKhataBookCustomers, the directory is not limited to customers with a lastOrderAt", async () => {
    const customer = await createTestCustomer("Directory Never Ordered Customer");
    const directory = await getKhataBookCustomerDirectory({ query: customer.customerId });
    expect(directory.customers.some((c) => c.id === customer.id)).toBe(true);
    expect(directory.totalCount).toBe(1);
  });

  it("paginates: pageSize caps the page, totalCount/totalPages reflect the full matching set", async () => {
    const suffix = randomUUID().slice(0, 8);
    const names = Array.from({ length: 3 }, (_, i) => `Directory Page Customer ${suffix} ${i}`);
    for (const name of names) await createTestCustomer(name);

    const page1 = await getKhataBookCustomerDirectory({ query: `Directory Page Customer ${suffix}`, page: 1 });
    expect(page1.totalCount).toBe(3);
    expect(page1.customers).toHaveLength(3); // well under the page size
    expect(page1.pageSize).toBeGreaterThanOrEqual(3);
    expect(page1.totalPages).toBe(1);
  });

  it("search matches Customer ID/Name/Mobile — the exact same rule searchCustomers uses", async () => {
    const customer = await createTestCustomer("Directory Search Match Customer");
    const byId = await getKhataBookCustomerDirectory({ query: customer.customerId });
    const byName = await getKhataBookCustomerDirectory({ query: "Directory Search Match Customer" });
    const byPhone = await getKhataBookCustomerDirectory({ query: customer.primaryPhone! });
    expect(byId.customers.some((c) => c.id === customer.id)).toBe(true);
    expect(byName.customers.some((c) => c.id === customer.id)).toBe(true);
    expect(byPhone.customers.some((c) => c.id === customer.id)).toBe(true);
  });

  it('filter "RECENTLY_ACTIVE" excludes a customer who has never ordered', async () => {
    const neverOrdered = await createTestCustomer("Directory Filter Never Ordered");
    const active = await createTestCustomer("Directory Filter Active");
    const { variant } = await createVariant(10000, 5);
    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: active.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(sale.success).toBe(true);
    if (sale.success) createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } })).id);

    const recentlyActive = await getKhataBookCustomerDirectory({
      query: "Directory Filter",
      filter: "RECENTLY_ACTIVE",
    });
    expect(recentlyActive.customers.some((c) => c.id === active.id)).toBe(true);
    expect(recentlyActive.customers.some((c) => c.id === neverOrdered.id)).toBe(false);
  });

  it('filter "OUTSTANDING" only includes customers with a currently-positive summed balance', async () => {
    const withBalance = await createTestCustomer("Directory Filter With Balance");
    const paidUp = await createTestCustomer("Directory Filter Paid Up");
    const { variant: v1 } = await createVariant(50000, 5);
    const { variant: v2 } = await createVariant(30000, 5);

    const unpaidSale = await createCounterSale({
      lines: [{ productVariantId: v1.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: withBalance.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 10000 },
    });
    expect(unpaidSale.success).toBe(true);
    if (unpaidSale.success) {
      createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: unpaidSale.orderNumber } })).id);
    }

    const paidSale = await createCounterSale({
      lines: [{ productVariantId: v2.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: paidUp.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(paidSale.success).toBe(true);
    if (paidSale.success) {
      createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: paidSale.orderNumber } })).id);
    }

    const outstanding = await getKhataBookCustomerDirectory({
      query: "Directory Filter",
      filter: "OUTSTANDING",
    });
    expect(outstanding.customers.some((c) => c.id === withBalance.id)).toBe(true);
    expect(outstanding.customers.some((c) => c.id === paidUp.id)).toBe(false);
  });
});

describe("getKhataBookCustomerProfile", () => {
  it("returns null for an unknown customerId", async () => {
    expect(await getKhataBookCustomerProfile("KLQ-000000")).toBeNull();
  });

  it("returns all-zero summary fields and an empty purchase history for a customer with no orders", async () => {
    const customer = await createTestCustomer("Zero Order Customer");
    const profile = await getKhataBookCustomerProfile(customer.customerId);
    expect(profile).not.toBeNull();
    expect(profile!.summary).toMatchObject({
      lifetimePurchaseInPaise: 0,
      totalOrders: 0,
      outstandingInPaise: 0,
      unpaidOrderCount: 0,
      returnCount: 0,
      exchangeCount: 0,
      averageOrderValueInPaise: 0,
    });
    expect(profile!.orders).toEqual([]);
    expect(profile!.ledger).toEqual([]);
  });

  it("computes Outstanding, unpaid order count, lifetime purchase, and average order value across a mix of Full and Partial sales", async () => {
    const customer = await createTestCustomer("Mixed Payment Customer");
    const { variant: v1 } = await createVariant(100000, 5);
    const { variant: v2 } = await createVariant(50000, 5);
    const { variant: v3 } = await createVariant(20000, 5);

    // Full payment: ₹1000, ₹0 outstanding.
    const s1 = await createCounterSale({
      lines: [{ productVariantId: v1.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(s1.success).toBe(true);
    if (s1.success) createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: s1.orderNumber } })).id);

    // Partial: ₹500 total, ₹200 received -> ₹300 outstanding.
    const s2 = await createCounterSale({
      lines: [{ productVariantId: v2.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 20000 },
    });
    expect(s2.success).toBe(true);
    if (s2.success) createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: s2.orderNumber } })).id);

    // Full credit: ₹200 total, ₹0 received -> ₹200 outstanding.
    const s3 = await createCounterSale({
      lines: [{ productVariantId: v3.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      payment: { mode: "PARTIAL", amountReceivedInPaise: 0 },
    });
    expect(s3.success).toBe(true);
    if (s3.success) createdOrderIds.push((await db.order.findUniqueOrThrow({ where: { orderNumber: s3.orderNumber } })).id);

    const profile = await getKhataBookCustomerProfile(customer.customerId);
    expect(profile).not.toBeNull();
    expect(profile!.summary.totalOrders).toBe(3);
    expect(profile!.summary.lifetimePurchaseInPaise).toBe(170000); // 1000 + 500 + 200
    expect(profile!.summary.outstandingInPaise).toBe(50000); // 0 + 300 + 200
    expect(profile!.summary.unpaidOrderCount).toBe(2); // s2 and s3
    expect(profile!.summary.averageOrderValueInPaise).toBe(Math.round(170000 / 3));

    // Purchase history: chronological, newest first (mirrors getAdminOrders'
    // own convention), one row per order, with all Part 3 fields present.
    expect(profile!.orders).toHaveLength(3);
    expect(profile!.orders[0]!.orderNumber).toBe(s3.success ? s3.orderNumber : undefined);
    expect(profile!.orders[2]!.orderNumber).toBe(s1.success ? s1.orderNumber : undefined);
    const s2Row = profile!.orders.find((o) => o.orderNumber === (s2.success ? s2.orderNumber : ""));
    expect(s2Row).toMatchObject({ totalInPaise: 50000, amountReceivedInPaise: 20000, outstandingInPaise: 30000 });
  });

  it("counts Returns and Exchanges separately, reusing the real return/exchange pipeline", async () => {
    const customer = await createTestCustomer("Return Exchange Count Customer");
    const { variant: returned } = await createVariant(30000, 5);
    const { variant: exchanged } = await createVariant(30000, 5);
    const { variant: replacement } = await createVariant(35000, 5);

    const returnSale = await createCounterSale({
      lines: [{ productVariantId: returned.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(returnSale.success).toBe(true);
    if (!returnSale.success) return;
    const returnOrder = await db.order.findUniqueOrThrow({
      where: { orderNumber: returnSale.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(returnOrder.id);

    const returnRequest = await createReturnRequest({
      customerId: customer.id,
      orderNumber: returnOrder.orderNumber,
      type: "RETURN",
      items: [{ orderItemId: returnOrder.items[0]!.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(returnRequest.success).toBe(true);
    if (returnRequest.success) {
      await updateReturnRequestStatus({ returnNumber: returnRequest.returnNumber, newStatus: "APPROVED", adminUserId });
      await receiveReturnRequest({ returnNumber: returnRequest.returnNumber, adminUserId });
    }

    const exchangeSale = await createCounterSale({
      lines: [{ productVariantId: exchanged.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(exchangeSale.success).toBe(true);
    if (!exchangeSale.success) return;
    const exchangeOrder = await db.order.findUniqueOrThrow({
      where: { orderNumber: exchangeSale.orderNumber },
      include: { items: true },
    });
    createdOrderIds.push(exchangeOrder.id);

    const exchangeRequest = await createReturnRequest({
      customerId: customer.id,
      orderNumber: exchangeOrder.orderNumber,
      type: "EXCHANGE",
      items: [{ orderItemId: exchangeOrder.items[0]!.id, quantity: 1, reason: "WRONG_SIZE" }],
    });
    expect(exchangeRequest.success).toBe(true);
    if (exchangeRequest.success) {
      await updateReturnRequestStatus({ returnNumber: exchangeRequest.returnNumber, newStatus: "APPROVED", adminUserId });
      const request = await db.returnRequest.findUniqueOrThrow({
        where: { returnNumber: exchangeRequest.returnNumber },
        include: { items: true },
      });
      await receiveReturnRequest({
        returnNumber: exchangeRequest.returnNumber,
        adminUserId,
        replacements: { [request.items[0]!.id]: replacement.id },
      });
    }

    const profile = await getKhataBookCustomerProfile(customer.customerId);
    expect(profile!.summary.returnCount).toBe(1);
    expect(profile!.summary.exchangeCount).toBe(1);
  });

  it("includes the Ledger (Phase 3.6.5 Part 5): newest first, each row explaining the balance's before/after and its originating order", async () => {
    const customer = await createTestCustomer("Ledger Profile Customer");
    // ₹1000 total, ₹0 received -> ₹1000 outstanding.
    const order = await createPartialSaleForLedger({ priceInPaise: 100000, customerId: customer.id });

    const first = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 60000,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(first.success).toBe(true);

    const second = await receivePayment({
      orderNumber: order.orderNumber,
      customerId: customer.customerId,
      amountInPaise: 40000,
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId,
      note: "Paid at pickup",
    });
    expect(second.success).toBe(true);

    const profile = await getKhataBookCustomerProfile(customer.customerId);
    expect(profile!.ledger).toHaveLength(2);
    // Newest first — mirrors Purchase History's own ordering convention.
    expect(profile!.ledger[0]).toMatchObject({
      orderNumber: order.orderNumber,
      amountInPaise: 40000,
      paymentMethod: "UPI",
      note: "Paid at pickup",
      outstandingBeforeInPaise: 40000,
      outstandingAfterInPaise: 0,
    });
    expect(profile!.ledger[1]).toMatchObject({
      orderNumber: order.orderNumber,
      amountInPaise: 60000,
      paymentMethod: "CASH",
      note: null,
      outstandingBeforeInPaise: 100000,
      outstandingAfterInPaise: 40000,
    });
    expect(profile!.ledger[0]!.createdByAdminName).toBe("Test KhataBook Admin");
  });
});

async function createPartialSaleForLedger(params: { priceInPaise: number; customerId: string }) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-kb-ledger-product-${suffix}`, name: `Test KB Ledger Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-KB-LEDGER-SKU-${suffix}`, priceInPaise: params.priceInPaise, stockQuantity: 5 },
  });
  const sale = await createCounterSale({
    lines: [{ productVariantId: variant.id, quantity: 1 }],
    customer: { mode: "EXISTING", customerId: params.customerId },
    paymentMethod: "CASH",
    idempotencyKey: randomUUID(),
    adminUserId,
    payment: { mode: "PARTIAL", amountReceivedInPaise: 0 },
  });
  if (!sale.success) throw new Error("setup sale failed: " + JSON.stringify(sale.error));
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
  createdOrderIds.push(order.id);
  return order;
}
