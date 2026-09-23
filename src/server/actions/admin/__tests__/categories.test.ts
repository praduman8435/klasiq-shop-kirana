import { randomUUID } from "node:crypto";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

// Same real in-memory cookie-store mock as every other admin action test
// this session (returns.test.ts, invoice.test.ts) — exercises the REAL
// getAdminSession()/createAdminSession() code, not a stubbed session.
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
import {
  createCategoryAction,
  deleteCategoryAction,
  updateCategoryAction,
} from "@/server/actions/admin/categories";

const createdAdminIds: string[] = [];
const createdCategoryIds: string[] = [];
const createdProductIds: string[] = [];

beforeEach(() => {
  store.clear();
});

afterAll(async () => {
  if (createdProductIds.length) await db.product.deleteMany({ where: { id: { in: createdProductIds } } });
  if (createdCategoryIds.length) await db.category.deleteMany({ where: { id: { in: createdCategoryIds } } });
  if (createdAdminIds.length) await db.adminUser.deleteMany({ where: { id: { in: createdAdminIds } } });
  await db.$disconnect();
});

async function signInAsAdmin() {
  const admin = await db.adminUser.create({
    data: {
      name: "Test Categories Action Admin",
      email: `test-categories-action-${randomUUID()}@example.com`,
      passwordHash: "unused:unused",
    },
  });
  createdAdminIds.push(admin.id);
  await createAdminSession(admin.id);
}

function freshName(label: string) {
  return `${label} ${randomUUID().slice(0, 8)}`;
}

async function createDirectly(overrides: Partial<{ name: string; slug: string; displayInHeader: boolean; headerOrder: number }> = {}) {
  const suffix = randomUUID().slice(0, 8);
  const category = await db.category.create({
    data: {
      name: overrides.name ?? freshName("Direct"),
      slug: overrides.slug ?? `direct-${suffix}`,
      displayInHeader: overrides.displayInHeader ?? false,
      headerOrder: overrides.headerOrder ?? 0,
    },
  });
  createdCategoryIds.push(category.id);
  return category;
}

describe("createCategoryAction", () => {
  it("returns UNAUTHORIZED without an admin session", async () => {
    const result = await createCategoryAction({ name: "Stationery", slug: `stationery-${randomUUID()}` });
    expect(result).toEqual({ success: false, error: { type: "UNAUTHORIZED", message: expect.any(String) } });
  });

  it("creates a category hidden from the header by default", async () => {
    await signInAsAdmin();
    const name = freshName("New Category");
    const slug = `new-category-${randomUUID()}`;
    const result = await createCategoryAction({ name, slug });
    expect(result).toEqual({ success: true });

    const created = await db.category.findUniqueOrThrow({ where: { slug } });
    createdCategoryIds.push(created.id);
    expect(created.displayInHeader).toBe(false);
    expect(created.headerOrder).toBe(0);
  });

  it("section 7 — creates a category already shown in the header at a given position", async () => {
    await signInAsAdmin();
    const name = freshName("Stationery");
    const slug = `stationery-${randomUUID()}`;
    const result = await createCategoryAction({ name, slug, displayInHeader: true, headerOrder: 900 });
    expect(result).toEqual({ success: true });

    const created = await db.category.findUniqueOrThrow({ where: { slug } });
    createdCategoryIds.push(created.id);
    expect(created.displayInHeader).toBe(true);
    expect(created.headerOrder).toBe(900);
  });

  it("rejects a duplicate slug", async () => {
    await signInAsAdmin();
    const existing = await createDirectly();
    const result = await createCategoryAction({ name: freshName("Other"), slug: existing.slug });
    expect(result).toEqual({ success: false, error: { type: "CONFLICT", message: expect.any(String) } });
  });

  it("section 11 — rejects a duplicate name, case-insensitively", async () => {
    await signInAsAdmin();
    const existing = await createDirectly({ name: freshName("Uniforms Test Dup") });
    const result = await createCategoryAction({ name: existing.name.toLowerCase(), slug: `dup-${randomUUID()}` });
    expect(result).toEqual({ success: false, error: { type: "CONFLICT", message: expect.any(String) } });
  });

  it("section 11 — rejects a headerOrder already used by another header-displayed category", async () => {
    await signInAsAdmin();
    const existing = await createDirectly({ displayInHeader: true, headerOrder: 950 });
    const result = await createCategoryAction({
      name: freshName("Conflict"),
      slug: `conflict-${randomUUID()}`,
      displayInHeader: true,
      headerOrder: 950,
    });
    expect(result).toEqual({
      success: false,
      error: { type: "CONFLICT", message: expect.stringContaining(existing.name) },
    });
  });

  it("allows the SAME headerOrder value when the existing category is hidden from the header", async () => {
    await signInAsAdmin();
    await createDirectly({ displayInHeader: false, headerOrder: 960 });
    const slug = `no-conflict-${randomUUID()}`;
    const result = await createCategoryAction({
      name: freshName("No Conflict"),
      slug,
      displayInHeader: true,
      headerOrder: 960,
    });
    expect(result).toEqual({ success: true });
    const created = await db.category.findUniqueOrThrow({ where: { slug } });
    createdCategoryIds.push(created.id);
  });

  it("rejects an empty name", async () => {
    await signInAsAdmin();
    const result = await createCategoryAction({ name: "", slug: `empty-${randomUUID()}` });
    expect(result).toEqual({ success: false, error: { type: "VALIDATION", message: expect.any(String) } });
  });
});

describe("updateCategoryAction — rename (section 4/5)", () => {
  it("renaming (Name only) never touches the slug", async () => {
    await signInAsAdmin();
    const suffix = randomUUID().slice(0, 8);
    const category = await createDirectly({ name: `School Uniforms ${suffix}` });

    // Section 4's own example: School Uniforms -> Uniforms -> Dress.
    const renamed = await updateCategoryAction({
      id: category.id,
      name: `Uniforms ${suffix}`,
      slug: category.slug,
      displayInHeader: category.displayInHeader,
      headerOrder: category.headerOrder,
    });
    expect(renamed).toEqual({ success: true });

    const afterFirstRename = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(afterFirstRename.name).toBe(`Uniforms ${suffix}`);
    expect(afterFirstRename.slug).toBe(category.slug);

    const renamedAgain = await updateCategoryAction({
      id: category.id,
      name: `Dress ${suffix}`,
      slug: category.slug,
      displayInHeader: category.displayInHeader,
      headerOrder: category.headerOrder,
    });
    expect(renamedAgain).toEqual({ success: true });

    const afterSecondRename = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(afterSecondRename.name).toBe(`Dress ${suffix}`);
    expect(afterSecondRename.slug).toBe(category.slug);
  });

  it("an explicit slug change is allowed and persists", async () => {
    await signInAsAdmin();
    const category = await createDirectly();
    const newSlug = `${category.slug}-renamed`;

    const result = await updateCategoryAction({
      id: category.id,
      name: category.name,
      slug: newSlug,
      displayInHeader: category.displayInHeader,
      headerOrder: category.headerOrder,
    });
    expect(result).toEqual({ success: true });
    const updated = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(updated.slug).toBe(newSlug);
  });

  it("rejects a slug change to one already in use by a different category", async () => {
    await signInAsAdmin();
    const category = await createDirectly();
    const other = await createDirectly();

    const result = await updateCategoryAction({
      id: category.id,
      name: category.name,
      slug: other.slug,
      displayInHeader: false,
      headerOrder: 0,
    });
    expect(result).toEqual({ success: false, error: { type: "CONFLICT", message: expect.any(String) } });
  });

  it("rejects renaming to a name already used by a different category, but allows keeping its own name", async () => {
    await signInAsAdmin();
    const category = await createDirectly({ name: freshName("Keep Mine") });
    const other = await createDirectly({ name: freshName("Taken") });

    const conflict = await updateCategoryAction({
      id: category.id,
      name: other.name,
      slug: category.slug,
      displayInHeader: false,
      headerOrder: 0,
    });
    expect(conflict).toEqual({ success: false, error: { type: "CONFLICT", message: expect.any(String) } });

    const keepOwnName = await updateCategoryAction({
      id: category.id,
      name: category.name,
      slug: category.slug,
      displayInHeader: false,
      headerOrder: 0,
    });
    expect(keepOwnName).toEqual({ success: true });
  });

  it("allows keeping its OWN headerOrder value (excludes self from the conflict check)", async () => {
    await signInAsAdmin();
    const category = await createDirectly({ displayInHeader: true, headerOrder: 970 });

    const result = await updateCategoryAction({
      id: category.id,
      name: category.name,
      slug: category.slug,
      displayInHeader: true,
      headerOrder: 970,
    });
    expect(result).toEqual({ success: true });
  });

  it("rejects a headerOrder that collides with a DIFFERENT header-displayed category", async () => {
    await signInAsAdmin();
    const category = await createDirectly({ displayInHeader: true, headerOrder: 971 });
    const other = await createDirectly({ displayInHeader: true, headerOrder: 972 });

    const result = await updateCategoryAction({
      id: category.id,
      name: category.name,
      slug: category.slug,
      displayInHeader: true,
      headerOrder: 972,
    });
    expect(result).toEqual({
      success: false,
      error: { type: "CONFLICT", message: expect.stringContaining(other.name) },
    });
  });

  it("toggles displayInHeader off and on", async () => {
    await signInAsAdmin();
    const category = await createDirectly({ displayInHeader: true, headerOrder: 980 });

    await updateCategoryAction({
      id: category.id,
      name: category.name,
      slug: category.slug,
      displayInHeader: false,
      headerOrder: category.headerOrder,
    });
    let updated = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(updated.displayInHeader).toBe(false);

    await updateCategoryAction({
      id: category.id,
      name: category.name,
      slug: category.slug,
      displayInHeader: true,
      headerOrder: category.headerOrder,
    });
    updated = await db.category.findUniqueOrThrow({ where: { id: category.id } });
    expect(updated.displayInHeader).toBe(true);
  });

  it("returns NOT_FOUND for a nonexistent category id", async () => {
    await signInAsAdmin();
    const result = await updateCategoryAction({
      id: `does-not-exist-${randomUUID()}`,
      name: "Nonexistent Category",
      slug: `nonexistent-category-${randomUUID()}`,
      displayInHeader: false,
      headerOrder: 0,
    });
    expect(result).toEqual({ success: false, error: { type: "NOT_FOUND", message: expect.any(String) } });
  });
});

describe("deleteCategoryAction", () => {
  it("blocks deletion when the category has products", async () => {
    await signInAsAdmin();
    const category = await createDirectly();
    const product = await db.product.create({
      data: { slug: `test-cat-product-${randomUUID()}`, name: "Test Category Product", categoryId: category.id },
    });
    createdProductIds.push(product.id);

    const result = await deleteCategoryAction({ id: category.id });
    expect(result).toEqual({ success: false, error: { type: "CONFLICT", message: expect.any(String) } });
  });

  it("deletes a category with no products", async () => {
    await signInAsAdmin();
    const category = await createDirectly();
    const result = await deleteCategoryAction({ id: category.id });
    expect(result).toEqual({ success: true });
    expect(await db.category.findUnique({ where: { id: category.id } })).toBeNull();
    createdCategoryIds.splice(createdCategoryIds.indexOf(category.id), 1);
  });
});
