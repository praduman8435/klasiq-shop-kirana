import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { searchSellableVariants } from "@/server/queries/admin/counter-sale";

let categoryId: string;
let schoolId: string;
const suffix = randomUUID().slice(0, 8);
const productName = `Test Search Shirt ${suffix}`;
let activeVariantId: string;
let inactiveVariantProductId: string;
let inactiveVariantId: string;
let variantOnInactiveProductId: string;

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-counter-search-cat-${suffix}`, name: "Test Counter Search Category" },
  });
  categoryId = category.id;

  const school = await db.school.create({
    data: { slug: `test-counter-search-school-${suffix}`, name: "Test Counter Search School" },
  });
  schoolId = school.id;

  const product = await db.product.create({
    data: { slug: `test-counter-search-product-${suffix}`, name: productName, categoryId, schoolId },
  });
  const variant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "L",
      sku: `TEST-SEARCH-SKU-${suffix}`,
      priceInPaise: 25000,
      stockQuantity: 8,
    },
  });
  activeVariantId = variant.id;

  // An inactive VARIANT on an otherwise-active product must be excluded.
  const inactiveVariant = await db.productVariant.create({
    data: {
      productId: product.id,
      size: "XL",
      sku: `TEST-SEARCH-SKU-INACTIVE-${suffix}`,
      priceInPaise: 25000,
      stockQuantity: 8,
      isActive: false,
    },
  });
  inactiveVariantId = inactiveVariant.id;
  inactiveVariantProductId = product.id;

  // An active variant on an INACTIVE product must also be excluded.
  const inactiveProduct = await db.product.create({
    data: {
      slug: `test-counter-search-inactive-product-${suffix}`,
      name: `Test Search Inactive Product ${suffix}`,
      categoryId,
      isActive: false,
    },
  });
  const variantOnInactiveProduct = await db.productVariant.create({
    data: {
      productId: inactiveProduct.id,
      size: "M",
      sku: `TEST-SEARCH-SKU-INACTIVEPROD-${suffix}`,
      priceInPaise: 25000,
      stockQuantity: 8,
    },
  });
  variantOnInactiveProductId = variantOnInactiveProduct.id;
});

afterAll(async () => {
  await db.productVariant.deleteMany({
    where: { id: { in: [activeVariantId, inactiveVariantId, variantOnInactiveProductId] } },
  });
  await db.product.deleteMany({
    where: { id: { in: [inactiveVariantProductId] } },
  });
  await db.product.deleteMany({ where: { name: { startsWith: "Test Search Inactive Product" } } });
  await db.school.delete({ where: { id: schoolId } });
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

describe("searchSellableVariants", () => {
  it("finds a variant by partial product name", async () => {
    const results = await searchSellableVariants("Test Search Shirt");
    expect(results.some((r) => r.variantId === activeVariantId)).toBe(true);
  });

  it("finds a variant by exact SKU", async () => {
    const results = await searchSellableVariants(`TEST-SEARCH-SKU-${suffix}`);
    expect(results.some((r) => r.variantId === activeVariantId)).toBe(true);
  });

  it("includes school name when the product is school-specific", async () => {
    const results = await searchSellableVariants("Test Search Shirt");
    const found = results.find((r) => r.variantId === activeVariantId);
    expect(found?.schoolName).toBe("Test Counter Search School");
  });

  it("excludes a deactivated variant even when its product is active", async () => {
    const results = await searchSellableVariants(`TEST-SEARCH-SKU-INACTIVE-${suffix}`);
    expect(results.some((r) => r.variantId === inactiveVariantId)).toBe(false);
  });

  it("excludes an active variant whose product is deactivated", async () => {
    const results = await searchSellableVariants(`TEST-SEARCH-SKU-INACTIVEPROD-${suffix}`);
    expect(results.some((r) => r.variantId === variantOnInactiveProductId)).toBe(false);
  });

  it("returns an empty array for a blank query", async () => {
    expect(await searchSellableVariants("   ")).toEqual([]);
  });

  it("returns an empty array for a query matching nothing", async () => {
    expect(await searchSellableVariants(`no-such-sku-${randomUUID()}`)).toEqual([]);
  });
});
