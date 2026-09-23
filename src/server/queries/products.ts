import { db } from "@/lib/db";

/**
 * Phase 3.7 Part 3 — the one query behind the standalone Product Detail
 * page (`/product/[slug]`). `Product.slug` (already unique, already the
 * existing public identifier this whole app links category pages,
 * search, and now this page with) is the ONLY input — there is no
 * category slug in this route at all, so there is nothing for a client
 * to "manipulate" to make a product appear to belong to a different
 * category: the product's own `categoryId` (via the `category` relation
 * below) is the sole source of truth for that, exactly as it already is
 * everywhere else in this codebase.
 *
 * A deactivated product resolves to `null` here — identical treatment to
 * every other public product query (`getGenericCategoryProducts`,
 * `searchGenericProducts`), which already never surface an inactive
 * product in a listing. A customer following a stale link to a since-
 * deactivated product sees the same 404 as an unknown slug, not a
 * "this item is no longer sold" page — consistent with how this app
 * already treats "not currently offered" everywhere else (Phase 3.6.7's
 * hide-vs-delete precedent is about *categories*, not products; nothing
 * in this codebase has ever exposed a deactivated product to a
 * customer, so this isn't a new restriction).
 *
 * Unlike the generic category/search queries, this is NOT restricted to
 * `schoolId: null` — a school-exclusive product has a perfectly real
 * detail page once a customer reaches it from its own school's catalog
 * page (`/school/[slug]`); only the generic *listing* queries exclude
 * school-exclusive products, never product-level access to one a
 * customer has legitimately been shown.
 */
export async function getProductBySlug(slug: string) {
  const product = await db.product.findUnique({
    where: { slug },
    include: {
      category: { select: { slug: true, name: true } },
      school: { select: { slug: true, name: true } },
      variants: {
        where: { isActive: true },
        orderBy: { sortOrder: "asc" },
      },
    },
  });

  if (!product || !product.isActive) return null;
  return product;
}

export type ProductDetail = NonNullable<Awaited<ReturnType<typeof getProductBySlug>>>;
