import { db } from "@/lib/db";

/**
 * Phase 3.6.7 Part 1 — section 6's "the storefront header must become:
 * SELECT Categories WHERE DisplayInHeader = true ORDER BY HeaderOrder."
 * THE single source of truth for what the header nav shows, replacing
 * the previous hardcoded `NAV_CATEGORIES` constant. No caller of this
 * function needs to know a category's internal id — only what a link
 * needs (slug, name).
 *
 * Ties in `headerOrder` (shouldn't happen — see the admin action's own
 * conflict check) are broken by name for a deterministic, never-random
 * render order.
 */
export async function getHeaderCategories() {
  return db.category.findMany({
    where: { displayInHeader: true },
    orderBy: [{ headerOrder: "asc" }, { name: "asc" }],
    select: { slug: true, name: true },
  });
}

export async function getCategoryBySlug(slug: string) {
  return db.category.findUnique({ where: { slug } });
}

export type BrowseFallbackCategory = { slug: string; name: string };

const UNIFORM_LIKE_CATEGORY = /uniform/i;

/**
 * The "browse instead" escape hatch shown when a school search, or a
 * school's own gender/class selection, comes up empty. Never a hardcoded
 * slug — prefers a uniform-like category from the live, admin-managed
 * list (the natural adjacent aisle for this flow), falls back to the
 * first header category if none match, and `null` only when no header
 * categories exist at all (callers fall back to the always-available
 * /search page in that case). Keeps working if "Uniforms" is renamed,
 * hidden, or removed by the admin.
 */
export function pickBrowseFallbackCategory(
  categories: BrowseFallbackCategory[],
): BrowseFallbackCategory | null {
  return (
    categories.find(
      (c) => UNIFORM_LIKE_CATEGORY.test(c.slug) || UNIFORM_LIKE_CATEGORY.test(c.name),
    ) ??
    categories[0] ??
    null
  );
}

// Phase 3.7 Part 2 — this is a single small storefront (seed data tops
// out at a couple dozen products per category); a plain result cap is a
// sensible, honest bound against an abusive/unbounded query without
// building real pagination for a catalog that doesn't need it yet. See
// docs/PHASE_3_7_REPORT.md Part 2 "Performance".
const GENERIC_PRODUCT_RESULT_LIMIT = 60;

/**
 * THE shared query behind both category browsing (`getGenericCategoryProducts`)
 * and cross-category product search (`searchGenericProducts`) — one
 * `where` builder, never two parallel implementations of "which generic
 * products match." Only generic products are ever returned (`schoolId:
 * null`) — a parent browsing/searching without a selected school should
 * never see another school's exclusive product; this mirrors the
 * pre-existing rule `getGenericCategoryProducts` already enforced,
 * unchanged. `query`, when given, matches product name OR description,
 * case-insensitively, via Prisma's parameterized `contains` — never raw
 * SQL, never string-concatenated into a query.
 */
async function findGenericProducts(params: { categorySlug?: string; query?: string; limit?: number }) {
  const trimmedQuery = params.query?.trim();

  return db.product.findMany({
    where: {
      isActive: true,
      schoolId: null,
      ...(params.categorySlug ? { category: { slug: params.categorySlug } } : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { name: { contains: trimmedQuery, mode: "insensitive" } },
              { description: { contains: trimmedQuery, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: { name: "asc" },
    include: {
      variants: { where: { isActive: true }, orderBy: { sortOrder: "asc" } },
      category: { select: { slug: true, name: true } },
    },
    take: params.limit ?? GENERIC_PRODUCT_RESULT_LIMIT,
  });
}

/**
 * Products for a standalone category browse page (e.g. /uniforms), with
 * an optional in-category search term (e.g. /uniforms?q=shirt — Phase
 * 3.7 Part 2). Category filtering and search are the SAME `where`
 * clause combined with AND, never a client-side post-filter — a search
 * inside "Shoes" can structurally never surface a "Uniforms" product.
 * `limit` defaults to the real production cap; tests override it to
 * exercise the cap itself without seeding 60+ rows, mirroring
 * `searchSchools(query, limit)`'s own precedent.
 */
export async function getGenericCategoryProducts(categorySlug: string, query?: string, limit?: number) {
  return findGenericProducts({ categorySlug, query, limit });
}

/**
 * Cross-category product search for the standalone /search page (Phase
 * 3.7 Part 2) — every generic, active product/category, no category
 * constraint. Deliberately requires a non-empty `query` — returns `[]`
 * without ever touching the database for an empty/whitespace-only one;
 * there is no "browse everything" mode hiding behind an empty search
 * box, matching the /search page's own guard (defense in depth: true
 * even if a future caller invokes this directly without that page's
 * own truthy-check).
 */
export async function searchGenericProducts(query: string, limit?: number) {
  if (!query.trim()) return [];
  return findGenericProducts({ query, limit });
}

/**
 * Phase 3.7 Part 7 (homepage redesign) — a small, category-diverse sample
 * of real generic products for the homepage's "Shop the essentials"
 * teaser. Reuses `findGenericProducts` (never a second parallel query),
 * then prefers one product per distinct category so a 5-item teaser
 * doesn't accidentally read as "5 uniforms" just because uniforms sorts
 * first alphabetically — filling any remaining slots from the same
 * result set if there aren't enough distinct categories. Every product
 * returned is real, active, generic (schoolId: null) data; nothing here
 * invents a product, price, or image.
 */
export async function getFeaturedGenericProducts(limit = 5) {
  const pool = await findGenericProducts({ limit: limit * 6 });

  const seenCategories = new Set<string>();
  const diverse: typeof pool = [];
  for (const product of pool) {
    if (diverse.length >= limit) break;
    if (seenCategories.has(product.category.slug)) continue;
    seenCategories.add(product.category.slug);
    diverse.push(product);
  }
  if (diverse.length < limit) {
    for (const product of pool) {
      if (diverse.length >= limit) break;
      if (diverse.includes(product)) continue;
      diverse.push(product);
    }
  }
  return diverse;
}
