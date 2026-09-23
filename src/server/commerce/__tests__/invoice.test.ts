import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { getInvoiceForOrder } from "@/server/commerce/invoice";

// Phase 3.6.6 Part 1 — real Postgres, the real createCounterSale chain,
// nothing mocked. Proves the invoice domain layer reads ONLY Order/
// OrderItem snapshot data, and that its output is genuinely immutable
// against later changes to Customer/Product/ProductVariant — the core
// architectural guarantee sections 5/8 ask for.

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];
const createdCustomerIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-invoice-${randomUUID()}`, name: "Test Invoice Category" },
  });
  categoryId = category.id;

  const admin = await db.adminUser.create({
    data: { name: "Test Invoice Admin", email: `test-invoice-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
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
    data: { slug: `test-invoice-product-${suffix}`, name: `Test Invoice Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-INV-SKU-${suffix}`, priceInPaise, stockQuantity },
  });
  return { product, variant };
}

describe("getInvoiceForOrder", () => {
  it("returns null for an unknown order number", async () => {
    expect(await getInvoiceForOrder(`ORD-DOES-NOT-EXIST-${randomUUID()}`)).toBeNull();
  });

  it("assembles a complete invoice from a discounted, partially-paid, addressed Counter Sale", async () => {
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-INV${randomUUID().slice(0, 4).toUpperCase()}`,
        displayName: "Invoice Test Customer",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
        whatsappPhone: phone,
        whatsappPhoneNormalized: `+91${phone}`,
      },
    });
    createdCustomerIds.push(customer.id);
    const { product, variant } = await createVariant(100000, 5);

    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      schoolId: null,
      paymentMethod: "UPI",
      idempotencyKey: randomUUID(),
      adminUserId,
      discount: { type: "PERCENTAGE", value: 10, reason: "Festival" },
      payment: { mode: "PARTIAL", amountReceivedInPaise: 50000 },
      address: { mode: "ONE_TIME", addressLine: "1 Invoice Lane", city: "Pune", state: "MH", pincode: "411001" },
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
    createdOrderIds.push(order.id);

    const invoice = await getInvoiceForOrder(sale.orderNumber);
    expect(invoice).not.toBeNull();
    expect(invoice).toMatchObject({
      orderNumber: sale.orderNumber,
      source: "COUNTER",
      fulfillmentType: "COUNTER_HANDOVER",
      paymentMethod: "UPI",
      customerName: "Invoice Test Customer",
      customerMobile: phone,
      customerId: customer.customerId,
      address: { addressLine: "1 Invoice Lane", city: "Pune", state: "MH", pincode: "411001" },
      subtotalInPaise: 100000,
      discountType: "PERCENTAGE",
      discountValue: 10,
      discountReason: "Festival",
      discountInPaise: 10000,
      totalInPaise: 90000,
      amountReceivedInPaise: 50000,
      outstandingInPaise: 40000,
    });
    expect(invoice!.invoiceDate).toEqual(order.createdAt);
    expect(invoice!.items).toHaveLength(1);
    expect(invoice!.items[0]).toMatchObject({
      productName: product.name,
      size: "M",
      sku: variant.sku,
      quantity: 1,
      unitPriceInPaise: 100000,
      lineTotalInPaise: 100000,
      effectiveLineTotalInPaise: 90000,
    });
  });

  it("reports a null address when no address was ever provided (the common case)", async () => {
    const { variant } = await createVariant(50000, 5);
    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "GUEST" },
      schoolId: null,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
    createdOrderIds.push(order.id);

    const invoice = await getInvoiceForOrder(sale.orderNumber);
    expect(invoice!.address).toBeNull();
    expect(invoice!.customerName).toBeNull();
    expect(invoice!.customerId).toBeNull();
  });

  it("stays byte-identical after the Customer, Product, and ProductVariant it was built from all change later (sections 5, 8)", async () => {
    const phone = freshTestPhone();
    const customer = await db.customer.create({
      data: {
        customerId: `KLQ-INV${randomUUID().slice(0, 4).toUpperCase()}`,
        displayName: "Original Name",
        primaryPhone: phone,
        primaryPhoneNormalized: `+91${phone}`,
        addressLine: "Original Address",
        addressCity: "Pune",
        addressState: "Maharashtra",
        addressPincode: "411001",
      },
    });
    createdCustomerIds.push(customer.id);
    const { product, variant } = await createVariant(75000, 5);

    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 1 }],
      customer: { mode: "EXISTING", customerId: customer.id },
      schoolId: null,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
      address: { mode: "SAVED" },
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
    createdOrderIds.push(order.id);

    const invoiceBefore = await getInvoiceForOrder(sale.orderNumber);

    // Mutate everything the invoice COULD have read live, had it joined
    // to these tables instead of relying purely on the Order/OrderItem
    // snapshot.
    await db.customer.update({
      where: { id: customer.id },
      data: {
        displayName: "Changed Name",
        addressLine: "Changed Address",
        addressCity: "Mumbai",
        addressState: "MH",
        addressPincode: "400001",
      },
    });
    await db.product.update({ where: { id: product.id }, data: { name: "Renamed Product" } });
    await db.productVariant.update({ where: { id: variant.id }, data: { priceInPaise: 999999 } });

    const invoiceAfter = await getInvoiceForOrder(sale.orderNumber);
    expect(invoiceAfter).toEqual(invoiceBefore);
    expect(invoiceAfter!.customerName).toBe("Original Name");
    expect(invoiceAfter!.address).toEqual({
      addressLine: "Original Address",
      city: "Pune",
      state: "Maharashtra",
      pincode: "411001",
    });
    expect(invoiceAfter!.items[0]!.productName).not.toBe("Renamed Product");
    expect(invoiceAfter!.items[0]!.unitPriceInPaise).toBe(75000);
  });

  it("no-discount order: discountType is null, discountInPaise is zero, effective totals equal original totals", async () => {
    const { variant } = await createVariant(60000, 5);
    const sale = await createCounterSale({
      lines: [{ productVariantId: variant.id, quantity: 2 }],
      customer: { mode: "GUEST" },
      schoolId: null,
      paymentMethod: "CASH",
      idempotencyKey: randomUUID(),
      adminUserId,
    });
    expect(sale.success).toBe(true);
    if (!sale.success) return;
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
    createdOrderIds.push(order.id);

    const invoice = await getInvoiceForOrder(sale.orderNumber);
    expect(invoice!.discountType).toBeNull();
    expect(invoice!.discountInPaise).toBe(0);
    expect(invoice!.items[0]!.lineTotalInPaise).toBe(invoice!.items[0]!.effectiveLineTotalInPaise);
  });
});
