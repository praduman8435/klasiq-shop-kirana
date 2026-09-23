import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import {
  getSchoolAssignedProducts,
  getSchoolBySlug,
  searchSchools,
} from "@/server/queries/schools";
import { getGenericCategoryProducts } from "@/server/queries/categories";

// These tests run against the real seeded local Postgres (docker-compose).
// They exist because the query layer's filtering logic (in particular the
// combined class + gender filter) is exactly the kind of thing that looks
// right in isolation but silently returns the wrong rows when the
// conditions are combined incorrectly.

let sunriseSchoolId: string;

beforeAll(async () => {
  const school = await db.school.findUniqueOrThrow({
    where: { slug: "demo-sunrise-public-school" },
  });
  sunriseSchoolId = school.id;
});

afterAll(async () => {
  await db.$disconnect();
});

describe("searchSchools", () => {
  it("matches on a partial, case-insensitive name", async () => {
    const results = await searchSchools("sunrise");
    expect(results.some((s) => s.slug === "demo-sunrise-public-school")).toBe(true);
  });

  it("matches uppercase input against lowercase records", async () => {
    const results = await searchSchools("SUNRISE");
    expect(results.some((s) => s.slug === "demo-sunrise-public-school")).toBe(true);
  });

  it("returns nothing for a query shorter than 2 characters", async () => {
    expect(await searchSchools("s")).toEqual([]);
  });

  it("does not return the inactive demo school", async () => {
    const results = await searchSchools("Old Town");
    expect(results).toEqual([]);
  });
});

describe("getSchoolBySlug", () => {
  it("returns null for an unknown slug", async () => {
    expect(await getSchoolBySlug("does-not-exist-school")).toBeNull();
  });

  it("returns the school with its classes for a valid slug", async () => {
    const school = await getSchoolBySlug("demo-sunrise-public-school");
    expect(school?.name).toBe("Demo Sunrise Public School");
    expect(school?.classes.length).toBeGreaterThan(0);
  });
});

describe("getSchoolAssignedProducts", () => {
  it("includes school-wide items for any class when only gender is filtered", async () => {
    const products = await getSchoolAssignedProducts({
      schoolId: sunriseSchoolId,
      gender: "BOYS",
    });
    expect(products.some((p) => p.slug === "white-shirt")).toBe(true);
    expect(products.some((p) => p.slug === "grey-pant")).toBe(true);
  });

  it("only returns the girls' skirt for GIRLS, not BOYS", async () => {
    const boys = await getSchoolAssignedProducts({
      schoolId: sunriseSchoolId,
      gender: "BOYS",
    });
    const girls = await getSchoolAssignedProducts({
      schoolId: sunriseSchoolId,
      gender: "GIRLS",
    });
    expect(boys.some((p) => p.slug === "white-skirt")).toBe(false);
    expect(girls.some((p) => p.slug === "white-skirt")).toBe(true);
  });

  it("includes the class-scoped sweater only for the classes it's assigned to", async () => {
    const class1 = await db.schoolClass.findFirstOrThrow({
      where: { schoolId: sunriseSchoolId, name: "Class 1" },
    });
    const class7 = await db.schoolClass.findFirstOrThrow({
      where: { schoolId: sunriseSchoolId, name: "Class 7" },
    });

    const class1Products = await getSchoolAssignedProducts({
      schoolId: sunriseSchoolId,
      classId: class1.id,
      gender: "BOYS",
    });
    const class7Products = await getSchoolAssignedProducts({
      schoolId: sunriseSchoolId,
      classId: class7.id,
      gender: "BOYS",
    });

    // Sweater is seeded as assigned only to Nursery through Class 5.
    expect(class1Products.some((p) => p.slug === "sweater")).toBe(true);
    expect(class7Products.some((p) => p.slug === "sweater")).toBe(false);

    // But school-wide items still show up regardless of class.
    expect(class7Products.some((p) => p.slug === "white-shirt")).toBe(true);
  });

  it("de-duplicates a product that matches more than one assignment row", async () => {
    const class1 = await db.schoolClass.findFirstOrThrow({
      where: { schoolId: sunriseSchoolId, name: "Class 1" },
    });
    const products = await getSchoolAssignedProducts({
      schoolId: sunriseSchoolId,
      classId: class1.id,
      gender: "BOYS",
    });
    const shirtCount = products.filter((p) => p.slug === "white-shirt").length;
    expect(shirtCount).toBe(1);
  });
});

describe("getGenericCategoryProducts", () => {
  it("excludes school-specific products from the generic uniforms list", async () => {
    const products = await getGenericCategoryProducts("uniforms");
    expect(
      products.some((p) => p.slug === "demo-sunrise-embroidered-blazer"),
    ).toBe(false);
  });

  it("includes generic products reused across schools", async () => {
    const products = await getGenericCategoryProducts("uniforms");
    expect(products.some((p) => p.slug === "white-shirt")).toBe(true);
  });

  it("only returns products in the requested category", async () => {
    const shoes = await getGenericCategoryProducts("shoes");
    expect(shoes.every((p) => p.slug !== "white-shirt")).toBe(true);
  });
});
