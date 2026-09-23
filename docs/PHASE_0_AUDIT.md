# Phase 0 — Repository & Product Audit

Date: 2026-08-04

## 1. Current state

`/Users/user/shop` was an **empty directory** — no git repository, no prior
code, no existing stack to preserve or migrate. This is a greenfield build.

Actions taken to establish a baseline:

- Initialized git (`git init`).
- Scaffolded a Next.js app in-place with `create-next-app` (App Router,
  TypeScript, Tailwind, ESLint, `src/` layout, `@/*` import alias).
- Initialized shadcn/ui and added the primitives this phase needs (`button`,
  `input`, `card`, `badge`, `sheet`, `tabs`, `select`, `label`, `separator`,
  `skeleton`, `sonner`).
- Added Prisma + a local Postgres via Docker Compose.
- Added `zod` (input validation), `vitest`/`tsx` (tests, seed script runner).

## 2. Existing stack

None — see above. There was nothing to extend and nothing to risk destroying.

## 3. Stack chosen, and why

| Concern | Choice | Reasoning |
|---|---|---|
| Framework | Next.js 16.2 (App Router) | Matches the brief's preferred direction. One deployable app serves public storefront, admin (later), and route handlers — no separate backend service. |
| Language | TypeScript, `strict: true` | Non-negotiable per brief. |
| Styling | Tailwind CSS v4 | Already wired by `create-next-app`; utility-first keeps the "premium but simple" design system fast to iterate on without a heavy component framework. |
| UI primitives | shadcn/ui (copied into `src/components/ui`, not an npm dependency) | Accessible (Radix/Base UI under the hood), unstyled-enough to reskin for the warm/premium brand direction, and the code lives in-repo so it can be freely customized rather than fighting a third-party design system. |
| Database | PostgreSQL 16, via Docker Compose for local dev | Relational integrity matters here (stock counts, order totals, unique slugs) — a document store would fight the domain. Docker Compose keeps "one Postgres" honest without installing anything system-wide. |
| ORM | **Prisma 6.19.3** (not 7.x) | See "Important deviation" below. |
| Validation | zod | Server Actions/route handlers validate all inputs; nothing from the client is trusted for price or stock. |
| Testing | Vitest | Fast, native ESM/TS, no config ceremony. Used for domain-logic unit tests (pricing, stock-status derivation, slug/search matching), not UI snapshot tests. |
| Cart persistence | Server-side `Basket`/`BasketItem` Postgres rows, referenced by an opaque id in an httpOnly cookie | Simplest mechanism that satisfies "no login" **and** "server must validate everything" simultaneously — the basket already lives where validation happens, so there's no separate sync step between a client-only cart and the server. |

### Rejected/deferred
Redis, GraphQL, microservices, Kubernetes, Elasticsearch, Kafka — no
demonstrated need for any of them at this scale. A single Next.js deployment
plus one Postgres instance is sufcient for a local retailer, and stays that
way in the architecture (nothing here assumes multiple services).

### Important deviation from the brief: Prisma 7 → Prisma 6.19.3

`npx prisma init` installed **Prisma 7.9.1** (the current `latest` tag).
Prisma 7 turned out to be a very recent major version with breaking changes
that materially increase operational complexity for this project:

- `datasource.url` can no longer live in `schema.prisma` — the CLI reads
  `prisma.config.ts` and the **runtime client requires an explicit driver
  adapter** (`@prisma/adapter-pg` + `pg`, manually pooled).
- The generated client is **ESM-only**, which typically forces
  `"type": "module"` on `package.json` — a project-wide change with its own
  ripple effects on tooling.
- `new PrismaClient()` with no arguments throws; the old one-liner client
  instantiation is gone.

None of this is difficult, but it is *new, undocumented-outside-Prisma's-own-
release-notes complexity* on top of Next.js 16 (also very new). Stacking two
bleeding-edge major versions in the foundation of a 30-year local retail
business's platform is a real risk: fewer Stack Overflow answers, fewer
battle-tested examples, more surface area for a future maintainer (who may not
be a specialist) to get stuck on. The brief is explicit that "simplicity is a
feature" and to avoid technology choices made just because they're new.

**Decision:** pin to `prisma@6.19.3` / `@prisma/client@6.19.3` — the latest
release in the well-established 6.x line. This keeps the conventional,
widely-documented API (`datasource.url` in schema, `new PrismaClient()`,
CommonJS-compatible output). Revisit Prisma 7 in a later phase once it has
had time to mature and the ecosystem (docs, adapters, examples) catches up.
This is the one place this audit overrides the brief's literal suggestion,
and it's called out here per the instruction to document assumptions.

### Known environment risk (not fixed, documented)
`npm audit` reports 3 high-severity advisories in `postcss`/`sharp`, both
**vendored inside `next@16.2.12` itself** (build-time CSS processing and
image optimization), not in our own dependency choices. `npm audit fix
--force` would downgrade Next.js to `9.3.3` — clearly wrong. No action taken;
flagging so it's revisited when Next.js ships a patch release with updated
vendored deps.

## 4. Data model

The full reasoning lives as comments in [`prisma/schema.prisma`](../prisma/schema.prisma).
Summary of the key relationships:

```
School ──< SchoolClass
School ──< SchoolUniformAssignment >── Product ──< ProductVariant
              (schoolId, classId?, gender)
School ──< RecommendedUniformSet ──< RecommendedUniformSetItem >── Product
Category ──< Product
Product (schoolId nullable) ── generic when null, school-exclusive when set
Basket ──< BasketItem >── ProductVariant
Order ──< OrderItem (snapshots product name/size/price at order time)
```

Key decisions:

- **Products are reusable by default.** `Product.schoolId` is nullable. A
  generic "White Shirt" is one row; every school that uses it links to it via
  `SchoolUniformAssignment`, never by duplicating the product. A school with
  a genuinely unique item (e.g. a crested blazer) sets `Product.schoolId`
  directly instead.
- **`SchoolUniformAssignment`** is the join model that answers "what does
  this school's storefront show for Class 7 Boys" — `classId`/`gender` are
  nullable-by-convention (`gender` defaults to `UNISEX`, `classId` null means
  "all classes") so a school doesn't need one row per class × gender × item
  when an item applies broadly (e.g. socks for everyone).
- **Price and stock live on `ProductVariant`, never on `Product`.** Size
  affects price (bigger sizes can cost more), and different sizes sell out
  independently. `priceInPaise`/`totalInPaise` are integers (paise, i.e.
  ₹/100) rather than floats or `Decimal`, to avoid floating-point rounding
  bugs in money math without pulling in a decimal library.
- **`RecommendedUniformSetItem` references a `Product`, not a specific
  `ProductVariant`.** The recommended set is about *what* items and
  quantities make up a full uniform — the parent still picks each item's
  size when adding the set to their basket, because size is a property of
  the child, not the school.
- **`stockStatus` is a stored enum, not purely derived**, so it can reflect
  operational reality (e.g. staff marking something out of stock ahead of a
  quantity hitting zero) while `stockQuantity` remains the number used for
  ordering limits. Application code keeps them in sync on writes.
- **`Order`/`OrderItem` are modeled now but not wired to any UI/flow in
  Phase 1** — see Phase 1 scope below. `OrderItem` snapshots
  `productName`/`size`/`unitPriceInPaise` so a historical order stays
  accurate even if the catalog changes later.
- **Basket has no `schoolId`.** It's just a bag of `(ProductVariant,
  quantity)` — the school is shopping context (which URL you were on), not a
  cart-level constraint. Nothing stops mixing a school-specific item with a
  pair of generic shoes in one basket, which is the correct real-world
  behavior.

## 5. Proposed folder structure

```
prisma/
  schema.prisma
  seed.ts
  migrations/
src/
  app/
    (site)/                      -- public storefront route group
      page.tsx                   -- homepage
      school/[slug]/page.tsx     -- school storefront (QR landing target)
      uniforms/page.tsx
      shoes/page.tsx
      socks/page.tsx
      school-bags/page.tsx
      bag/page.tsx                -- basket page
    api/
      basket/route.ts             -- basket mutations (add/update/remove)
      schools/search/route.ts     -- school search endpoint
    layout.tsx
    globals.css
  components/
    ui/                            -- shadcn primitives (generated)
    site/                          -- header, footer, nav, school search box
    product/                       -- product card, size picker, add-to-bag
    basket/                        -- basket drawer/page components
  lib/
    db.ts                          -- Prisma client singleton
    money.ts                       -- paise <-> rupee formatting helpers
    slug.ts                        -- slug generation/validation
    basket.ts                      -- server-side basket cookie/session helpers
    validation/                    -- zod schemas for server inputs
  server/
    queries/                       -- read-only data access (schools, products, categories)
    actions/                       -- server actions (mutations) with zod validation
  types/
docs/
  PHASE_0_AUDIT.md
  PHASE_1_REPORT.md
docker-compose.yml
```

Admin (`/admin/...`) is intentionally **not** built in Phase 1 — the brief
asks for the public vertical slice first. The data model and folder
structure both anticipate it (`server/actions` and `server/queries` are
already split so admin can reuse the same query layer instead of duplicating
business logic).

## 6. Database approach

- Local dev: Postgres 16 in Docker Compose, port **5433** on the host (5432
  was already bound by an unrelated project's container on this machine —
  confirmed via `lsof`/`docker ps`, not a conflict with anything of ours).
- Schema managed via Prisma Migrate (`prisma/migrations`), committed to git.
- Seed script (`prisma/seed.ts`) populates clearly-labelled demo data
  (`isDemo: true` flags on `School`/`Product`) — see Phase 1.
- All money stored as integer paise; all reads that produce a price for
  display or for an eventual order **must** go through `ProductVariant` in
  the database at the time of the request — no price is ever accepted from
  request bodies.

## 7. Important assumptions

1. **No auth in Phase 1.** Guest checkout is the explicit target; nothing in
   this phase requires an account. Admin auth is deferred to whenever the
   admin dashboard is built.
2. **One currency (INR), one locale, one timezone.** No i18n/multi-currency
   scaffolding — would be premature.
3. **Classes are school-owned**, not a shared global list (`SchoolClass.schoolId`
   is required). Different schools use different class structures (Nursery/LKG/UKG
   vs. Class 1–12 vs. Form 1–5) — a shared global "Class 7" would either force
   awkward reuse or under-model real variation.
4. **A single `imageUrl` per `Product`** rather than a separate multi-image
   table. Real product photography doesn't exist yet (placeholders only);
   this can become a `ProductImage` model later without touching anything
   else if multi-image galleries become necessary.
5. **Stock thresholds are per-variant** (`lowStockThreshold`, default 5), so
   a slow-moving large size and a fast-moving common size can have different
   "low stock" cutoffs.
6. **Order/fulfillment enums match the brief exactly** (`PENDING` →
   `CONFIRMED` → `PREPARING` → `READY_FOR_PICKUP`/`OUT_FOR_DELIVERY` →
   `DELIVERED`, plus `CANCELLED`), even though no code transitions between
   them yet.

## 8. Risks

- **Next.js 16.2.12 is a very new major version** ("This is NOT the Next.js
  you know" — its own bundled agent notice). Mitigated by reading the
  bundled docs (`node_modules/next/dist/docs`) before relying on any
  App Router convention, in particular: `params` is a `Promise` in page/
  layout/route handlers, and there is an opt-in "Cache Components" mode
  (not enabled here) that would otherwise require `<Suspense>` around any
  dynamic param access. Because Cache Components is off, routes render
  dynamically per-request by default, which is what we want for real-time
  stock/price accuracy anyway.
- **Prisma 7 vs 6** — addressed above; revisit later.
- **No production Postgres target specified.** Docker Compose here is for
  local development only; a deploy target (Vercel Postgres, Neon, Railway,
  self-hosted) is an open decision for whoever deploys this, not something
  this audit should presume.
- **Placeholder content everywhere** (school names, product photos, logos).
  Every demo record is flagged `isDemo: true` and named obviously fictitiously
  (e.g. "Demo Sunrise Public School") to avoid any appearance of a real
  school partnership.

## 9. Phase 1 implementation plan

1. Prisma schema + migration (done, see above).
2. Seed script: 2 demo schools, categories (`uniforms`, `shoes`, `socks`,
   `school-bags`), a mix of generic and school-specific products, variants
   covering in-stock/low-stock/out-of-stock, class + gender assignments, one
   recommended set.
3. `src/lib/db.ts` Prisma singleton (dev-safe against hot-reload duplicate
   clients).
4. Data-access layer (`src/server/queries`) — schools by slug/search,
   category products, school storefront collections, recommended sets.
5. Basket: cookie-identified server-persisted basket + server actions for
   add/update/remove, all re-validating price/stock server-side.
6. Global layout: header (logo, nav, search, bag), footer, mobile nav.
7. Homepage: hero + school search + category shortcuts + trust section.
8. School search: partial-match API + client combobox.
9. `/school/[slug]`: school header, boys/girls + class selectors, assigned
   product grid, recommended set card, empty/invalid-slug states.
10. Category pages `/uniforms`, `/shoes`, `/socks`, `/school-bags`: generic
    (non-school-specific) product grids.
11. Product card + size/quantity selector + Add to Bag (with Buy Now on
    product-level views where it shortens the path).
12. Basket page: line items, quantity controls, remove, subtotal, and a
    clearly-labelled "checkout coming in Phase 2" state — no fake order
    success.
13. Vitest unit tests: stock-status derivation, money formatting, basket
    total calculation, school search matching, slug validation.
14. Verification pass: typecheck, lint, tests, build, then manual route
    checks at mobile + desktop widths.
15. `docs/PHASE_1_REPORT.md`.
