import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same in-memory cookie store as the other admin action tests — runs the
// real getAdminSession(), not a stub.
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

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));

import { createAdminSession } from "@/lib/admin/session";
import { createProductAction, createVariantAction, updateVariantAction } from "@/server/actions/admin/products";

let categoryId: string;
let adminId: string;
const productIds: string[] = [];

beforeAll(async () => {
  categoryId = (await db.category.create({ data: { slug: `test-products-${randomUUID()}`, name: "Test Products" } })).id;
  adminId = (
    await db.adminUser.create({
      data: { name: "Products Test", email: `products-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
    })
  ).id;
});

beforeEach(async () => {
  store.clear();
  await createAdminSession(adminId);
});

afterAll(async () => {
  const variants = await db.productVariant.findMany({ where: { productId: { in: productIds } }, select: { id: true } });
  await db.inventoryAdjustment.deleteMany({ where: { productVariantId: { in: variants.map((v) => v.id) } } });
  await db.productVariant.deleteMany({ where: { productId: { in: productIds } } });
  await db.product.deleteMany({ where: { id: { in: productIds } } });
  await db.adminUser.delete({ where: { id: adminId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

function name(label: string) {
  return `${label} ${randomUUID().slice(0, 6)}`;
}

async function create(productName: string, extra: Record<string, unknown> = {}) {
  const result = await createProductAction({
    name: productName,
    slug: "",
    categoryId,
    isActive: true,
    firstPack: { size: "1 kg", priceInRupees: 62, mrpInRupees: 70, stockQuantity: 12 },
    ...extra,
  });
  if (!result.success) throw new Error(result.error.message);
  productIds.push(result.id);
  return db.product.findUniqueOrThrow({ where: { id: result.id }, include: { variants: true } });
}

describe("adding a product in one step", () => {
  it("makes the web address and product code, and creates the first pack size", async () => {
    const product = await create(name("Toor Dal"));
    expect(product.slug).toMatch(/^toor-dal-[a-z0-9]+$/);
    expect(product.variants).toHaveLength(1);
    const [pack] = product.variants;
    expect(pack).toMatchObject({ size: "1 kg", priceInPaise: 6200, mrpInPaise: 7000, stockQuantity: 12, stockStatus: "IN_STOCK" });
    expect(pack.sku).toBe(`${product.slug}-1-kg`.toUpperCase());
  });

  it("gives a second product with the same name its own web address", async () => {
    const same = name("Same Name");
    const a = await create(same);
    const b = await create(same);
    expect(b.slug).toBe(`${a.slug}-2`);
  });

  it("refuses a selling price above the MRP and saves nothing", async () => {
    const productName = name("Pricey");
    const result = await createProductAction({
      name: productName,
      slug: "",
      categoryId,
      isActive: true,
      firstPack: { size: "1 kg", priceInRupees: 80, mrpInRupees: 70, stockQuantity: 1 },
    });
    expect(result).toMatchObject({ success: false, error: { type: "VALIDATION" } });
    expect(await db.product.count({ where: { name: productName } })).toBe(0);
  });
});

describe("pack sizes", () => {
  it("generates a code when none is given", async () => {
    const product = await create(name("Salt"));
    const result = await createVariantAction({ productId: product.id, size: "500 g", priceInRupees: 12, stockQuantity: 3 });
    expect(result.success).toBe(true);
    const pack = await db.productVariant.findFirstOrThrow({ where: { productId: product.id, size: "500 g" } });
    expect(pack.sku).toBe(`${product.slug}-500-g`.toUpperCase());
    expect(pack.stockStatus).toBe("LOW_STOCK");
  });

  it("records a stock change in the stock history", async () => {
    const product = await create(name("Oil"));
    const pack = product.variants[0];
    const result = await updateVariantAction({
      id: pack.id,
      size: pack.size,
      priceInRupees: 65,
      mrpInRupees: 70,
      stockQuantity: 20,
      expectedStockQuantity: 12,
    });
    expect(result.success).toBe(true);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: pack.id } });
    expect(after).toMatchObject({ priceInPaise: 6500, stockQuantity: 20 });
    const history = await db.inventoryAdjustment.findMany({ where: { productVariantId: pack.id } });
    expect(history).toMatchObject([{ previousQuantity: 12, newQuantity: 20, delta: 8, reason: "MANUAL_CORRECTION" }]);
  });

  it("won't undo a sale made while the form was open, but still saves the price", async () => {
    const product = await create(name("Ghee"));
    const pack = product.variants[0];
    await db.productVariant.update({ where: { id: pack.id }, data: { stockQuantity: 10 } }); // a sale of 2
    const result = await updateVariantAction({
      id: pack.id,
      size: pack.size,
      priceInRupees: 60,
      mrpInRupees: 70,
      stockQuantity: 15,
      expectedStockQuantity: 12,
    });
    expect(result).toMatchObject({ success: false, error: { type: "CONFLICT" } });
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: pack.id } });
    expect(after).toMatchObject({ priceInPaise: 6000, stockQuantity: 10 });
  });

  it("leaves stock alone on a price-only edit even if a sale happened meanwhile", async () => {
    const product = await create(name("Sugar"));
    const pack = product.variants[0];
    await db.productVariant.update({ where: { id: pack.id }, data: { stockQuantity: 9 } });
    const result = await updateVariantAction({
      id: pack.id,
      size: pack.size,
      priceInRupees: 58,
      mrpInRupees: 70,
      stockQuantity: 12,
      expectedStockQuantity: 12,
    });
    expect(result.success).toBe(true);
    const after = await db.productVariant.findUniqueOrThrow({ where: { id: pack.id } });
    expect(after).toMatchObject({ priceInPaise: 5800, stockQuantity: 9 });
    expect(await db.inventoryAdjustment.count({ where: { productVariantId: pack.id } })).toBe(0);
  });
});
