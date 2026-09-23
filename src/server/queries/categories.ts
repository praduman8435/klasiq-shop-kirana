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

/**
 * The "browse instead" escape hatch shown where a flow needs one category
 * to point at (e.g. the homepage hero's secondary CTA). Never a hardcoded
 * slug — the first header category from the live, admin-managed list, or
 * `null` only when no header categories exist at all (callers fall back
 * to the always-available /search page in that case).
 */
export function pickBrowseFallbackCategory(
  categories: BrowseFallbackCategory[],
): BrowseFallbackCategory | null {
  return categories[0] ?? null;
}

// Phase 3.7 Part 2 — this is a single small storefront (seed data tops
// out at a couple dozen products per category); a plain result cap is a
// sensible, honest bound against an abusive/unbounded query without
// building real pagination for a catalog that doesn't need it yet. See
// docs/PHASE_3_7_REPORT.md Part 2 "Performance".
const PRODUCT_RESULT_LIMIT = 60;

/**
 * THE shared query behind both category browsing (`getCategoryProducts`)
 * and cross-category product search (`searchProducts`) — one `where`
 * builder, never two parallel implementations of "which products match."
 * `query`, when given, matches product name, brand, OR description,
 * case-insensitively, via Prisma's parameterized `contains` — never raw
 * SQL, never string-concatenated into a query.
 */
async function findProducts(params: { categorySlug?: string; query?: string; limit?: number }) {
  const trimmedQuery = params.query?.trim();

  return db.product.findMany({
    where: {
      isActive: true,
      ...(params.categorySlug ? { category: { slug: params.categorySlug } } : {}),
      ...(trimmedQuery
        ? {
            OR: [
              { name: { contains: trimmedQuery, mode: "insensitive" } },
              { brand: { contains: trimmedQuery, mode: "insensitive" } },
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
    take: params.limit ?? PRODUCT_RESULT_LIMIT,
  });
}

/**
 * Products for a standalone category browse page (e.g. /snacks), with
 * an optional in-category search term (e.g. /snacks?q=biscuit — Phase
 * 3.7 Part 2). Category filtering and search are the SAME `where`
 * clause combined with AND, never a client-side post-filter — a search
 * inside "Snacks" can structurally never surface a "Beverages" product.
 * `limit` defaults to the real production cap; tests override it to
 * exercise the cap itself without seeding 60+ rows.
 */
export async function getCategoryProducts(categorySlug: string, query?: string, limit?: number) {
  return findProducts({ categorySlug, query, limit });
}

/**
 * Cross-category product search for the standalone /search page (Phase
 * 3.7 Part 2) — every active product/category, no category
 * constraint. Deliberately requires a non-empty `query` — returns `[]`
 * without ever touching the database for an empty/whitespace-only one;
 * there is no "browse everything" mode hiding behind an empty search
 * box, matching the /search page's own guard (defense in depth: true
 * even if a future caller invokes this directly without that page's
 * own truthy-check).
 */
export async function searchProducts(query: string, limit?: number) {
  if (!query.trim()) return [];
  return findProducts({ query, limit });
}

/**
 * Phase 3.7 Part 7 (homepage redesign) — a small, category-diverse sample
 * of real products for the homepage's "Shop the essentials" teaser.
 * Reuses `findProducts` (never a second parallel query), then prefers
 * one product per distinct category so a 5-item teaser doesn't
 * accidentally read as "5 atta packs" just because one aisle sorts first
 * alphabetically — filling any remaining slots from the same result set
 * if there aren't enough distinct categories. Every product returned is
 * real, active data; nothing here invents a product, price, or image.
 */
export async function getFeaturedProducts(limit = 5) {
  const pool = await findProducts({ limit: limit * 6 });

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
