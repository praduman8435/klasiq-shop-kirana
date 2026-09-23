import { randomUUID } from "node:crypto";
import { Prisma } from "@prisma/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getCategoryProducts } from "@/server/queries/categories";

// These tests exercise the database constraints and public-query filtering
// that the admin CRUD actions rely on. The admin action layer itself can't
// be called directly from vitest (it transitively imports
// src/lib/admin/session.ts, which is marked "server-only" and throws
// outside Next's request context) — see docs/PHASE_3_REPORT.md "Tests" for
// why admin CRUD is verified via manual browser testing instead, while the
// underlying invariants it depends on (unique slugs, isActive filtering)
// are covered here.

let categoryId: string;
const createdProductIds: string[] = [];

beforeAll(async () => {
  const category = await db.category.create({
    data: { slug: `test-constraints-${randomUUID()}`, name: "Test Constraints Category" },
  });
  categoryId = category.id;
});

afterAll(async () => {
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  }
  await db.category.delete({ where: { id: categoryId } });
  await db.$disconnect();
});

describe("slug uniqueness constraints", () => {
  it("rejects a second product with the same slug", async () => {
    const slug = `duplicate-product-${randomUUID()}`;
    const first = await db.product.create({ data: { slug, name: "First Product", categoryId } });
    createdProductIds.push(first.id);

    await expect(
      db.product.create({ data: { slug, name: "Second Product", categoryId } }),
    ).rejects.toMatchObject({ code: "P2002" });
  });

  it("is a Prisma unique-constraint error specifically (not some other failure)", async () => {
    const slug = `duplicate-check-${randomUUID()}`;
    const first = await db.category.create({ data: { slug, name: "First Category" } });

    try {
      await db.category.create({ data: { slug, name: "Second Category" } });
      expect.unreachable("should have thrown");
    } catch (err) {
      expect(err).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
      if (err instanceof Prisma.PrismaClientKnownRequestError) {
        expect(err.code).toBe("P2002");
      }
    }

    await db.category.delete({ where: { id: first.id } });
  });
});

describe("isActive filtering respected by public queries", () => {
  it("excludes a deactivated variant from a still-active product's listing", async () => {
    const product = await db.product.create({
      data: { slug: `test-inactive-variant-${randomUUID()}`, name: "Product With Inactive Size", categoryId },
    });
    createdProductIds.push(product.id);
    await db.productVariant.create({
      data: {
        productId: product.id,
        size: "S",
        sku: `TEST-${randomUUID()}`,
        priceInPaise: 10000,
        stockQuantity: 5,
        isActive: false,
      },
    });
    await db.productVariant.create({
      data: { productId: product.id, size: "L", sku: `TEST-${randomUUID()}`, priceInPaise: 12000, stockQuantity: 5 },
    });
    const category = await db.category.findUniqueOrThrow({ where: { id: categoryId } });
    const products = await getCategoryProducts(category.slug);
    const found = products.find((p) => p.id === product.id);
    expect(found).toBeDefined();
    expect(found?.variants.map((v) => v.size)).toEqual(["L"]);
  });

  it("excludes an inactive product from category listings", async () => {
    const product = await db.product.create({
      data: {
        slug: `test-listing-inactive-${randomUUID()}`,
        name: "Inactive Listed Product",
        categoryId,
        isActive: false,
      },
    });
    createdProductIds.push(product.id);

    const category = await db.category.findUniqueOrThrow({ where: { id: categoryId } });
    const products = await getCategoryProducts(category.slug);
    expect(products.some((p) => p.id === product.id)).toBe(false);
  });
});
