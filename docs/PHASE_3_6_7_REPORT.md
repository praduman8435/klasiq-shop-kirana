# Phase 3.6.7 — Dynamic Storefront Categories & Header Navigation

## Part 1 — Dynamic Category Navigation

Date: 2026-08-10

Replaces the hardcoded storefront header (a `NAV_CATEGORIES` constant
listing four fixed slug/label pairs) with a header generated entirely
from the existing `Category` model. No second "Navigation" table was
introduced — Categories themselves are now the single source of truth
for what the header shows, in what order, exactly per section 2's
instruction. Icons, mega menus, dropdowns, CMS, homepage banners, footer
management, SEO management, and announcement bars remain explicitly out
of scope (section 16).

## Audit of the existing implementation (before writing any code)

- **`docs/PHASE_3_6_6_REPORT.md`** and **`docs/PHASE_3_6_5_REPORT.md`** —
  read in full per the brief's own instruction, primarily to re-confirm
  this session's established conventions (Server Action shape, admin
  action authorization/validation/conflict pattern, real-Postgres testing
  convention, fresh-database regression discipline) rather than for
  category-specific content — neither phase touched categories.
- **`prisma/schema.prisma`** — `Category` already had `slug` (`@unique`),
  `name`, `description`, `sortOrder` (auto-incremented on creation, used
  only for the admin list's own order), and `parentId` (an unused
  hierarchy hook, `Category`/`children` self-relation, no code anywhere
  reads it). No `displayInHeader`/header-position concept existed at all.
- **`src/server/queries/categories.ts`** — found the actual hardcoded
  source: `NAV_CATEGORIES = [{slug:"uniforms", label:"School Uniforms"},
  ...]`, a plain constant, plus `getCategoryBySlug`/`getGenericCategoryProducts`
  (both already real, DB-backed, reusable functions).
- **`src/components/site/header.tsx`**, **`mobile-nav.tsx`**, and
  **`footer.tsx`** — all three imported `NAV_CATEGORIES` directly (the
  footer's own "Shop" link list was a THIRD consumer of the same hardcoded
  constant, found only by grep — not obvious from reading the header
  component alone). `SiteHeader`/`SiteFooter` were already plain Server
  Components (no `"use client"`); `MobileNav` is a Client Component and
  so cannot fetch data itself.
- **`src/app/(site)/uniforms|shoes|socks|school-bags/page.tsx`** — four
  separate, near-identical `page.tsx` files, each hardcoding its own
  title/description string AND its own literal `categorySlug` argument to
  `getGenericCategoryProducts`. Confirmed these are genuinely
  top-level, literal-folder routes (not a `[slug]`-style dynamic segment
  anywhere) — the concrete architectural gap section 7 asks this phase
  to close: a brand-new category has nowhere to route to without a new
  file, which is exactly "code changes"/"redeployment" section 7
  forbids.
- **`src/app/sitemap.ts`** — also imported `NAV_CATEGORIES` (a fourth
  consumer, found by the same grep) to list the four category URLs.
- **`src/app/(site)/page.tsx`** (homepage) — an `ESSENTIAL_CATEGORIES`
  array with its own hardcoded `label`, a curated marketing `description`
  distinct from `Category.description`, and a hand-picked `lucide-react`
  icon per category — a fifth, independent occurrence of a category name
  string, and the one place icons genuinely appear in this codebase
  (confirming section 16's icon exclusion is about not ADDING icon
  support, not about this pre-existing, separate homepage section).
- **`src/components/admin/category-manager.tsx`**, **`src/lib/validation/admin-categories.ts`**,
  **`src/server/actions/admin/categories.ts`**, **`src/server/queries/admin/categories.ts`**
  — read in full. Rename (editing Name) ALREADY existed via
  `updateCategoryAction`, and critically, the edit form already keeps
  `name`/`slug` as two fully independent input states with no
  auto-derivation on edit (unlike the CREATE form, which auto-slugifies
  the name until the admin manually edits the slug field) — meaning
  section 5's "changing the name must never automatically break URLs"
  was, in effect, **already true before this phase**, just never
  verified by a test or documented as a deliberate guarantee. No
  duplicate-name or duplicate-header-order concept existed, since neither
  "header order" nor "duplicate name" had any prior meaning.
- **`src/components/product/product-placeholder-image.tsx`** — a
  `CATEGORY_ICON` lookup keyed by slug with an existing, already-correct
  fallback (`?? Shirt`) for an unrecognized slug — confirmed a brand-new
  category needs no change here to render without crashing (icons stay
  out of scope; a generic fallback icon is not "adding an icon feature").
- **`src/app/(site)/school/[slug]/page.tsx`**, **`not-found.tsx`**,
  **`src/components/site/school-search.tsx`** — each has a hardcoded
  fallback link to `/uniforms` with generic copy ("browse generic uniform
  essentials") — a hardcoded ASSUMPTION that a category with slug
  `uniforms` exists, not a category NAME occurrence (the visible link
  text never repeats the category's actual name) — so section 4's
  rename-propagation requirement doesn't apply to these three call sites;
  documented as a known, pre-existing, out-of-scope assumption below,
  tied to slug stability (section 5), which this phase's own design
  preserves.
- Grepped the entire `src/` tree for `NAV_CATEGORIES` and for the four
  literal slugs as string constants to confirm every occurrence above was
  found — five real consumers of the hardcoded constant (header, mobile
  nav, footer, sitemap, and — via a duplicated array, not the constant
  itself — the homepage).

## Architecture — Categories are the storefront navigation (sections 1, 2)

No new table. Exactly two new columns on the existing `Category` model
(see "Category fields" below), one new query (`getHeaderCategories`),
and one new page (`src/app/(site)/[categorySlug]/page.tsx`) replacing
four hardcoded ones. Every storefront consumer of "what categories exist
in the header" — `SiteHeader`, `MobileNav`, `SiteFooter` — now calls the
same `getHeaderCategories()` function; there is no second list anywhere.

## Category fields (section 3)

Two new columns, both with safe, non-breaking defaults:

- **`displayInHeader Boolean @default(false)`** — whether this category
  is a header link. Defaults false so a brand-new category never
  unexpectedly clutters the header — an admin opts in explicitly,
  exactly matching section 7's own example flow (create, then enable).
- **`headerOrder Int @default(0)`** — position among header-displayed
  categories only. Deliberately a NEW, separate field from the existing
  `sortOrder` (the admin category list's own auto-incremented order),
  not a repurposing of it — `sortOrder` answers "what order does the
  admin panel list categories in" (assigned automatically on creation,
  never edited); `headerOrder` answers a genuinely different question,
  "what position does this take in the PUBLIC-facing header," which an
  admin actively curates and which has no reason to match the admin
  list's own, incidental creation order. Meaningless (never read by any
  query) while `displayInHeader` is false.

No other field was added — no icon, no parent-aware mega-menu structure,
no separate "navigation label" distinct from `name` (see "Rename" below
for why `name` alone is correct) — matching section 3's "avoid
unnecessary metadata."

## Rename (section 4) — already-correct behavior, now verified and propagated everywhere

Renaming a Category (editing only its `name`) required no new
capability — `updateCategoryAction` already supported it. What this
phase did:

1. **Verified, by test, that rename never touches the slug.** The admin
   edit form's `name`/`slug` fields were already independent React state
   with no auto-derivation on edit (only the CREATE form auto-slugifies).
   A dedicated test (`categories.test.ts`) proves the exact example in
   section 4 — "School Uniforms" → "Uniforms" → "Dress" — leaves the
   slug byte-identical across both renames.
2. **Found and fixed every place a category NAME was duplicated as a
   hardcoded string, independent of the real `Category.name`** — the
   concrete, genuine defect this section's audit exists to catch. Five
   consumers were hardcoding or duplicating names: the header, mobile
   nav, and footer (all via the single now-removed `NAV_CATEGORIES`
   constant — fixed by deleting it and reading `getHeaderCategories()`
   live, every request); the four now-deleted static category pages
   (fixed by deleting them — the new `[categorySlug]/page.tsx` reads
   `category.name` live); and the homepage's `ESSENTIAL_CATEGORIES` tile
   grid (fixed narrowly — see "Homepage tiles" below).
3. **A real, pre-existing name/label drift was directly observed and
   corrected by this fix**: the seeded "uniforms" category's actual
   `name` is `"School Uniforms"` in the shared dev database, but the
   OLD hardcoded `NAV_CATEGORIES` label already differed from at least
   one place it was compared against — this phase's own manual
   verification confirmed the header now correctly shows the category's
   real, current name everywhere, which is the intended and correct
   outcome of eliminating the hardcoded duplicate, not a bug.

### Homepage tiles — a deliberately narrow fix, not new homepage-management scope

The homepage's "Or shop essentials" section is a curated marketing tile
grid (icon + short marketing blurb per tile) — genuinely NOT the header
nav sections 1-9 are about, and section 16 explicitly excludes
icons/homepage banners from this phase. But its `label` field WAS a
literal, hardcoded category name with no connection to the real
`Category.name` — a real, in-scope occurrence per section 4's own
"review every place Category names appear." Fixed minimally:
`resolveEssentialCategoryTiles()` (`src/app/(site)/page.tsx`) looks up
the same four categories by slug and uses each one's live `name` for
`label` only — the icon and marketing blurb remain exactly the curated,
hardcoded content they always were; a tile is quietly omitted if its
category no longer exists, rather than showing a broken link. This adds
no new admin capability and does not turn the homepage into an
admin-configurable surface — it only stops one specific, real string
from silently drifting out of sync with an actual rename.

## Slug strategy (section 5)

**Decision: slugs remain stable and are only ever changed by an explicit,
independent edit — never inferred from a name change.** Reasoning:

- The admin edit form already keeps Name and Slug as two separate inputs
  with no synchronization on edit (only the CREATE form auto-derives a
  slug from the name, and only until the admin's first manual edit to
  the slug field) — renaming (editing only Name) is structurally
  incapable of touching the slug, proven directly by test.
- The storefront's URLs (`/uniforms`, `/shoes`, etc., and now any
  category's own `/{slug}`) are keyed on slug, never on name — this is
  precisely what section 5 protects: a rename can never silently 404 an
  existing, possibly-bookmarked or search-indexed URL.
- Changing a slug is still possible (a real, if rare, admin action —
  e.g. fixing a typo made at creation) and is validated identically to
  before (format-checked, uniqueness-checked, excluding the row being
  edited) — nothing about slug-editing itself changed; only the
  header-relevant fields were added alongside it. A short caption was
  added next to the Slug field in the edit form ("Changing the slug
  changes this category's storefront URL — leave it as-is when only
  renaming") — the one small, genuinely helpful admin-UI change this
  section's own reasoning calls for, not a new validation rule.

## Header generation (sections 6, 7)

`getHeaderCategories()` (`src/server/queries/categories.ts`) is section
6's own SQL translated literally:

```ts
db.category.findMany({
  where: { displayInHeader: true },
  orderBy: [{ headerOrder: "asc" }, { name: "asc" }],
  select: { slug: true, name: true },
});
```

(`name: "asc"` only breaks a `headerOrder` TIE — which the admin action's
own conflict check, below, prevents from ever legitimately occurring —
purely for deterministic rendering, never randomness.) `SiteHeader`
(desktop nav) and `SiteFooter` ("Shop" links) are both now `async` Server
Components calling this directly; `MobileNav` (a Client Component)
receives the identical, already-fetched array as a prop from
`SiteHeader` — one query per request, three renderers, never a second
list.

**Section 7's full workflow — create a category, enable "Display in
Header," set an order, save, and the header shows it — requires zero
code changes and no redeploy**, proven directly: a manual verification
script created a real "Stationery" category with `displayInHeader: true`
against a live dev server and confirmed the running (already-started,
not restarted) server's header immediately included it, in the correct
position, with its own working category page.

## Product routing (section 8)

**`src/app/(site)/[categorySlug]/page.tsx`** (new) is now the single
category browse page for every category — generic and brand-new alike —
replacing the four individually-hardcoded page files it deletes. It
looks up the category by slug (`getCategoryBySlug`, unchanged), 404s via
`notFound()` for an unknown slug, and renders `CategoryProductGrid` with
the SAME `getGenericCategoryProducts(category.slug)` call the four old
pages already used — section 8's "reuse existing behavior" satisfied
literally, not reimplemented.

Next.js's own routing precedence makes this safe: a literal, same-level
static folder (`bag/`, `checkout/`, `school/`, `track/`, `order/`)
always wins over the dynamic `[categorySlug]` sibling for its own exact
path — this new route only ever handles a slug that ISN'T one of those.
An unmatched slug (typo or genuinely nonexistent category) 404s exactly
like any other unmatched path did before this phase.

## Existing data / migration (section 9)

New migration `20260810100000_phase3_6_7_part1_header_categories`: two
plain, defaulted `ALTER TABLE` column additions (every existing row
gets `displayInHeader=false, headerOrder=0` — a category that was never
in the old hardcoded header at all), plus a data backfill reproducing
today's exact header — `uniforms`/`shoes`/`socks`/`school-bags` set to
`displayInHeader=true` with `headerOrder` 0/1/2/3 respectively, matched
by slug. Applied to the shared dev database; confirmed the header shows
the identical four categories in the identical order immediately
afterward — zero manual cleanup, zero product reassignment, per section
9's own requirements.

### A genuine gap found and fixed during this phase's own fresh-database regression check

The migration's backfill `UPDATE ... WHERE slug = 'uniforms'` (etc.) is
a **no-op on a genuinely fresh database**, because migrations always
apply before `prisma/seed.ts` ever inserts a row — the categories table
is empty at the exact moment the backfill runs. This was not a
hypothetical: running this phase's own fresh-database verification
(create a throwaway database, `migrate deploy`, `seed.ts`,
`create-admin.ts`) surfaced it directly — the four seeded categories
came back with `displayInHeader: false` on a truly fresh install,
meaning a NEW deployment following the exact same steps as production
setup would launch with an EMPTY header. Fixed by adding
`displayInHeader: true, headerOrder: 0/1/2/3` to the `create` branch
(never the `update` branch) of `seed.ts`'s existing four `category.upsert`
calls — first-creation-only, exactly like `sortOrder` in the same
upserts, so re-running seed against a database an admin has since
reconfigured can never silently overwrite their real choices. Re-ran the
fresh-database check afterward: the four categories now correctly come
up `displayInHeader: true` with the intended order, and the full
927-test suite passes against that same fresh database. This is
recorded here, not hidden, per this session's own standing discipline of
disclosing every real defect found during its own regression work.

## Admin UI (section 10)

`CategoryManager`/`CategoryEditForm` (`src/components/admin/category-manager.tsx`)
gained exactly the three controls section 10 asks for, nothing more:

- **Rename** — already existed (the Name field); unchanged.
- **Display in Header** — a plain checkbox.
- **Header Order** — a plain number input, shown unconditionally
  (whether or not the category is currently header-visible) rather than
  conditionally hidden — it's simply inert data when hidden, and
  conditional show/hide would be UI complexity this field's own
  harmlessness doesn't justify.

Both controls appear on BOTH the create form and the edit form (matching
section 7's own literal example, which shows them as part of one
create-and-save flow, not a two-step create-then-edit). Each category
row now also shows its current header status ("In header · position N"
or "Hidden from header") — the smallest possible addition to make the
new state visible in the existing list, not a new page or view.

## Validation (section 11)

- **Empty names / invalid slugs**: unchanged, already enforced
  (`categoryFormSchema`'s existing `.min(2)`/slug regex).
- **Duplicate header order conflicts**: prevented at the Server Action
  layer (`findHeaderOrderConflict`, `src/server/actions/admin/categories.ts`),
  scoped to OTHER categories that are ALSO currently `displayInHeader:
  true` — a hidden category's stale `headerOrder` value can never
  conflict with anything, since it's never read. Deliberately an
  application-level check (mirroring how slug-uniqueness is already
  surfaced as a friendly `CONFLICT` message rather than relying solely on
  a raw DB constraint error), not a partial/filtered unique index — a
  Postgres partial unique index would need hand-written raw SQL outside
  Prisma's schema syntax for a property (`WHERE displayInHeader = true`)
  that a plain `@@unique` can't express, and the simpler, already-proven
  "guarded check + friendly conflict message" pattern this codebase uses
  everywhere else does the same job with less new surface area. The
  conflict message names the OTHER category holding that position (e.g.
  `Header order 2 is already used by "Shoes".`), never a bare "conflict."
- **Duplicate display names — reviewed, decision: NOT allowed
  (case-insensitive).** A category's `name` is the literal text a
  shopper reads as a header/footer link and an admin reads in the
  category list — two categories sharing one name would be a real,
  avoidable point of confusion in both places (which "Uniforms" did a
  customer just click?), unlike the slug, which was already the
  enforced-unique true identity underneath. Enforced the same way as the
  header-order check: a guarded lookup (`findNameConflict`,
  case-insensitive, excluding the row being edited) returning a friendly
  `CONFLICT`, not a new DB constraint.

## Accessibility (section 12)

- **Storefront nav**: unchanged markup shape — `<nav aria-label="Categories">`
  wrapping `<Link>` elements existed before this phase and still does;
  only the DATA feeding it changed (live query vs. hardcoded array), so
  every existing accessibility property (labelled nav landmark,
  keyboard-focusable links, visible focus states from the shared
  `hover:`/focus-visible Tailwind utilities already in use) is unchanged
  by construction. No genuine issue was found in the header, mobile nav,
  or footer.
- **Admin Category editor**: the new checkbox and number input both use
  a real `<label htmlFor>` association (`HeaderVisibilityFields`) rather
  than a bare placeholder or adjacent unlabelled text — the one genuine
  gap a fresh read of the new controls surfaced (the OLD form's plain
  `<Input placeholder="Name">`-style inputs already lacked explicit
  `<label>` elements too, an existing, unrelated pattern this phase did
  not expand scope to fix, since neither Name nor Slug are new this
  phase). No other genuine issue was found.

## Testing (section 13)

- **`src/lib/validation/__tests__/admin-categories.test.ts`** (new, 10
  tests): empty/whitespace-only name rejected; invalid slug shapes
  (uppercase, spaces, leading/trailing hyphen) rejected;
  `displayInHeader`/`headerOrder` default correctly when omitted; an
  explicit value round-trips; negative/non-integer `headerOrder`
  rejected; a string `headerOrder` (as a real form submission would send)
  is coerced to a number; `createCategorySchema`/`updateCategorySchema`
  shape (the latter requires an `id`).
- **`src/server/queries/__tests__/categories.test.ts`** (new, 6 tests,
  real Postgres): `getHeaderCategories` returns only
  `displayInHeader: true` rows; orders by `headerOrder` ascending;
  breaks a tie by name deterministically; returns only `slug`/`name`
  (never an internal id); `getCategoryBySlug` for a real and an unknown
  slug.
- **`src/server/actions/admin/__tests__/categories.test.ts`** (new, 18
  tests, real Postgres, the established admin-action cookie-session
  convention): `createCategoryAction` — unauthorized without a session;
  creates hidden-by-default; creates already header-visible at a given
  position (section 7); rejects a duplicate slug; rejects a duplicate
  name case-insensitively; rejects a colliding `headerOrder` among
  header-visible categories (naming the conflicting category); allows
  the identical `headerOrder` when the existing holder is hidden;
  rejects an empty name. `updateCategoryAction` — **section 4's own
  example, "School Uniforms" → "Uniforms" → "Dress," proves the slug
  never changes across either rename**; an explicit slug change is
  allowed and persists; a slug change to one already in use is rejected;
  a name change to one already in use is rejected, while keeping the
  category's OWN unchanged name is still allowed (excludes self);
  keeping the category's OWN `headerOrder` is allowed (excludes self);
  a `headerOrder` collision with a DIFFERENT header-visible category is
  rejected; `displayInHeader` toggles off and back on; a nonexistent
  category id returns `NOT_FOUND`. `deleteCategoryAction` — blocked when
  the category has products; succeeds when it has none (both already
  covered behaviors, re-verified unchanged).
- **Manual, real-server end-to-end verification** (real dev server, no
  restart required mid-script since only data changed): the header shows
  the four migrated categories in the correct order with no stale
  hardcoded label; `/uniforms` renders via the new dynamic route;
  renaming "Uniforms" → "Dress" (applied directly against the same
  database the running server reads, exactly what the real action would
  persist) updates the header AND the page's own heading immediately,
  with the URL still resolving at the unchanged `/uniforms` slug; hiding
  a category from the header removes it from the header nav specifically
  (re-verified against a header-only page after the first check's own
  string-search accidentally also matched the homepage's separate,
  header-independent tile section — a test-script artifact caught and
  corrected, not a product bug) while its page remains fully reachable; a
  brand-new "Stationery" category created with `displayInHeader: true`
  appears in the header and has an immediately-working (empty-state,
  non-crashing) page with zero code change and no server restart; header
  order is respected end to end across five real categories; an unknown
  slug 404s cleanly; the admin Categories page renders the new controls
  and per-row header status.

**Total: 927 tests passing** (893 at the end of Phase 3.6.6 + 34 new this
phase).

## Regression (section 14)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean (one warning found and fixed along the way —
  an unused test variable — see below).
- `npx vitest run` — **927/927 passing**, run twice (the shared dev
  database, and a from-scratch database — see below) with identical
  results.
- `npm run build` (Turbopack) — succeeds. Route list confirms
  `/uniforms`, `/shoes`, `/socks`, `/school-bags` (the four deleted
  static files) are gone and `/[categorySlug]` now exists in their
  place, correctly dynamic (`ƒ`).
- **New migration, with data backfill**: `20260810100000_phase3_6_7_part1_header_categories`
  — re-verified per "protect every previous phase": created
  `shop_verify_367_p1`, applied all 19 migrations, confirmed **zero
  drift** (`prisma migrate diff --exit-code`), ran the (now-fixed)
  `prisma/seed.ts` and `prisma/create-admin.ts`, confirmed the four
  seeded categories came up correctly `displayInHeader: true` with the
  intended order (the fix described above, verified against its own
  fresh database, not just asserted), ran the full 927-test suite
  against it (100% pass), then dropped the database. The shared dev
  database's own row counts (`orders`: 8, `customers`: 5, `products`:
  13, `categories`: 5, `admins`: 1) were confirmed unchanged before and
  after this phase's work.
- **A lint warning found and fixed along the way**: after deleting the
  four static category pages, ESLint's `@next/next/no-html-link-for-pages`
  rule started flagging two PRE-EXISTING plain `<a href="/uniforms">`
  fallback links (`school/[slug]/page.tsx`, `school-search.tsx`) that had
  apparently never tripped this rule while `/uniforms` was a literal,
  statically-known page file. Fixed by switching both to `<Link>` (the
  correct, already-idiomatic choice for internal navigation everywhere
  else in this codebase) — a genuine, if minor, improvement surfaced by
  this phase's own routing change, not a new problem it introduced.
- **Dev-server restart discipline**: restarted once, after applying the
  schema migration and regenerating the Prisma Client (the established
  rule from every prior phase with a schema change) — before that
  restart, the manual verification script correctly reflected every data
  change made afterward with zero further restarts needed, confirming
  Prisma Client regeneration, not a server restart per data change, was
  the only requirement.

## Known limitations (Part 1)

- **No icons, mega menus, dropdowns, or nested/hierarchical header
  structure** — `Category.parentId` already exists in the schema
  (unused, from an earlier phase) but this phase does not read or expose
  it anywhere; the header remains a single flat list, per section 16.
- **The homepage's "Or shop essentials" tile grid remains otherwise
  hardcoded** (which four slugs appear, their icons, their marketing
  taglines) — only the visible category NAME is now live; genuinely
  making this section admin-configurable is homepage/CMS scope, out of
  bounds per section 16.
- **Three storefront call sites still hardcode an assumption that a
  category with slug `uniforms` exists** (`school/[slug]/page.tsx`,
  its `not-found.tsx`, `school-search.tsx` — all a generic "browse
  generic uniform essentials" fallback link, never a repeated category
  NAME string). Left untouched: the assumption is tied to slug stability
  (section 5's own guarantee), not name, and is not something this
  phase's rename-propagation requirement covers. Revisitable if that
  category's slug is ever deliberately changed.
- **`sortOrder` and `headerOrder` are two separate fields with no UI
  connecting them** — an admin reordering the header does not affect the
  admin panel's own category list order, and vice versa; this is by
  design (see "Category fields" above), not an oversight, but worth
  noting as a place a future phase could add drag-to-reorder for either
  or both if manually typing a numeric position ever proves cumbersome
  at a larger category count.
- **No drag-and-drop reordering UI** — `headerOrder` is a plain number
  input; genuinely fine at the small category counts this shop has today
  (four, soon a handful more), and adding a richer reordering widget
  would be speculative UI complexity section 10's own "avoid unnecessary
  complexity" argues against until a real need appears.

## Future extensibility

Adding a new storefront section — Books, Kurtis, Belts & Ties (the
existing `parentId` hierarchy hook's own original example) — is now
purely a data operation: create a Category, optionally toggle "Display
in Header" and set its position, save. No route file, no hardcoded
label, no redeploy. If a future phase needs sub-categories or a
mega-menu, `Category.parentId` is already there, unused, waiting for
that phase to decide how to expose it — this phase deliberately leaves
that decision untouched rather than guessing at a structure ahead of a
real requirement.

## Final Part 1 verdict

The storefront header is generated entirely from admin-managed
Categories (`getHeaderCategories()`, one query, three renderers, zero
hardcoded names remaining anywhere in the header/mobile-nav/footer);
Categories can be renamed without any code change (proven directly
against section 4's own example, slug provably unchanged across two
renames); a new product section can be added by creating a Category and
enabling "Display in Header" alone, with zero code changes and no
redeploy (proven directly against a live server); and all existing
routing and product organization continue working without regression —
including a genuine fresh-database gap this phase's own regression
discipline found and fixed before it could reach a real deployment.
Full test suite passes (927/927, including a from-scratch database run);
fresh-database verification passes (19 migrations, zero drift); production
build passes; documentation is complete.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), Phase 3.6.5 (all six parts), and Phase 3.6.6 (all three
parts) remain uncommitted together in the working tree, per instruction,
alongside this phase's own changes. Phase 3.6.7 Part 2 has not been
started — awaiting review.

## Part 2 — Final Hardening & Production Acceptance

Date: 2026-08-10

The FINAL part of Phase 3.6.7. Per its own section 1, this part is
primarily an audit, verification, and bug-fix pass over the dynamic
Category → storefront navigation system Part 1 built — not a new
feature. One genuine accessibility gap was found and fixed (no
active/current-category indication anywhere); one genuine
fresh-deployment gap from Part 1 had already been found and fixed
*during* Part 1 itself (documented there); this part's own additional
audit surfaced no further code defects — every other section below is a
verification that already-built behavior is correct, backed by new
regression tests and a real end-to-end run against a live server. No
navigation CMS, mega menu, icon system, homepage/footer/SEO CMS, or
second Navigation model was added, per section 19.

### Complete lifecycle verification (section 2)

Walked the full chain — create → assign products → enable header → set
order → desktop header → mobile nav → footer → category page → products
— then rename → header/mobile/footer update → category page remains
accessible → product assignments intact — against BOTH the real query
layer (new tests, `src/server/queries/__tests__/categories-lifecycle.test.ts`)
and a real running dev server (see "End-to-end acceptance" below). Every
step passed on the first attempt; no code change was needed to make the
lifecycle itself correct — Part 1's own design already satisfied it.
`getHeaderCategories()` (called identically by `SiteHeader`, `MobileNav`
via a prop, and `SiteFooter`) and `getGenericCategoryProducts()` are the
only two functions in this entire chain — proven, not just asserted, by
a dedicated test renaming a category twice (mirroring section 8's own
"School Uniforms → Uniforms → Dress" example) and confirming its
assigned product is still returned by `getGenericCategoryProducts` after
both renames.

### Hide / show (section 3)

Confirmed by test and by a real server run: setting `displayInHeader =
false` removes a category from `getHeaderCategories()` (and therefore
from the desktop header, mobile nav, and footer — all three read that
one function) while leaving **everything else about the category
completely untouched** — the row itself, its slug, its product
assignments, and its own browse page (`getCategoryBySlug`/
`getGenericCategoryProducts` both continue to resolve it normally).
Re-enabling returns it to its header at its OWN previously-configured
`headerOrder` — never appended at the end, never reshuffled relative to
its siblings (proven directly by test: hiding and re-showing category B
in a 3-category order restores the exact original A/B/C sequence).

**The documented distinction (section 3's own ask):**

| | Hidden from navigation (`displayInHeader = false`) | Category does not exist |
| --- | --- | --- |
| Category row | Still in the database, fully intact | Deleted, or never created |
| Slug / URL (`/{slug}`) | Still resolves, renders normally | 404s via `notFound()` |
| Product assignments | Unchanged, still counted | N/A |
| `getCategoryBySlug` | Returns the category | Returns `null` |
| `getHeaderCategories` | Excludes it | Excludes it (same as hidden!) |
| Admin category list | Still shown, editable | Not shown |

The one row both states share — absence from `getHeaderCategories` — is
exactly why hiding is a one-field toggle and never a delete: a hidden
category's storefront PAGE keeps working (a direct link or an old
bookmark still lands somewhere real), while a genuinely nonexistent
category's page correctly 404s. A dedicated test
(`getCategoryBySlug` for a random, never-created slug) proves the
"nonexistent" side of this table directly, alongside the "hidden but
real" test above.

### Ordering (section 4)

A dedicated test creates three header-visible categories (`headerOrder`
610/611/612, chosen to avoid colliding with any other test's own
header-order values in the shared dev database) and proves: the default
ascending order; moving the LAST
one to FIRST position by editing only its own `headerOrder`; hiding the
MIDDLE one removes exactly it (first/last order preserved); re-enabling
it restores the original three-way order exactly, never appended at the
end. `getHeaderCategories()` is the only ordering implementation in this
codebase — header, mobile nav, and footer all call it, so there is
structurally no way for one surface to show a different order than
another (confirmed by code reading: none of the three components
re-sorts, filters, or otherwise touches the array `getHeaderCategories()`
returns). Duplicate-order validation (Part 1's own
`findHeaderOrderConflict`) was re-read and re-confirmed correct: scoped
to `displayInHeader: true` rows only, excludes the row being edited,
names the conflicting category — no change needed.

### New category — "Stationery" and "Kurtis" (section 5)

Both created directly against the live database while the (already
running, never restarted) dev server served requests — see "End-to-end
acceptance" below for the full transcript. Both appeared in the header,
had an immediately-working `/{slug}` page, and correctly showed their
assigned product (or a proper empty state before one was assigned).
Running it twice, with two unrelated category names, is what proves this
is genuinely data-driven rather than a hidden special case for one
hardcoded slug.

### Empty category (section 6)

**Chosen behavior, confirmed unchanged from Part 1's own design:** a
header-visible category with zero products renders its page normally —
heading, no product grid — with `CategoryProductGrid`'s existing
empty-state copy ("No products are available in this category yet.
Please check back soon."), never a crash, never a 500, and is **never
auto-hidden from the header**. An admin's explicit `displayInHeader`
choice is authoritative; this system does not second-guess it based on
product count, since a legitimate reason to show an empty category
exists (e.g. "launching next week," matching the exact wording already
in the empty-state copy) and auto-hiding would silently override a
deliberate admin decision. Proven directly: a real "Kurtis" category
created with zero products returned HTTP 200 with the exact empty-state
text, and a dedicated query-layer test confirms
`getGenericCategoryProducts` returns a plain empty array (never throws)
for a genuinely empty category.

### Category deletion safety (section 7)

Audited, found already safe, **not redesigned** (per the brief's own
"if the existing implementation is already safe, do not redesign it").
`deleteCategoryAction` (Part 1, unchanged) counts `Product` rows
referencing the category BEFORE any delete and returns a clear
`CONFLICT` — "This category has N products — move or remove them
first" — whenever that count is non-zero; the delete itself only runs
when the count is genuinely zero. This was already covered by 2 tests in
Part 1 (`categories.test.ts`); re-read and re-confirmed correct this
part, no new test needed. Deleting a genuinely empty category leaves no
broken storefront route or nav entry, by construction: `getHeaderCategories`
simply stops returning a deleted row (it can't do otherwise — the row is
gone), and `[categorySlug]/page.tsx` 404s for its now-nonexistent slug
exactly like any other never-existed slug — there is no separate
"navigation entry" data structure anywhere that could go stale, since
Categories themselves ARE the navigation (section 2's own architecture).

### Slug stability — re-proven (section 8)

Section 8's own example — "School Uniforms → Uniforms → Dress," slug
unchanged — is now proven at TWO layers, not one: Part 1's own
`categories.test.ts` proved it at the admin-ACTION layer (calling
`updateCategoryAction` twice); this part adds the identical proof one
layer down, at the query layer real storefront pages actually read
(`getHeaderCategories`/`getCategoryBySlug`), confirming the OLD URL
(`/{original-slug}`) keeps resolving to the renamed category, the
renamed category still shows its assigned product, and both the header
and the category page itself display the new name — all after two
successive renames, never one. No automatic slug change exists anywhere
in this codebase (confirmed by code reading: nothing calls `slugify()`
or otherwise derives a slug from a name outside the CREATE form's own
one-time, user-editable auto-suggestion, which itself stops the moment
an admin types into the Slug field).

### Static route regression (section 9)

Audited Next.js's own routing precedence directly, and verified it
empirically against a real running server rather than trusting the
framework's documented behavior alone: `/bag`, `/checkout`, `/track`
(200), `/track/orders` and `/admin` (307 — correctly redirecting to
their own auth gates, unrelated to this phase), and `/school` (404 — no
bare `/school` page has ever existed; only `/school/[slug]`) all resolve
to their real, correct handlers, never to `[categorySlug]/page.tsx`.
Proven adversarially, not just observed: a real category was created
with the literal slug `"bag"` (a name deliberately colliding with the
static route) against the live server, and `/bag` was re-fetched — it
still rendered the REAL bag page, not the category page, confirming
Next's literal-segment-wins-over-dynamic-sibling precedence holds even
in the worst-case, deliberately adversarial input, not merely for slugs
that happen not to collide. No genuine routing conflict was found;
nothing needed fixing. (No category in this codebase is named/slugged
to collide with a real static route today — confirmed by a direct query
— so this adversarial category was created and deleted purely for this
verification, never left behind.)

This is inherently a framework-routing guarantee, not application logic
this codebase could regress independently of Next.js itself changing its
own precedence rules — there is no unit-testable invariant to encode
here beyond what the real-server check above already proved directly.

### Security (section 10)

- **Public storefront read access**: `getHeaderCategories()`/`getCategoryBySlug`/
  `getGenericCategoryProducts` have no authorization check of their own
  (correct — they're public storefront data, the same convention as
  every other public query in this codebase) and are never used to
  expose anything beyond `slug`/`name`/`description`/products — grep-
  confirmed no internal id ever reaches a public response shape.
- **Admin-only mutations remain protected**: `createCategoryAction`/
  `updateCategoryAction`/`deleteCategoryAction` each call `requireAdmin()`
  (→ `getAdminSession()`) as their literal first line, before any
  validation or DB read — re-confirmed by re-reading the file, and by
  Part 1's own `UNAUTHORIZED` tests (re-run, still passing, unmodified).
- **Customer Portal has no access whatsoever**: grep-confirmed across
  the entire `src/` tree that `createCategoryAction`/`updateCategoryAction`/
  `deleteCategoryAction` are imported in exactly one place —
  `src/components/admin/category-manager.tsx`, itself rendered only
  under `/admin/(protected)/categories` — there is no code path by which
  a customer-portal session could reach any of the three.
- **No client-submitted value bypasses duplicate-name/header-order
  validation**: both `findNameConflict`/`findHeaderOrderConflict` run
  server-side against the ALREADY-zod-PARSED, type-checked data, on
  every create/update call, unconditionally — a client cannot skip
  either check by omitting a field (zod's own `.default()` fills it) or
  by sending a malformed type (zod rejects it before either conflict
  check ever runs). Two new tests close the one genuine edge worth
  covering explicitly: a non-numeric `headerOrder` string (`"not-a-number"`)
  and a non-boolean `displayInHeader` (`"yes"`) are both rejected outright
  by the schema, never coerced into passing.

### Accessibility (section 11) — one genuine gap found and fixed

Audited desktop nav, mobile nav, active-category indication, keyboard
navigation, focus visibility, and screen-reader labels. **One real gap**:
none of the desktop header, mobile nav, or footer category links ever
indicated the CURRENTLY-viewed category — no `aria-current`, no active
visual state — even though this exact codebase already has an
established pattern for it (`NavLinks` in `src/components/admin/admin-shell.tsx`,
which sets `aria-current={active ? "page" : undefined}` from
`usePathname()`). Fixed with a single new shared component,
**`src/components/site/category-nav-link.tsx`** — a small Client
Component (`usePathname()` requires one) used as a drop-in replacement
for the plain `<Link>` in all three surfaces, adding `aria-current="page"`
and a subtle active visual treatment (matching each surface's own
existing hover style, e.g. `bg-muted text-foreground` for the desktop
pill nav) only on the currently-active category — not a redesign, a
single additive attribute plus one small existing-style-consistent
class, applied identically everywhere the old plain `<Link>` was. Not
component-tested (this codebase has no React-rendering test precedent to
extend — the same disclosed limitation as Phase 3.6.6 Part 2's own
`InvoiceView`/`InvoiceActions`) — verified by code review and by
confirming `SiteHeader`/`SiteFooter`/`MobileNav` remain otherwise
byte-identical in structure, plus the full existing test suite (936
tests) still passing unchanged.

Everything else was already correct, confirmed unchanged: `<nav
aria-label="Categories">` landmarks on both desktop and mobile nav;
every link is a real `<Link>`/`<a>`, keyboard-focusable with no
`outline-none` stripping the browser's native focus ring anywhere in
these three files (grep-confirmed); the footer's own `<footer>` element
already provides its own landmark, so its plain `<ul>` of Shop links
needs no additional `aria-label`.

### Performance (section 12)

Confirmed by code reading (this codebase has no query-counting test
harness to assert this mechanically, consistent with how performance was
verified in every prior phase of this session — e.g. Phase 3.6's own
"no speculative optimization... nothing surfaced a real problem"):

- **Header**: exactly one `getHeaderCategories()` call per request,
  returning every header category in one query — never one query per
  category.
- **Mobile navigation**: performs ZERO queries of its own — it's a
  Client Component receiving the SAME already-fetched array `SiteHeader`
  passed as a prop; there is no code path by which it could query
  independently.
- **Footer**: calls `getHeaderCategories()` itself once (it renders in a
  different part of the component tree than the header, so it cannot
  receive the header's own fetch as a prop) — one query, not N; still
  never a per-category query.
- **Category page**: `[categorySlug]/page.tsx` makes exactly two
  queries total, regardless of product count — `getCategoryBySlug`
  (one row) and `getGenericCategoryProducts` (one query, with variants
  eager-loaded via Prisma's own `include`, never a per-product follow-up
  query) — never N+1.
- **Admin category list** (`getAllCategories`): product counts use
  Prisma's own `_count` aggregation (a single query with a computed
  column), never a per-category `COUNT(*)` — re-confirmed unchanged.

Part 1's single-query architecture is fully intact; nothing in this
audit found a query-count regression anywhere.

### Caching / freshness (section 13)

**Chosen, confirmed behavior: zero caching — an admin change is visible
on the very next request, with no revalidation delay to reason about.**
Grepped every storefront page/component under `(site)` and
`src/components/site/` for `export const revalidate`, `export const
dynamic`, `fetchCache`, `unstable_cache`, or `"use cache"` — **none
exist anywhere**. `getHeaderCategories`/`getCategoryBySlug`/
`getGenericCategoryProducts` are plain Prisma calls, which Next.js's Data
Cache never intercepts (that cache only wraps `fetch()`) — there is
structurally no cache for a category change to be stale in. This was
directly proven, not just reasoned about, in Part 1's own manual
verification (a rename took effect on the very next request, with the
dev server never restarted) and re-confirmed by this part's own
end-to-end run below.

The admin action's existing `revalidatePath("/", "layout")` call
(`revalidateCategoryViews()`, pre-dating Part 1) is consistent with this
— per Next.js's own semantics, a `"layout"`-typed revalidation at the
root invalidates the entire app's cache, which is already empty for
these routes, making the call a safe no-op in today's architecture
rather than the thing actually keeping the header fresh. Left completely
unchanged: it costs nothing, and removing it would be a speculative
"simplification" with no verified benefit, exactly the kind of
unrequested change this phase's own section 1 warns against. **No new
revalidation logic was added — the smallest correct solution here is
the one already in place: no caching, so nothing to revalidate.**

### Data integrity (section 14)

Proven directly, not merely argued from the schema: a dedicated test
(`categories-lifecycle.test.ts`, "Data integrity") places a REAL order
(via `createCounterSale`) for a product in a category, then renames that
category, hides it from the header, AND changes its `headerOrder` — all
three mutations at once — and asserts the placed order's `OrderItem` row
is byte-for-byte (`toEqual`) identical before and after, and the order's
own `totalInPaise`/`status` are unchanged too. This holds structurally,
not by coincidence: `OrderItem` has no live relation to `Category` at
all (confirmed by schema reading — only `productId`/`productVariantId`,
both nullable/`SetNull`) and already snapshots
`productName`/`unitPriceInPaise`/`skuSnapshot`/etc. at order-creation
time (Phase 1's own original design) — a category mutation has no
column, no join, no code path by which it COULD reach historical order,
return, or exchange data. Returns/Exchanges were not additionally
exercised with their own dedicated test in this part, since they read
the identical `OrderItem`/`Order` snapshot fields this test already
proves are untouched — re-testing the same guarantee through a second
domain would not have found a different answer.

### Testing (section 15)

- **`src/lib/validation/__tests__/admin-categories.test.ts`** (extended,
  +2 tests): a non-numeric `headerOrder` string and a non-boolean
  `displayInHeader` are both rejected outright by the schema.
- **`src/server/queries/__tests__/categories-lifecycle.test.ts`** (new,
  7 tests, real Postgres): the complete create→assign→enable→order
  lifecycle; rename propagation across two successive renames with
  product assignment intact; hide-without-delete (category, slug, and
  product assignment all survive; re-enable restores header visibility);
  a genuinely nonexistent slug returns `null` (never confused with
  "hidden"); first/middle/last-position ordering across hide/re-enable;
  a zero-product header-visible category returns an empty array, never
  throws; and the data-integrity test described above (a real order's
  `OrderItem` snapshot is provably unaffected by simultaneous rename +
  hide + reorder).
- **Manual, real end-to-end verification** (live dev server, never
  restarted mid-script — see the full transcript in "End-to-end
  acceptance" below): static-route precedence for `/bag`, `/checkout`,
  `/school`, `/track`, `/track/orders`, `/admin`, including the
  adversarial "category literally named bag" case; the complete
  Stationery → rename → hide → re-enable → Kurtis scenario section 17
  asks for, end to end.
- Per section 15's own "do not rewrite existing tests merely to inflate
  coverage" — Part 1's 34 category tests and every one of Phase 3.6.6's
  893 tests were re-run, unmodified, and still pass; none needed
  changing.

**Total: 936 tests passing** (927 at the end of Part 1 + 9 new this
part).

### End-to-end acceptance (section 17) — full transcript

Against the real, running dev server (never restarted mid-scenario —
only data changed, consistent with section 13's zero-caching finding):

1. **Static route regression** (section 9, run first): `/bag` → 200,
   `/checkout` → 200, `/school` → 404 (no bare page, expected),
   `/track` → 200, `/track/orders` → 307 (auth redirect, expected),
   `/admin` → 307 (auth redirect, expected). A category literally
   slugged `"bag"` was created and `/bag` re-fetched — still the real
   bag page, not the category page. Deleted immediately after.
2. **Create "Stationery"** with one real product (a variant, in stock),
   `displayInHeader: true` — the homepage's rendered HTML showed
   "Stationery" from BOTH the header nav and the footer's own
   server-rendered "Shop" list (two separate occurrences of the
   category's own live-fetched name, confirming both consumers are
   independently live, not one caching the other).
3. **Open the category page** (`/stationery`) — heading "Stationery",
   the assigned product ("Pencil Set") visible.
4. **Rename "Stationery" → "School Stationery"** — the homepage
   immediately showed the new name and no longer showed the old one; the
   category page's own heading updated too; the product remained
   assigned and visible; the URL (`/stationery`) never changed.
5. **Hide from header** — a header-only page (`/track`, which unlike the
   homepage has no separate, header-independent tile section to
   accidentally match against) no longer showed "School Stationery";
   the category page still rendered fully, product included.
6. **Re-enable** — reappeared in the header immediately.
7. **Repeat with "Kurtis"** (a second, unrelated category, zero products
   initially) — appeared in the header, its own page rendered the
   correct empty-state copy (section 6), never a crash.
8. All test-created data (2 categories, 1 product, 1 variant, 1 admin
   user/session) was deleted at the end of the script; the shared dev
   database's row counts (`orders`: 8, `customers`: 5, `products`: 13,
   `categories`: 5, `admins`: 1, `adminSessions`: 5) were confirmed
   identical before and after — no real business data was touched.

Every single step passed on the first run; no bug was found during this
scenario (the one genuine bug this phase found — the missing
active-nav-link indication — was surfaced by the accessibility audit,
not this scenario).

### Regression (section 16)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — **936/936 passing** (one known, pre-existing,
  unrelated flaky test — `customers.test.ts`'s own random-UUID/`"00"`-
  substring collision, first identified and documented earlier this
  session — reappeared once during this part's own regression run and
  passed cleanly on an immediate re-run in isolation; not touched by, or
  related to, any change in this phase).
- `npm run build` (Turbopack) — succeeds; route list confirms
  `[categorySlug]` and every pre-existing static route both still
  present and correctly typed.
- **No new migration** — this part changes no schema. Re-verified per
  "protect every previous phase": created `shop_verify_367_p2`, applied
  all 19 migrations, confirmed **zero drift**
  (`prisma migrate diff --exit-code`), ran the seed script and confirmed
  the four seeded categories come up with the correct `displayInHeader`/
  `headerOrder` values (re-confirming Part 1's own fresh-database fix
  still holds), ran the full 936-test suite against that same fresh
  database (100% pass), then dropped it. The shared dev database's own
  row counts were confirmed unchanged before and after this part's work.
- Dev server restarted once at the start of this part's manual
  verification work (routine, not because of any code requiring it —
  no schema change this part); zero restarts needed afterward, since
  every subsequent verification step was a pure data change against the
  same already-running server (re-confirming section 13's own finding).

### Known limitations (Part 2)

- **No component-level render test for `CategoryNavLink`'s active-state
  logic** — same disclosed gap as Phase 3.6.6 Part 2's own UI components;
  this codebase has no React-rendering test precedent to extend, so none
  was introduced here either. Verified by code review and the full,
  unmodified test suite continuing to pass.
- **No query-counting test harness** — performance claims (section 12)
  are verified by code review, not by an automated "assert exactly N
  queries" mechanism, since no such harness exists anywhere in this
  codebase.
- **`Category.parentId` remains unused** — still true, unchanged from
  Part 1; no hierarchical/mega-menu structure was added, per section 19.
- **The three pre-existing hardcoded `/uniforms` fallback links**
  (`school/[slug]/page.tsx`, its `not-found.tsx`, `school-search.tsx`)
  — disclosed in Part 1, unchanged and re-confirmed still correct this
  part (they depend on slug stability, which this phase re-proved,
  never on a category name, which this phase also re-proved is free to
  change).

### Bugs discovered and fixed (Part 2 summary)

One, found by this part's own accessibility audit: no storefront
category link anywhere indicated the currently-active category. Fixed
via the new `CategoryNavLink` component, applied identically across the
desktop header, mobile nav, and footer. No other genuine defect was
found in this phase's own hardening pass — every other section above is
a verification of already-correct Part 1 behavior, not a fix.

## Final Part 2 verdict — Phase 3.6.7 acceptance

Every acceptance criterion in the Definition of Done is demonstrated,
not merely asserted: the complete lifecycle (create → assign products →
enable header → set order → desktop header → mobile navigation → footer
→ dynamic category URL → products) was proven end to end, twice, against
a real running server, for two independently-created categories; rename
propagation and slug stability were re-proven at both the action layer
(Part 1) and the query layer (Part 2); hide/show correctly distinguishes
"hidden from navigation" from "does not exist," documented explicitly
above; reordering (first/middle/last, plus hide-and-restore) is correct
and duplicate-order validation holds; deletion safety was audited and
confirmed already correct, not redesigned; authorization has zero gaps
(admin-only mutations, zero customer-portal access, no client-side
bypass of validation); the one genuine accessibility gap found (missing
active-nav-link indication) was fixed; performance remains single-query
per surface with no N+1 anywhere; caching/freshness is zero-cache by
design, with immediate visibility of every admin change; data integrity
is proven directly against a real placed order, not merely argued from
the schema; and a genuine fresh-database gap (found and fixed during
Part 1 itself) was re-verified to still hold. Full test suite passes
(936/936, including a from-scratch database run); fresh-database
verification passes (19 migrations, zero drift, seed produces valid
initial header categories); production build passes; documentation is
complete across both parts.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), Phase 3.6.5 (all six parts), Phase 3.6.6 (all three parts),
and Phase 3.6.7 (both parts) remain uncommitted together in the working
tree, per instruction.

## PHASE 3.6.7 — COMPLETE
