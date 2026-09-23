# Phase 1 — Foundation + Working Vertical Slice

Date: 2026-08-04

This builds directly on [`docs/PHASE_0_AUDIT.md`](./PHASE_0_AUDIT.md). Read
that first for the stack decisions (in particular: Prisma pinned to 6.19.3,
not 7.x) and the full data-model reasoning.

## What was built

A working, mobile-first public storefront for a school-uniform retailer:

- Warm/premium homepage with a school search as the primary above-the-fold
  action.
- Live, partial-match school search (API + combobox), keyboard-navigable.
- Dynamic `/school/[slug]` storefront — the QR-code landing page — with
  Boys/Girls + Class filtering, a "Recommended Complete Uniform" set with
  one-click add, and a full product grid with per-size price/stock.
- Four standalone category routes (`/uniforms`, `/shoes`, `/socks`,
  `/school-bags`) for parents whose school isn't listed.
- A real, server-persisted guest basket: add to bag, buy now (shortest path
  to `/bag`), quantity updates, remove — all re-validated against the
  database, never trusting client-supplied price or stock.
- A `/bag` page that is honest about scope: it shows a real subtotal and a
  clearly labelled "checkout is launching soon" notice instead of a fake
  order-success screen.
- Full Prisma schema + migration, demo seed data, sitemap/robots, and an
  automated test suite (46 tests) covering the domain logic that actually
  matters (stock clamping, money formatting, slug validation, and the
  school/category query filters against the real database).

## Architecture

Single Next.js 16 (App Router) app, TypeScript strict, Tailwind v4,
shadcn/ui (Base UI under the hood) components copied into the repo. One
Postgres 16 instance (Docker Compose locally). No separate backend service,
no queue, no cache layer — matches the brief's "simplicity is a feature"
directive.

```
src/
  app/                      routes (see below)
  components/
    ui/                     shadcn primitives
    site/                   header, footer, mobile nav, school search
    product/                product card, size picker, category grid
    school/                 gender/class selector, recommended set card, logo
    basket/                 basket line item
  lib/                      db client, money/stock/slug helpers, basket
                            cookie/session helpers, zod validation schemas
  server/
    queries/                read-only data access (schools, categories)
    actions/                server actions (basket mutations)
  types/                    Prisma-derived view types
prisma/
  schema.prisma
  seed.ts
  migrations/
```

Deviation from the Phase 0 proposed structure: routes live directly under
`src/app` rather than inside an `(site)` route group. There's no second
route group (e.g. `/admin`) yet to justify the grouping — it's cheap to
introduce in Phase 2 when admin exists.

### Why a route is (or isn't) statically generated

Every public route is server-rendered on demand (`ƒ` in the build output),
which is intentional, not a missed optimization: header and footer read the
basket cookie on every request, and product/school data must always reflect
current stock and price. `robots.txt` and `sitemap.xml` are the only two
static (`○`) outputs.

## Database schema summary

See `prisma/schema.prisma` for the annotated source of truth. Core entities:
`School`, `SchoolClass`, `Category`, `Product` (generic when `schoolId` is
null, exclusive to one school otherwise), `ProductVariant` (size + price +
stock live here, not on `Product`), `SchoolUniformAssignment` (join model:
school × class? × gender → product), `RecommendedUniformSet` +
`RecommendedUniformSetItem`, `Basket` + `BasketItem` (guest cart), `Order` +
`OrderItem` (modeled for Phase 2, not wired to any UI yet).

Money is stored as integer paise (`priceInPaise`, `totalInPaise`) to avoid
float rounding bugs.

## Routes

| Route | Purpose |
|---|---|
| `/` | Homepage — hero, school search, category shortcuts, trust section |
| `/school/[slug]` | School storefront — the QR landing page |
| `/uniforms`, `/shoes`, `/socks`, `/school-bags` | Generic category browsing |
| `/bag` | Basket — line items, quantities, subtotal, checkout notice |
| `/api/schools/search` | Partial-match school search (GET, `?q=`) |
| `/sitemap.xml`, `/robots.txt` | SEO |

## Important UX decisions

- **Boys/Girls is a tab, not a modal**, and defaults to Boys on first load so
  a parent always sees products immediately — no empty first screen.
- **Size availability is shown inline as a row** (`₹380 · Low Stock`) rather
  than requiring a tap to reveal it, matching the brief's literal example.
  Out-of-stock sizes are visible but visually struck-through and disabled,
  not hidden — a parent should be able to see the full size run.
- **"Add Complete Set" defaults each item to its lowest-sortOrder in-stock
  variant**, and tells the parent (via toast) if something in the set
  couldn't be added because every size is out of stock. Nothing is silently
  dropped.
- **"Buy Now" adds to bag and jumps straight to `/bag`** — the honest
  "shortest path to checkout" given checkout itself isn't built yet.
- **No login anywhere.** Basket is a `Basket` row keyed by an httpOnly
  cookie (`shop_basket_id`), created lazily on first add.
- **Every mutation calls `router.refresh()`** after the server action
  resolves, so the header bag count and the bag page reflect the change —
  server actions invoked directly from a click handler (not a `<form
  action>`) don't auto-refresh the Server Component tree on their own.
- **Placeholder product imagery is visibly labelled** ("Placeholder" corner
  tag on a generated icon tile) rather than pointing `<img>` at
  files that don't exist.
- **Demo schools are labelled in-page** ("Demo school — for illustration
  only, not a real Wearwell Uniforms partner") whenever `school.isDemo` is
  true, in addition to obviously fictitious naming.

## Tests performed

Automated (all passing at time of writing):

```
$ npm run test
 Test Files  5 passed (5)
      Tests  46 passed (46)
```

- `src/lib/__tests__/money.test.ts` — paise↔rupee formatting/conversion.
- `src/lib/__tests__/stock.test.ts` — stock-status derivation, orderability.
- `src/lib/__tests__/slug.test.ts` — slug validation/generation.
- `src/lib/__tests__/basket-math.test.ts` — the actual "never trust client
  stock" clamping logic used by the basket server actions, and the default
  variant selection used by "Add Complete Set".
- `src/server/queries/__tests__/schools.test.ts` — integration tests against
  the real seeded Postgres: partial/case-insensitive school search,
  inactive-school exclusion, class+gender assignment filtering (including
  the class-scoped sweater case and product de-duplication across matching
  assignment rows), and generic-vs-school-specific product filtering on
  category pages.

Manual (dev server + headless Chromium, both 1440×900 desktop and 390×844
mobile viewports):

- Homepage renders; school search returns "Demo Sunrise Public School" for
  "sunrise" and navigates to `/school/demo-sunrise-public-school`.
- Boys/Girls tabs correctly swap product sets (Grey Pant only for Boys,
  White Skirt only for Girls); Class dropdown narrows further (verified
  Sweater appears for Class 1 but not Class 7, matching the seeded
  class-scoped assignment).
- Recommended Complete Uniform set renders with correct items/estimated
  total and adds to the bag.
- Size chip states verified directly: size "34" (0 stock) renders
  struck-through/disabled; selecting size "32" (low stock) shows the
  "Low Stock" label live.
- Add to Bag shows a toast and updates the header bag count; Buy Now adds
  and navigates straight to `/bag`.
- `/bag` quantity stepper and remove both work and update the subtotal; the
  "Online checkout is launching soon" notice is present — no fake order
  success anywhere.
- Invalid slug (`/school/not-a-real-school`) and an inactive demo school
  (`/school/demo-old-town-school`) both correctly 404 with a friendly
  not-found page (search box + link to generic uniforms), verified via HTTP
  status code and rendered content.
- Mobile hamburger opens a slide-out sheet with search + category links.
- Browser console checked on every page/interaction above — clean.

### Two real issues this pass caught and fixed

1. **Base UI console warning**: `<Button render={<Link .../>}>` needs
   `nativeButton={false}` — Base UI's `Button` otherwise warns that it
   expected to render a native `<button>`. Fixed in `src/app/bag/page.tsx`.
2. **Hamburger menu touch target was 32×32px** — below the ~44px minimum
   the brief calls for ("thumb-friendly", "avoid tiny controls"). Bumped the
   mobile menu button, both quantity-stepper buttons, and the bag remove
   button to 40–44px hit areas.

## Commands and results

```
$ npm run typecheck   # tsc --noEmit           → clean
$ npm run lint        # eslint .               → clean
$ npm run test        # vitest run             → 46/46 passed
$ npm run build       # next build             → succeeds, 12 routes
```

`npm audit` reports 3 high-severity advisories, all inside Next.js 16.2.12's
own vendored `postcss`/`sharp` (build tooling), not our dependency choices —
documented in the Phase 0 audit as a known, unfixed risk (the suggested
`npm audit fix --force` would downgrade Next.js to 9.3.3, which is wrong).

## Known limitations

- **No checkout.** By design for this phase — `/bag` stops at a real,
  accurate basket state. Order/OrderItem exist in the schema but nothing
  creates a row yet.
- **No admin UI.** Schools/products/inventory are managed only via the seed
  script and Prisma Studio (`npm run db:studio`) right now.
- **No real product photography** — every product shows a generated,
  clearly-labelled placeholder tile.
- **No QR code generation.** The `/school/[slug]` route is fully dynamic and
  ready to be the QR target; generating/printing the actual QR image is
  Phase 2 admin work.
- **Single currency/locale/timezone**, no i18n — not needed at this scale.
- **Basket is single-browser** (cookie-based). No cross-device basket sync —
  consistent with "no login" as a Phase 1 constraint.

## Screens/features manually verified

`/`, school search (valid + no-match query), `/school/[valid-demo-slug]`
(both demo schools), `/school/[invalid-slug]` (404), `/school/[inactive-slug]`
(404), `/uniforms`, `/shoes`, `/socks`, `/school-bags`, `/bag` (empty and
populated states), size selection (in-stock/low-stock/out-of-stock), quantity
stepper (product card and bag page), Add to Bag, Buy Now, Add Complete Set,
mobile hamburger nav — at both mobile and desktop viewports.

## What should be built in Phase 2

1. Guest checkout: customer details (name/mobile/address), fulfillment
   choice (pickup/delivery), and an actual `Order`/`OrderItem` write inside
   a DB transaction that re-validates stock/price and decrements
   `stockQuantity`.
2. Admin dashboard: schools, classes, categories, products/variants,
   inventory, assignments, recommended sets, and order management — reusing
   `src/server/queries` rather than duplicating logic.
3. QR code generation/download per school, pointing at `/school/[slug]`.
4. Real product photography (replacing the placeholder tiles) and school
   logos.
5. Order lifecycle UI (`PENDING` → ... → `DELIVERED`/`CANCELLED`) for staff
   and for the parent to check order status.
6. Basic auth for the admin surface only (still no customer accounts —
   guest checkout stays the default per the brief).
