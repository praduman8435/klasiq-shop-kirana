import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getOrderByNumberAndToken } from "@/server/queries/orders";

// Deep security audit (2026-08-09) — regression test for the constant-time
// accessToken comparison fix. Previously this function used a plain `!==`
// on the raw token, inconsistent with every other secret comparison in
// this codebase (src/lib/scrypt-hash.ts's verifySecretHash). The fix
// (hash both sides, then timingSafeEqual) must behave IDENTICALLY to the
// old plain comparison for every legitimate input — only the timing
// characteristics change, never the pass/fail outcome.

let categoryId: string;
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-order-token-${randomUUID()}`, name: "Test Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdOrderIds.length) {
    await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  }
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

async function createTestOrder(accessToken: string) {
  const suffix = randomUUID();
  const product = await db.product.create({
    data: { slug: `test-product-${suffix}`, name: `Test Product ${suffix.slice(0, 8)}`, categoryId },
  });
  createdProductIds.push(product.id);

  const order = await db.order.create({
    data: {
      orderNumber: `ORD-TEST-${suffix.slice(0, 8).toUpperCase()}`,
      accessToken,
      customerName: "Test Customer",
      customerMobile: "9876543210",
      fulfillmentType: "STORE_PICKUP",
      paymentMethod: "CASH_ON_DELIVERY",
      status: "PENDING",
      subtotalInPaise: 10000,
      totalInPaise: 10000,
      amountReceivedInPaise: 10000,
      outstandingInPaise: 0,
    },
  });
  createdOrderIds.push(order.id);
  return order;
}

describe("getOrderByNumberAndToken", () => {
  it("returns the order when both orderNumber and accessToken match", async () => {
    const token = `correct-token-${randomUUID()}`;
    const order = await createTestOrder(token);
    const result = await getOrderByNumberAndToken(order.orderNumber, token);
    expect(result?.id).toBe(order.id);
  });

  it("returns null for a wrong token of the SAME length as the real one", async () => {
    const id = randomUUID();
    const token = `correct-${id}`;
    const order = await createTestOrder(token);
    const wrongSameLength = `wrongxx-${id}`;
    expect(wrongSameLength.length).toBe(token.length);
    const result = await getOrderByNumberAndToken(order.orderNumber, wrongSameLength);
    expect(result).toBeNull();
  });

  it("returns null for a wrong token of a DIFFERENT length than the real one (no throw)", async () => {
    const token = `correct-token-${randomUUID()}`;
    const order = await createTestOrder(token);
    await expect(getOrderByNumberAndToken(order.orderNumber, "short")).resolves.toBeNull();
    await expect(
      getOrderByNumberAndToken(order.orderNumber, `${token}-with-extra-length-appended`),
    ).resolves.toBeNull();
  });

  it("returns null for an empty-string token", async () => {
    const token = `correct-token-${randomUUID()}`;
    const order = await createTestOrder(token);
    await expect(getOrderByNumberAndToken(order.orderNumber, "")).resolves.toBeNull();
  });

  it("returns null for a nonexistent order number, regardless of token", async () => {
    await expect(getOrderByNumberAndToken("ORD-DOES-NOT-EXIST", "anything")).resolves.toBeNull();
  });
});
