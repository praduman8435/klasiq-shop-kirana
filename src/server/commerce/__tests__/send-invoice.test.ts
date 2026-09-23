import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Phase 3.6.6 Part 3 — proves the WIRING between sendInvoiceWhatsApp and
// its two dependencies: Part 2's own getInvoiceForOrder/generateInvoicePdf
// (never mocked — this is the "never generate a second PDF implementation"
// guarantee, proven by using the real function) and the WhatsApp send
// itself (mocked here, since its own internal logic — template content,
// phone fallback, retries — is already fully covered by
// invoice-notification-service.test.ts). This file only tests that
// sendInvoiceWhatsApp resolves the right order, builds a real PDF, and
// passes the result through unchanged.
vi.mock("@/server/whatsapp/invoice-notification-service", () => ({
  sendInvoiceOverWhatsApp: vi.fn(),
}));
import { sendInvoiceOverWhatsApp } from "@/server/whatsapp/invoice-notification-service";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { sendInvoiceWhatsApp } from "@/server/commerce/send-invoice";

const mockedSend = vi.mocked(sendInvoiceOverWhatsApp);

let categoryId: string;
let adminUserId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeEach(() => {
  mockedSend.mockClear();
  mockedSend.mockResolvedValue({ success: true });
});

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-send-invoice-${randomUUID()}`, name: "Test Send Invoice Category" },
  });
  categoryId = category.id;
  const admin = await db.adminUser.create({
    data: { name: "Test Send Invoice Admin", email: `test-send-invoice-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
});

afterAll(async () => {
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  await db.adminUser.delete({ where: { id: adminUserId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createOrder() {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-send-invoice-product-${suffix}`, name: `Test Send Invoice Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);
  const variant = await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `TEST-SEND-INV-${suffix}`, priceInPaise: 50000, stockQuantity: 5 },
  });

  const sale = await createCounterSale({
    lines: [{ productVariantId: variant.id, quantity: 1 }],
    customer: { mode: "GUEST" },
    schoolId: null,
    paymentMethod: "CASH",
    idempotencyKey: randomUUID(),
    adminUserId,
  });
  if (!sale.success) throw new Error("setup: sale failed");
  const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber } });
  createdOrderIds.push(order.id);
  return order;
}

describe("sendInvoiceWhatsApp", () => {
  it("returns NOT_FOUND for a nonexistent order, without generating a PDF or attempting a send", async () => {
    const result = await sendInvoiceWhatsApp(`ORD-DOES-NOT-EXIST-${randomUUID()}`);
    expect(result).toEqual({ success: false, error: { type: "NOT_FOUND", message: expect.any(String) } });
    expect(mockedSend).not.toHaveBeenCalled();
  });

  it("calls sendInvoiceOverWhatsApp exactly once with the real order's Invoice and a real, valid PDF buffer", async () => {
    const order = await createOrder();

    const result = await sendInvoiceWhatsApp(order.orderNumber);

    expect(result).toEqual({ success: true });
    expect(mockedSend).toHaveBeenCalledTimes(1);
    const [invoiceArg, pdfArg] = mockedSend.mock.calls[0]!;
    expect(invoiceArg.orderNumber).toBe(order.orderNumber);
    expect(invoiceArg.totalInPaise).toBe(order.totalInPaise);
    expect(Buffer.isBuffer(pdfArg)).toBe(true);
    expect((pdfArg as Buffer).subarray(0, 5).toString("latin1")).toBe("%PDF-");
  });

  it("passes through a failure result unchanged, without throwing", async () => {
    const order = await createOrder();
    mockedSend.mockResolvedValue({ success: false, error: { type: "NO_PHONE", message: "No phone on file." } });

    const result = await sendInvoiceWhatsApp(order.orderNumber);
    expect(result).toEqual({ success: false, error: { type: "NO_PHONE", message: "No phone on file." } });
  });

  it("never mutates the order or any customer data, regardless of outcome", async () => {
    const order = await createOrder();
    const before = await db.order.findUniqueOrThrow({ where: { id: order.id } });

    mockedSend.mockResolvedValue({ success: false, error: { type: "DELIVERY_FAILED", message: "failed" } });
    await sendInvoiceWhatsApp(order.orderNumber);

    const after = await db.order.findUniqueOrThrow({ where: { id: order.id } });
    expect(after).toEqual(before);
  });
});
