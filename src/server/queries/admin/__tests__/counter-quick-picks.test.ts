import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCounterQuickPicks } from "@/server/queries/admin/counter-sale";

const productIds: string[] = [];
let categoryId: string;

afterAll(async () => {
  await db.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  if (categoryId) await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

describe("getCounterQuickPicks", () => {
  it("only offers active, in-stock items and fills up to the limit", async () => {
    categoryId = (await db.category.create({ data: { slug: `test-qp-${randomUUID()}`, name: "Test QP" } })).id;
    const make = async (stockQuantity: number, isActive = true) => {
      const product = await db.product.create({ data: { slug: `test-qp-${randomUUID()}`, name: `QP ${randomUUID().slice(0, 6)}`, categoryId } });
      productIds.push(product.id);
      return db.productVariant.create({
        data: { productId: product.id, size: "1 kg", sku: `TEST-QP-${randomUUID()}`, priceInPaise: 1000, stockQuantity, isActive },
      });
    };
    const out = await make(0);
    const inactive = await make(5, false);
    const picks = await getCounterQuickPicks(50);
    const ids = picks.map((p) => p.variantId);
    expect(ids).not.toContain(out.id);
    expect(ids).not.toContain(inactive.id);
    expect(picks.every((p) => p.stockQuantity > 0)).toBe(true);
    expect(picks.length).toBeLessThanOrEqual(50);
  });
});
