-- AlterTable: header-navigation fields for Category (Phase 3.6.7 Part 1).
-- Both nullable-free with safe defaults — every existing row gets
-- displayInHeader=false, headerOrder=0, matching a category that was
-- never in the (previously hardcoded) header nav at all.
ALTER TABLE "categories" ADD COLUMN     "displayInHeader" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "headerOrder" INTEGER NOT NULL DEFAULT 0;

-- Data backfill: reproduce today's hardcoded header nav
-- (src/server/queries/categories.ts's now-removed NAV_CATEGORIES
-- constant) exactly, so the storefront header shows the identical four
-- links in the identical order the moment this migration applies — zero
-- visible regression. Matched by slug, not name (slugs are stable and
-- pre-date this phase; see "Slug strategy" in docs/PHASE_3_6_7_REPORT.md).
-- A slug with no matching row (e.g. a fresh database that never seeded
-- these categories) is simply a no-op update — never an error.
UPDATE "categories" SET "displayInHeader" = true, "headerOrder" = 0 WHERE "slug" = 'uniforms';
UPDATE "categories" SET "displayInHeader" = true, "headerOrder" = 1 WHERE "slug" = 'shoes';
UPDATE "categories" SET "displayInHeader" = true, "headerOrder" = 2 WHERE "slug" = 'socks';
UPDATE "categories" SET "displayInHeader" = true, "headerOrder" = 3 WHERE "slug" = 'school-bags';
