import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { getProductBySlug } from "@/server/queries/products";

const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];
const createdSchoolIds: string[] = [];

afterEach(async () => {
  if (createdProductIds.length) {
    await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
    createdProductIds.length = 0;
  }
  if (createdCategoryIds.length) {
    await db.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
    createdCategoryIds.length = 0;
  }
  if (createdSchoolIds.length) {
    await db.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    createdSchoolIds.length = 0;
  }
});

async function createCategory() {
  const suffix = randomUUID().slice(0, 8);
  const category = await db.category.create({
    data: { name: `Test Category ${suffix}`, slug: `test-category-${suffix}` },
  });
  createdCategoryIds.push(category.id);
  return category;
}

async function createSchool() {
  const suffix = randomUUID().slice(0, 8);
  const school = await db.school.create({
    data: { slug: `test-school-${suffix}`, name: `Test School ${suffix}` },
  });
  createdSchoolIds.push(school.id);
  return school;
}

async function createProduct(params: {
  categoryId: string;
  name?: string;
  description?: string | null;
  schoolId?: string;
  isActive?: boolean;
  variants?: { size: string; priceInPaise?: number; stockQuantity?: number; isActive?: boolean; sortOrder?: number }[];
}) {
  const suffix = randomUUID().slice(0, 10);
  const product = await db.product.create({
    data: {
      slug: `test-product-${suffix}`,
      name: params.name ?? "Test Product",
      description: params.description ?? null,
      categoryId: params.categoryId,
      schoolId: params.schoolId ?? null,
      isActive: params.isActive ?? true,
      variants: {
        create: (params.variants ?? [{ size: "M" }]).map((v, index) => ({
          size: v.size,
          sku: `TEST-SKU-${suffix}-${index}`,
          priceInPaise: v.priceInPaise ?? 10000,
          stockQuantity: v.stockQuantity ?? 5,
          isActive: v.isActive ?? true,
          sortOrder: v.sortOrder ?? index,
        })),
      },
    },
  });
  createdProductIds.push(product.id);
  return product;
}

describe("getProductBySlug — Phase 3.7 Part 3 Product Detail query", () => {
  it("returns the product with its category, variants, and no school for a generic product", async () => {
    const category = await createCategory();
    const product = await createProduct({ categoryId: category.id, name: "White Shirt" });

    const found = await getProductBySlug(product.slug);
    expect(found?.id).toBe(product.id);
    expect(found?.name).toBe("White Shirt");
    expect(found?.category.slug).toBe(category.slug);
    expect(found?.school).toBeNull();
    expect(found?.variants).toHaveLength(1);
  });

  it("returns null for an unknown slug", async () => {
    expect(await getProductBySlug(`does-not-exist-${randomUUID()}`)).toBeNull();
  });

  it("returns null for a deactivated product — identical to an unknown slug", async () => {
    const category = await createCategory();
    const product = await createProduct({ categoryId: category.id, isActive: false });

    expect(await getProductBySlug(product.slug)).toBeNull();
  });

  it("returns the product with an empty variants array when it has no variants at all — never crashes", async () => {
    const category = await createCategory();
    const suffix = randomUUID().slice(0, 10);
    const product = await db.product.create({
      data: { slug: `test-product-${suffix}`, name: "No Variants Product", categoryId: category.id },
    });
    createdProductIds.push(product.id);

    const found = await getProductBySlug(product.slug);
    expect(found).not.toBeNull();
    expect(found?.variants).toEqual([]);
  });

  it("excludes deactivated variants but keeps active ones, sorted by sortOrder", async () => {
    const category = await createCategory();
    const product = await createProduct({
      categoryId: category.id,
      variants: [
        { size: "L", sortOrder: 1 },
        { size: "S", sortOrder: 0 },
        { size: "XL", sortOrder: 2, isActive: false },
      ],
    });

    const found = await getProductBySlug(product.slug);
    expect(found?.variants.map((v) => v.size)).toEqual(["S", "L"]);
  });

  it("resolves a school-exclusive product and includes the school", async () => {
    const category = await createCategory();
    const school = await createSchool();
    const product = await createProduct({ categoryId: category.id, name: "Exclusive Blazer", schoolId: school.id });

    const found = await getProductBySlug(product.slug);
    expect(found?.school?.slug).toBe(school.slug);
    expect(found?.school?.name).toBe(school.name);
  });

  it("always reflects the product's own real category — there is no category input to this query at all", async () => {
    // The route this backs (`/product/[slug]`) has no category segment;
    // this proves the category shown is intrinsic to the product record,
    // never derived from or checked against anything a client supplied.
    const categoryA = await createCategory();
    const categoryB = await createCategory();
    const product = await createProduct({ categoryId: categoryA.id, name: "Item In A" });

    const found = await getProductBySlug(product.slug);
    expect(found?.category.slug).toBe(categoryA.slug);
    expect(found?.category.slug).not.toBe(categoryB.slug);
  });

  it("returns name/description containing HTML/script-shaped text completely unmodified — escaping is a render-time concern, never a storage/query one", async () => {
    const category = await createCategory();
    const dangerousName = "<script>alert(1)</script>";
    const dangerousDescription = '"><img src=x onerror=alert(1)>';
    const product = await createProduct({
      categoryId: category.id,
      name: dangerousName,
      description: dangerousDescription,
    });

    const found = await getProductBySlug(product.slug);
    expect(found?.name).toBe(dangerousName);
    expect(found?.description).toBe(dangerousDescription);
  });
});
