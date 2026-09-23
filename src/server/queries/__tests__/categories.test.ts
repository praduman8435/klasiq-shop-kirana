import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getCategoryBySlug,
  getCategoryProducts,
  getHeaderCategories,
  searchProducts,
} from "@/server/queries/categories";

const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];

afterEach(async () => {
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
    createdProductIds.length = 0;
  }
  if (createdCategoryIds.length) {
    await db.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    createdCategoryIds.length = 0;
  }
});

async function createCategory(overrides: Partial<{ name: string; slug: string; displayInHeader: boolean; headerOrder: number }> = {}) {
  const suffix = randomUUID().slice(0, 8);
  const category = await db.category.create({
    data: {
      name: overrides.name ?? `Test Category ${suffix}`,
      slug: overrides.slug ?? `test-category-${suffix}`,
      displayInHeader: overrides.displayInHeader ?? false,
      headerOrder: overrides.headerOrder ?? 0,
    },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("getHeaderCategories — section 6's 'SELECT ... WHERE DisplayInHeader = true ORDER BY HeaderOrder'", () => {
  it("returns only categories with displayInHeader = true", async () => {
    const shown = await createCategory({ displayInHeader: true, headerOrder: 500 });
    const hidden = await createCategory({ displayInHeader: false });

    const categories = await getHeaderCategories();
    const slugs = categories.map((c) => c.slug);
    expect(slugs).toContain(shown.slug);
    expect(slugs).not.toContain(hidden.slug);
  });

  it("orders by headerOrder ascending", async () => {
    const suffix = randomUUID().slice(0, 8);
    const third = await createCategory({ name: `ZZZ Third ${suffix}`, displayInHeader: true, headerOrder: 502 });
    const first = await createCategory({ name: `AAA First ${suffix}`, displayInHeader: true, headerOrder: 500 });
    const second = await createCategory({ name: `MMM Second ${suffix}`, displayInHeader: true, headerOrder: 501 });

    const categories = await getHeaderCategories();
    const ours = categories.filter((c) => [first.slug, second.slug, third.slug].includes(c.slug));
    expect(ours.map((c) => c.slug)).toEqual([first.slug, second.slug, third.slug]);
  });

  it("breaks a headerOrder tie by name, for a deterministic order", async () => {
    const suffix = randomUUID().slice(0, 8);
    const b = await createCategory({ name: `B Tie ${suffix}`, displayInHeader: true, headerOrder: 700 });
    const a = await createCategory({ name: `A Tie ${suffix}`, displayInHeader: true, headerOrder: 700 });

    const categories = await getHeaderCategories();
    const ours = categories.filter((c) => [a.slug, b.slug].includes(c.slug));
    expect(ours.map((c) => c.slug)).toEqual([a.slug, b.slug]);
  });

  it("returns only slug and name — never an internal id", async () => {
    await createCategory({ displayInHeader: true, headerOrder: 501 });
    const categories = await getHeaderCategories();
    for (const category of categories) {
      expect(Object.keys(category).sort()).toEqual(["name", "slug"]);
    }
  });
});

describe("getCategoryBySlug", () => {
  it("returns the category for a real slug", async () => {
    const category = await createCategory();
    const found = await getCategoryBySlug(category.slug);
    expect(found?.id).toBe(category.id);
  });

  it("returns null for an unknown slug", async () => {
    expect(await getCategoryBySlug(`does-not-exist-${randomUUID()}`)).toBeNull();
  });
});

// Phase 3.7 Part 2 — Product Discovery, Search & Catalog Browsing.

async function createProduct(params: {
  categoryId: string;
  name: string;
  description?: string;
  brand?: string;
  isActive?: boolean;
  variantActive?: boolean;
}) {
  const suffix = randomUUID().slice(0, 10);
  const product = await db.product.create({
    data: {
      slug: `test-product-${suffix}`,
      name: params.name,
      description: params.description ?? null,
      categoryId: params.categoryId,
      brand: params.brand ?? null,
      isActive: params.isActive ?? true,
      variants: {
        create: [
          {
            size: "M",
            sku: `TEST-SKU-${suffix}`,
            priceInPaise: 10000,
            stockQuantity: 5,
            isActive: params.variantActive ?? true,
          },
        ],
      },
    },
  });
  createdProductIds.push(product.id);
  return product;
}


describe("getCategoryProducts — category browsing + in-category search (?q=)", () => {
  it("returns every active generic product in the category when no query is given", async () => {
    const category = await createCategory();
    const shirt = await createProduct({ categoryId: category.id, name: "White Shirt" });
    const pant = await createProduct({ categoryId: category.id, name: "Grey Pant" });

    const products = await getCategoryProducts(category.slug);
    const names = products.map((p) => p.name);
    expect(names).toContain(shirt.name);
    expect(names).toContain(pant.name);
  });

  it("matches a partial, case-insensitive product name with ?q=", async () => {
    const category = await createCategory();
    await createProduct({ categoryId: category.id, name: "White Shirt" });

    const products = await getCategoryProducts(category.slug, "sHiRt");
    expect(products.map((p) => p.name)).toEqual(["White Shirt"]);
  });

  it("also matches the product description", async () => {
    const category = await createCategory();
    await createProduct({
      categoryId: category.id,
      name: "Item One",
      description: "A durable navy blazer for winter.",
    });

    const products = await getCategoryProducts(category.slug, "blazer");
    expect(products.map((p) => p.name)).toEqual(["Item One"]);
  });

  it("never returns a product from a different category (category + search isolation)", async () => {
    const categoryA = await createCategory({ name: `Uniforms ${randomUUID().slice(0, 6)}` });
    const categoryB = await createCategory({ name: `Shoes ${randomUUID().slice(0, 6)}` });
    await createProduct({ categoryId: categoryA.id, name: "Shirt In A" });
    const shoeInB = await createProduct({ categoryId: categoryB.id, name: "Shirt-Style Shoe In B" });

    // Searching "shirt" inside category A must never surface category B's
    // product, even though its name also matches "shirt" — the category
    // constraint and the search term are ANDed in the same query.
    const products = await getCategoryProducts(categoryA.slug, "shirt");
    expect(products.map((p) => p.id)).not.toContain(shoeInB.id);
  });

  it("returns an empty array for a query that matches nothing", async () => {
    const category = await createCategory();
    await createProduct({ categoryId: category.id, name: "White Shirt" });

    const products = await getCategoryProducts(category.slug, `no-such-product-${randomUUID()}`);
    expect(products).toEqual([]);
  });

  it("also matches the product brand, case-insensitively", async () => {
    const category = await createCategory();
    const branded = await createProduct({ categoryId: category.id, name: "Iodised Salt 1kg", brand: "Tata" });
    await createProduct({ categoryId: category.id, name: "Rock Salt 1kg" });

    const products = await getCategoryProducts(category.slug, "tATa");
    expect(products.map((p) => p.id)).toEqual([branded.id]);
  });

  it("never returns a deactivated product", async () => {
    const category = await createCategory();
    const inactive = await createProduct({ categoryId: category.id, name: "Retired Shirt", isActive: false });

    const products = await getCategoryProducts(category.slug, "shirt");
    expect(products.map((p) => p.id)).not.toContain(inactive.id);
  });

  it("does not crash and matches nothing on SQL-shaped input", async () => {
    const category = await createCategory();
    await createProduct({ categoryId: category.id, name: "White Shirt" });

    await expect(
      getCategoryProducts(category.slug, "'; DROP TABLE products; --"),
    ).resolves.toEqual([]);
    // The table must genuinely still exist and be queryable afterward.
    await expect(getCategoryProducts(category.slug)).resolves.not.toEqual([]);
  });

  it("does not crash on HTML-shaped or unicode input, and matches nothing spurious", async () => {
    const category = await createCategory();
    await createProduct({ categoryId: category.id, name: "White Shirt" });

    await expect(getCategoryProducts(category.slug, "<script>alert(1)</script>")).resolves.toEqual([]);
    await expect(getCategoryProducts(category.slug, "衬衫👕")).resolves.toEqual([]);
  });

  it("respects a result limit override", async () => {
    const category = await createCategory();
    await createProduct({ categoryId: category.id, name: `Capped Shirt A ${randomUUID().slice(0, 4)}` });
    await createProduct({ categoryId: category.id, name: `Capped Shirt B ${randomUUID().slice(0, 4)}` });
    await createProduct({ categoryId: category.id, name: `Capped Shirt C ${randomUUID().slice(0, 4)}` });

    const products = await getCategoryProducts(category.slug, "Capped Shirt", 2);
    expect(products).toHaveLength(2);
  });

  it("returns an out-of-stock product's variant unchanged — availability is a display concern, not a query filter", async () => {
    const category = await createCategory();
    const suffix = randomUUID().slice(0, 8);
    const product = await db.product.create({
      data: {
        slug: `test-product-${suffix}`,
        name: "Out Of Stock Shirt",
        categoryId: category.id,
        variants: {
          create: [
            { size: "M", sku: `TEST-SKU-${suffix}`, priceInPaise: 10000, stockQuantity: 0, stockStatus: "OUT_OF_STOCK" },
          ],
        },
      },
    });
    createdProductIds.push(product.id);

    const products = await getCategoryProducts(category.slug, "shirt");
    expect(products).toHaveLength(1);
    expect(products[0]!.variants[0]!.stockStatus).toBe("OUT_OF_STOCK");
  });
});

describe("searchProducts — cross-category /search", () => {
  it("finds a matching product across categories with no category constraint", async () => {
    const categoryA = await createCategory();
    const categoryB = await createCategory();
    const shirt = await createProduct({ categoryId: categoryA.id, name: "White Shirt" });
    const shoe = await createProduct({ categoryId: categoryB.id, name: "Black Shoe" });

    const shirtResults = await searchProducts("shirt");
    expect(shirtResults.map((p) => p.id)).toContain(shirt.id);
    expect(shirtResults.map((p) => p.id)).not.toContain(shoe.id);
  });

  it("returns [] for an empty or whitespace-only query, without touching the database", async () => {
    await expect(searchProducts("")).resolves.toEqual([]);
    await expect(searchProducts("   ")).resolves.toEqual([]);
  });

  it("returns [] for a nonexistent product name", async () => {
    const category = await createCategory();
    await createProduct({ categoryId: category.id, name: "White Shirt" });

    const results = await searchProducts(`no-such-product-${randomUUID()}`);
    expect(results).toEqual([]);
  });

  it("matches by brand across categories", async () => {
    const tag = randomUUID().slice(0, 8);
    const dairy = await createCategory();
    const snacks = await createCategory();
    const butter = await createProduct({ categoryId: dairy.id, name: "Butter 100g", brand: `Brand ${tag}` });
    const cookies = await createProduct({ categoryId: snacks.id, name: "Cookies 200g", brand: `Brand ${tag}` });

    const results = await searchProducts(`brand ${tag}`);
    expect(results.map((p) => p.id).sort()).toEqual([butter.id, cookies.id].sort());
  });

  it("each result carries its own category slug/name (needed for cross-category display)", async () => {
    const category = await createCategory({ name: `Bags ${randomUUID().slice(0, 6)}` });
    const bag = await createProduct({ categoryId: category.id, name: "School Bag" });

    const results = await searchProducts("bag");
    const found = results.find((p) => p.id === bag.id);
    expect(found?.category.slug).toBe(category.slug);
    expect(found?.category.name).toBe(category.name);
  });

  it("does not crash and exposes no internal error detail on SQL/HTML-shaped input", async () => {
    await expect(searchProducts("'; DROP TABLE products; --")).resolves.toEqual([]);
    await expect(searchProducts("<img src=x onerror=alert(1)>")).resolves.toEqual([]);
  });

  it("respects a result limit override", async () => {
    const category = await createCategory();
    const tag = randomUUID().slice(0, 6);
    await createProduct({ categoryId: category.id, name: `Limit Test ${tag} A` });
    await createProduct({ categoryId: category.id, name: `Limit Test ${tag} B` });
    await createProduct({ categoryId: category.id, name: `Limit Test ${tag} C` });

    const results = await searchProducts(`Limit Test ${tag}`, 2);
    expect(results).toHaveLength(2);
  });
});
