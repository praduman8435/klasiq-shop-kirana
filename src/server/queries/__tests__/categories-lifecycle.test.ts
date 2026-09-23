import { randomUUID } from "node:crypto";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCounterSale } from "@/server/commerce/counter-sale";
import { getCategoryBySlug, getGenericCategoryProducts, getHeaderCategories } from "@/server/queries/categories";

// Phase 3.6.7 Part 2 — the complete lifecycle audit (sections 2-4, 6, 14):
// create -> assign products -> enable header -> reorder -> rename ->
// hide/show -> empty category -> data-integrity, each proven directly
// against the real query layer every storefront surface actually calls
// (getHeaderCategories/getCategoryBySlug/getGenericCategoryProducts),
// not re-asserted at the admin-action layer again (already fully covered
// by categories.test.ts, Part 1).

let adminUserId: string;
const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];
const createdOrderIds: string[] = [];

afterAll(async () => {
  if (createdOrderIds.length) await db.order.deleteMany({ where: { id: { in: createdOrderIds } } });
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCategoryIds.length) await db.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  if (adminUserId) await db.adminUser.delete({ where: { id: adminUserId } }).catch(() => {});
  await db.$disconnect();
});

async function ensureAdmin() {
  if (adminUserId) return adminUserId;
  const admin = await db.adminUser.create({
    data: { name: "Test Category Lifecycle Admin", email: `test-category-lifecycle-${randomUUID()}@example.com`, passwordHash: "unused:unused" },
  });
  adminUserId = admin.id;
  return adminUserId;
}

async function createCategoryWithProduct(overrides: Partial<{ name: string; slug: string; displayInHeader: boolean; headerOrder: number }> = {}) {
  const suffix = randomUUID().slice(0, 8);
  const category = await db.category.create({
    data: {
      name: overrides.name ?? `Lifecycle Category ${suffix}`,
      slug: overrides.slug ?? `lifecycle-category-${suffix}`,
      displayInHeader: overrides.displayInHeader ?? false,
      headerOrder: overrides.headerOrder ?? 0,
    },
  });
  createdCategoryIds.push(category.id);

  const product = await db.product.create({
    data: { slug: `lifecycle-product-${suffix}`, name: `Lifecycle Product ${suffix}`, categoryId: category.id },
  });
  createdProductIds.push(product.id);
  await db.productVariant.create({
    data: { productId: product.id, size: "M", sku: `LIFECYCLE-${suffix}`, priceInPaise: 40000, stockQuantity: 5, isActive: true },
  });

  return { category, product };
}

describe("Complete category lifecycle (section 2)", () => {
  it("create -> assign product -> enable header -> set order: every surface reflects it", async () => {
    const { category, product } = await createCategoryWithProduct({ displayInHeader: true, headerOrder: 600 });

    const headerCategories = await getHeaderCategories();
    expect(headerCategories.some((c) => c.slug === category.slug)).toBe(true);

    const productsOnPage = await getGenericCategoryProducts(category.slug);
    expect(productsOnPage.map((p) => p.id)).toContain(product.id);
  });

  it("rename: header/footer/mobile (all sourced from getHeaderCategories) and the category page reflect the new name, product assignment survives", async () => {
    const suffix = randomUUID().slice(0, 8);
    const { category, product } = await createCategoryWithProduct({
      name: `School Uniforms ${suffix}`,
      displayInHeader: true,
      headerOrder: 601,
    });

    await db.category.update({ where: { id: category.id }, data: { name: `Uniforms ${suffix}` } });
    let headerCategories = await getHeaderCategories();
    expect(headerCategories.find((c) => c.slug === category.slug)?.name).toBe(`Uniforms ${suffix}`);

    // Section 8's own example: a second rename, same category, same slug.
    await db.category.update({ where: { id: category.id }, data: { name: `Dress ${suffix}` } });
    headerCategories = await getHeaderCategories();
    expect(headerCategories.find((c) => c.slug === category.slug)?.name).toBe(`Dress ${suffix}`);

    const byOldSlug = await getCategoryBySlug(category.slug);
    expect(byOldSlug?.name).toBe(`Dress ${suffix}`);

    const productsOnPage = await getGenericCategoryProducts(category.slug);
    expect(productsOnPage.map((p) => p.id)).toContain(product.id);
  });
});

describe("Hide / show (section 3)", () => {
  it("hiding removes it from getHeaderCategories WITHOUT deleting the category, its slug, or its product", async () => {
    const { category, product } = await createCategoryWithProduct({ displayInHeader: true, headerOrder: 602 });

    await db.category.update({ where: { id: category.id }, data: { displayInHeader: false } });

    const headerCategories = await getHeaderCategories();
    expect(headerCategories.some((c) => c.slug === category.slug)).toBe(false);

    // Section 3 — "hidden from navigation" vs. "does not exist": the
    // category row, its slug, and its product assignment all persist
    // untouched; only its header VISIBILITY changed.
    const stillExists = await getCategoryBySlug(category.slug);
    expect(stillExists).not.toBeNull();
    expect(stillExists?.id).toBe(category.id);

    const productsOnPage = await getGenericCategoryProducts(category.slug);
    expect(productsOnPage.map((p) => p.id)).toContain(product.id);

    await db.category.update({ where: { id: category.id }, data: { displayInHeader: true } });
    const headerCategoriesAfterReenable = await getHeaderCategories();
    expect(headerCategoriesAfterReenable.some((c) => c.slug === category.slug)).toBe(true);
  });

  it("a genuinely nonexistent category is indistinguishable from 'not found', never confused with 'hidden'", async () => {
    expect(await getCategoryBySlug(`does-not-exist-${randomUUID()}`)).toBeNull();
  });
});

describe("Ordering across all header-position scenarios (section 4)", () => {
  it("first, middle, and last position are all correctly reflected and re-orderable", async () => {
    const suffix = randomUUID().slice(0, 8);
    const a = await createCategoryWithProduct({ name: `Order A ${suffix}`, displayInHeader: true, headerOrder: 610 });
    const b = await createCategoryWithProduct({ name: `Order B ${suffix}`, displayInHeader: true, headerOrder: 611 });
    const c = await createCategoryWithProduct({ name: `Order C ${suffix}`, displayInHeader: true, headerOrder: 612 });

    let ordered = (await getHeaderCategories()).filter((x) => [a, b, c].some((y) => y.category.slug === x.slug));
    expect(ordered.map((x) => x.slug)).toEqual([a.category.slug, b.category.slug, c.category.slug]);

    // Move C to first position.
    await db.category.update({ where: { id: c.category.id }, data: { headerOrder: 609 } });
    ordered = (await getHeaderCategories()).filter((x) => [a, b, c].some((y) => y.category.slug === x.slug));
    expect(ordered.map((x) => x.slug)).toEqual([c.category.slug, a.category.slug, b.category.slug]);

    // Hide B, then re-enable it — it returns to ITS OWN configured position,
    // never appended or reshuffled relative to the others.
    await db.category.update({ where: { id: b.category.id }, data: { displayInHeader: false } });
    ordered = (await getHeaderCategories()).filter((x) => [a, b, c].some((y) => y.category.slug === x.slug));
    expect(ordered.map((x) => x.slug)).toEqual([c.category.slug, a.category.slug]);

    await db.category.update({ where: { id: b.category.id }, data: { displayInHeader: true } });
    ordered = (await getHeaderCategories()).filter((x) => [a, b, c].some((y) => y.category.slug === x.slug));
    expect(ordered.map((x) => x.slug)).toEqual([c.category.slug, a.category.slug, b.category.slug]);
  });
});

describe("Empty category (section 6)", () => {
  it("a header-visible category with zero products returns an empty array, never throws", async () => {
    const suffix = randomUUID().slice(0, 8);
    const category = await db.category.create({
      data: { name: `Empty Category ${suffix}`, slug: `empty-category-${suffix}`, displayInHeader: true, headerOrder: 620 },
    });
    createdCategoryIds.push(category.id);

    const headerCategories = await getHeaderCategories();
    expect(headerCategories.some((c) => c.slug === category.slug)).toBe(true);

    const products = await getGenericCategoryProducts(category.slug);
    expect(products).toEqual([]);
  });
});

describe("Data integrity (section 14) — category management never touches commerce history", () => {
  it("renaming, hiding, and reordering a category leaves its product's ALREADY-PLACED order snapshot byte-identical", async () => {
    await ensureAdmin();
    const suffix = randomUUID().slice(0, 8);
    const category = await db.category.create({
      data: { name: `Integrity Category ${suffix}`, slug: `integrity-category-${suffix}`, displayInHeader: true, headerOrder: 630 },
    });
    createdCategoryIds.push(category.id);
    const product = await db.product.create({
      data: { slug: `integrity-product-${suffix}`, name: `Integrity Product ${suffix}`, categoryId: category.id },
    });
    createdProductIds.push(product.id);
    const variant = await db.productVariant.create({
      data: { productId: product.id, size: "M", sku: `INTEGRITY-${suffix}`, priceInPaise: 55000, stockQuantity: 5 },
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
    const order = await db.order.findUniqueOrThrow({ where: { orderNumber: sale.orderNumber }, include: { items: true } });
    createdOrderIds.push(order.id);
    const orderItemBefore = order.items[0]!;

    // Every category-management mutation this phase exposes, all at once.
    await db.category.update({
      where: { id: category.id },
      data: { name: `Renamed Integrity Category ${suffix}`, displayInHeader: false, headerOrder: 999 },
    });

    const orderAfter = await db.order.findUniqueOrThrow({ where: { id: order.id }, include: { items: true } });
    const orderItemAfter = orderAfter.items[0]!;

    expect(orderItemAfter).toEqual(orderItemBefore);
    expect(orderAfter.totalInPaise).toBe(order.totalInPaise);
    expect(orderAfter.status).toBe(order.status);
    // The OrderItem's own snapshot fields — never re-derived from the
    // category or product it (still) points to.
    expect(orderItemAfter.productName).toBe(product.name);
    expect(orderItemAfter.unitPriceInPaise).toBe(55000);
  });
});
