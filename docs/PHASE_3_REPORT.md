# Phase 3 — Klasiq Branding & Shop Admin / Daily Operations

Date: 2026-08-04

Builds on the committed Phase 2 baseline (`832e393fa340d4f6975238117172c1d6fd10e66f`).
Read [`docs/PHASE_0_AUDIT.md`](./PHASE_0_AUDIT.md),
[`docs/PHASE_1_REPORT.md`](./PHASE_1_REPORT.md), and
[`docs/PHASE_2_REPORT.md`](./PHASE_2_REPORT.md) first — this document only
covers what changed.

## Part A — Branding: rename to Klasiq

### Inventory of the old identity (before changing anything)

| Where | What it was |
|---|---|
| `src/lib/constants.ts` | `STORE_NAME = "Wearwell Uniforms"`, `STORE_TAGLINE` |
| `src/app/layout.tsx` | Metadata title/description built from `STORE_NAME`; `metadataBase: new URL("https://example.com")` — a hard-coded placeholder domain |
| `src/app/sitemap.ts`, `src/app/robots.ts` | Same hard-coded `https://example.com` |
| `src/app/school/[slug]/page.tsx` | `STORE_NAME` in the demo-school disclaimer; unconditional `"Official Uniform Collection"` text |
| `src/components/site/footer.tsx` | Hard-coded "Serving local families for 30 years" copy (not centralized) |
| `package.json` | `"name": "shop"` — a directory-derived placeholder, not a real project identity |
| `README.md` | Untouched `create-next-app` boilerplate |
| `src/app/favicon.ico` | Default Next.js/Vercel triangle icon |
| Test files | None depended on the old brand string — confirmed via search before renaming |

Nothing else referenced the old name — no seed/demo copy, no other component,
no env var, no route, no database column. `docs/PHASE_1_REPORT.md` still
says "Wearwell Uniforms" in its own historical text; that's a snapshot of
what was true then and is intentionally left as-is (documentation of past
phases isn't a live branding surface).

### What changed

- **Centralized config** (`src/lib/constants.ts`): a single `BRAND` object
  (`name`, `wordmark`, `tagline`, `description`, `heritageLine`,
  `legacyStoreNames`) plus `ADMIN_BRAND_NAME` and `getBackedByLine()`.
  Every place that previously hard-coded a brand string now imports from
  here — header, footer, homepage, layout metadata, school page, admin
  shell, admin login page.
- **Configurable base URL** (`src/lib/site-config.ts`): `SITE_URL` reads
  `process.env.SITE_URL`, falling back to `http://localhost:3000`. Replaces
  the hard-coded `https://example.com` in `layout.tsx` (metadataBase),
  `sitemap.ts`, and `robots.ts`. No production domain is assumed anywhere —
  this is exactly the boundary Phase 4's QR code generation will need.
- **"Official Uniform Collection" claim fixed**: added
  `School.isVerifiedPartner` (boolean, default `false`, small and justified
  per the brief's own carve-out). The storefront now shows neutral "School
  Uniform Collection" by default and only shows "Official Uniform Partner"
  when this flag is explicitly true — controllable per-school from
  `/admin/schools/[id]`. No school (including all seeded demo schools)
  has this set, so no unsupported claim is made anywhere right now.
- **Retail heritage**: `BRAND.heritageLine` ("Serving local families for
  around 30 years") deliberately avoids a hard-coded founding year per the
  brief's own instruction — no "Since 1996" anywhere. `getBackedByLine()`
  produces "Backed by Milan Readymade & General Store and Shubham
  Vashtralaya," shown once in the footer and once on the homepage's trust
  section — not repeated on every screen.
- **Favicon**: replaced the default `favicon.ico` with `src/app/icon.tsx`,
  a code-generated "K" wordmark tile (Next.js `ImageResponse`) in the
  site's warm maroon. Not a full brand identity package — a clean, honest
  placeholder consistent with the design direction, as the brief asked for.
- **`package.json` name**: `"shop"` → `"klasiq"`. Purely an internal npm
  package identifier; doesn't touch routes, schema, migrations, or env
  vars, so this is safe per "Internal Renaming Safety."
- **`README.md`**: rewritten from the untouched `create-next-app`
  boilerplate into real project documentation (stack, setup, admin
  bootstrap, scripts, env vars).
- **Order confirmation message** (`src/lib/order-message.ts`): the closing
  line already said "Thank you for shopping with us!" — generic wording
  that doesn't need a rename, left as-is rather than force-inserting the
  brand name into every generated string.

### What was deliberately NOT renamed

Database table names, the `Basket`/`Order`/etc. model names, migration
history, environment variable names, and route paths are all unrelated to
customer-facing branding and were left untouched — renaming any of them
would be pure churn with real risk (migration reproducibility, muscle
memory) for zero user-visible benefit, exactly as the brief warned against.

## Part B — Klasiq Admin & Daily Operations

### Admin architecture

**Route structure**: public storefront routes moved into an `(site)` route
group (`src/app/(site)/...`) with their own layout carrying the
header/footer/search/bag chrome. The root layout (`src/app/layout.tsx`) is
now minimal — fonts, global CSS, the toast host — nothing else. Admin lives
under `src/app/admin/`, split into:

```
src/app/admin/
  login/page.tsx              — public
  (protected)/
    layout.tsx                 — the single enforcement point for page views
    page.tsx                   — /admin (dashboard)
    orders/page.tsx            — /admin/orders
    orders/[orderNumber]/page.tsx
    schools/page.tsx           — /admin/schools
    schools/new/page.tsx
    schools/[id]/page.tsx      — edit + classes + assignments + recommended sets
    products/page.tsx          — /admin/products
    products/new/page.tsx
    products/[id]/page.tsx     — edit + variants
    inventory/page.tsx         — /admin/inventory
    categories/page.tsx        — /admin/categories
```

This was a genuine architectural gap the brief's own requirements exposed:
without it, `/admin/*` would have inherited the public site's header/search/
bag UI, which makes no sense for an internal tool and would have made "admin
should not look like a marketing site" impossible to satisfy cleanly.

### Authentication / session strategy

- **`AdminUser`** (id, name, email, passwordHash, isActive, timestamps) —
  no roles/permissions, no self-service signup, exactly as scoped.
- **Passwords**: `src/lib/admin/password.ts` uses Node's built-in
  `crypto.scrypt` (OWASP-acceptable alongside bcrypt/argon2) with a random
  16-byte salt per password, stored as `salt:hash` hex. Verification uses
  `crypto.timingSafeEqual` — never a plain `===` on hash bytes. **Zero new
  dependencies** for this — no `bcrypt`/`bcryptjs` package needed.
- **Sessions**: `AdminSession` (tokenHash, adminUserId, expiresAt). The
  cookie holds a random 32-byte token; only its SHA-256 hash is ever
  written to the database, so a DB read/backup/leak can't be replayed as a
  live session. Cookie: `httpOnly`, `secure` in production only,
  `sameSite: "lax"`, scoped to `path: "/admin"`, 14-day expiry. Logout
  deletes the session row and clears the cookie.
- **Bootstrap**: `prisma/create-admin.ts` (`npm run db:create-admin`),
  reading `ADMIN_BOOTSTRAP_NAME`/`_EMAIL`/`_PASSWORD` from the environment.
  Deliberately **separate from `prisma/seed.ts`** — seed data is
  demo/dev-only and must never run against a real deployment, while this
  script only ever touches `admin_users` and is safe (idempotent — a
  no-op if the email already exists) to run anywhere, including
  production. No real credentials are committed; `.env.example` documents
  the variables with placeholder values only.
- **Route protection**: `admin/(protected)/layout.tsx` calls
  `getAdminSession()` and `redirect("/admin/login")` if it returns `null` —
  this is the enforcement point for every page view under that group.
  **Every one of the 23 exported admin Server Action functions**
  independently calls `getAdminSession()` again at its own top and returns
  an `UNAUTHORIZED` result if there's no session — verified by a scripted
  grep pass, not just eyeballed (see "Security review" below). This
  matters because a client that already holds a reference to a Server
  Action can call it directly regardless of what page last rendered; the
  layout redirect alone would not stop that.
- **No middleware.** Next.js middleware would need to run in the Edge
  runtime (or requires opting into Node middleware), and Prisma's default
  Postgres driver isn't Edge-compatible. Rather than fight that, every
  admin page and action independently verifies the session — a `getAdminSession()`
  call is one indexed database lookup, not meaningfully slower than an
  Edge-based check would be, and it's the same enforcement point already
  proven correct by the Phase 2 pattern (`getAdminSession()` mirrors
  `getBasketId()`).

### School-management workflow

`/admin/schools` (search) → `/admin/schools/new` (create) →
`/admin/schools/[id]` (one page, sectioned): school details (name,
slug, city, logo URL, active toggle, verified-partner toggle), Classes
(add/remove chips), Uniform Assignments (product × class × gender, with
"All Classes"/"All (unisex)" defaults), Recommended Complete Uniform Sets
(create a set, add/remove line items with quantities). Everything an admin
changes here is immediately live on the public storefront — verified
manually (see below): a product assigned to a school and added to a
recommended set appeared on `/school/[slug]` without any code change or
restart.

**Slug changes**: editing an existing school's slug shows an inline warning
("breaks any printed QR codes or shared links using the old address")
rather than silently allowing it. Redirects/aliases for changed slugs are
explicitly out of scope for this phase — flagged as a Phase 4 candidate if
slug changes turn out to be common in practice.

### Product/variant workflow

`/admin/products` (search + category filter) → `/admin/products/new` →
`/admin/products/[id]` (details + variants). A product is Generic
(`schoolId: null`, reusable by any school) or exclusive to one school —
the form defaults to Generic and warns that most items should stay that
way, preserving the Phase 1 reusable-product architecture rather than
letting admin accidentally duplicate "White Shirt" per school.

**Variants**: each size has its own SKU, price (entered in ₹, converted to
paise via the existing `rupeesToPaise` helper — no new money-handling
logic), and stock count. Deleting a variant with order history hits the
database's `onDelete: Restrict` foreign key and returns a friendly
"has order history — deactivate it instead" message instead of a raw
Prisma error; a variant with zero order history really does get deleted.
**Deactivation** (new `ProductVariant.isActive`, default `true`) is the
normal safe path — public queries (`getSchoolAssignedProducts`,
`getGenericCategoryProducts`) now filter `variants: { where: { isActive: true } }`,
so a deactivated size disappears from the storefront without touching
historical `OrderItem` rows, which still reference it via the existing
`onDelete: Restrict` relation.

### Inventory-management strategy

`/admin/inventory`: search + category + stock-level filters, one row per
size. The brief explicitly asked for a **single clear model**, not an
ambiguous mix — the choice made:

- **Two delta-based affordances** (the quick +1/-1 stepper, and "Receive
  stock" for "N units arrived") both go through one primitive,
  `adjustInventoryByDelta`, which is safe by construction: a guarded
  `updateMany({ where: { stockQuantity: { gte: -delta } } })` only applies
  if the result won't go negative — the exact same pattern as Phase 2's
  checkout stock decrement, just generalized to accept any sign.
- **One absolute-value affordance** ("Set exact," for a physical stock
  count) goes through `setInventoryQuantity`, which uses **optimistic
  concurrency**: the admin's last-seen quantity is sent back as
  `expectedPreviousQuantity`, and the guarded update only applies if the
  row still matches it. If a customer bought one in between, the admin
  gets a "stock changed since you loaded this page — refresh" CONFLICT
  instead of silently overwriting the sale (a real "read then overwrite"
  lost-update bug the brief specifically warned against).

Both are proven under real concurrency, not just argued — see "Tests"
below, including the case where a customer checkout and an admin
correction race for the same units.

### Inventory audit trail

New `InventoryAdjustment` model: `productVariantId`, `previousQuantity`,
`newQuantity`, `delta`, `reason` (`STOCK_RECEIVED` | `MANUAL_CORRECTION` |
`ORDER_CANCELLATION_RESTORE`), optional `note`, `adminUserId` (nullable,
`SetNull`), `orderId` (nullable, `SetNull`, set only for cancellation
restores). **Deliberately does not cover the customer-checkout decrement**
— that's already fully traceable via `Order`/`OrderItem` (you can always
see "this order took N units" from the order itself), and routing it
through this table too would mean touching the proven, tested Phase 2
checkout transaction for no added traceability. This is the answer to "why
did this stock quantity change" for every *manual* change, which is the
actual gap Phase 3 exists to close.

### Order-management workflow

`/admin/orders`: search (order number / name / mobile), filter by order
status / payment status / fulfillment method, newest first. `/admin/orders/[orderNumber]`:
full order detail plus status actions. **Both the order-status and
payment-status action buttons are computed from the exact Phase 2
`nextValidOrderStatuses`/`nextValidPaymentStatuses` functions** — only
valid next transitions ever render as a button, and the server
independently re-validates via `isValidOrderStatusTransition`/
`isValidPaymentStatusTransition` before writing anything. Nothing
duplicates the lifecycle rule in the UI layer.

### Cancellation/restock strategy

`src/server/commerce/update-order-status.ts` (`updateOrderStatus`)
special-cases a transition to `CANCELLED`: inside one transaction, it
guard-updates the order's status (`WHERE id = ? AND status = <status just
read>`), then increments stock for every line item and writes an
`InventoryAdjustment` (`ORDER_CANCELLATION_RESTORE`) per item. Two
safety properties, both proven by tests:

1. **Idempotent**: if the order is already `CANCELLED`, the function
   returns success immediately (`alreadyInState: true`) without touching
   inventory again — a second click, or a stale page's retry, is a safe
   no-op.
2. **Concurrency-safe**: the status write is the same guarded
   `updateMany` pattern Phase 2 used for stock — two admins (or one
   admin double-clicking) racing to cancel the same order can't both
   restore inventory; the loser's guard fails and it either sees the
   idempotent already-cancelled state or a `CONFLICT` asking them to
   refresh.

**Cancellable statuses**: exactly the ones already encoded in Phase 2's
`BASE_TRANSITIONS` map — every non-terminal status (`PENDING`, `CONFIRMED`,
`PREPARING`, `READY_FOR_PICKUP`, `OUT_FOR_DELIVERY`) can move to
`CANCELLED`; `DELIVERED` and `CANCELLED` are terminal and reject it. This
wasn't re-decided in Phase 3 — it's reused, not reinvented, per the
brief's explicit instruction not to duplicate lifecycle rules.

### Payment-status strategy

COD/pay-at-store orders start `UNPAID`. Admin can move `UNPAID → PAID` or
`UNPAID → FAILED`, and `PAID → REFUNDED`. `REFUNDED` is an **operational
record only** — there is no payment gateway in this phase, so "refund"
here means "staff have recorded that money was returned," not an actual
transaction. **A real gap found during manual verification** (documented
honestly, not hidden): an admin could initially "Mark Paid" a `CANCELLED`
order, which makes no sense — there's nothing left to collect payment for.
Fixed by adding an explicit check in `updatePaymentStatus`: a `CANCELLED`
order can still move an existing `PAID` balance to `REFUNDED`, but can
never be freshly marked `PAID`. Covered by two new tests
(`update-order-status.test.ts`) and the button is also hidden client-side
for that case (server-side check remains the actual enforcement point).

### Delete vs. archive policy

| Entity | Policy |
|---|---|
| `School` | Never deleted — `isActive` toggle only |
| `Product` | Never deleted — `isActive` toggle only |
| `ProductVariant` | Deactivate (`isActive`) if it has order history (delete is blocked by the DB `Restrict` FK and caught with a friendly message); hard-delete allowed only when it has none |
| `SchoolClass` | Hard-delete allowed — cascades to its own assignments/recommended-set scoping, which are meaningless without the class (not historical data the way orders are) |
| `SchoolUniformAssignment` / `RecommendedUniformSet(Item)` | Hard-delete allowed — these are current-state configuration, not history |
| `Category` | Hard-delete blocked while it has any products (`deleteCategoryAction` counts products first and returns a clear message); otherwise allowed |
| `Order` / `OrderItem` | Never deleted by anything in this app — no code path does it |

### Image-storage decision

No object-storage provider is configured yet. Rather than build a fake
local-filesystem upload that would silently break the moment this app runs
on a host with an ephemeral/read-only filesystem (most serverless/Next.js
hosts), both school logos and product images are a **plain external URL
text field** — admin pastes a link to an already-hosted image. This is
honest (nothing is pretended to be production-safe that isn't), requires
zero new infrastructure, and the existing Phase 1 placeholder-tile
component continues to render exactly as before whenever no URL is set.
Proper object storage (S3-compatible, with a real upload UI) is deferred
to when production infrastructure is actually being provisioned — flagged
under Phase 4 below.

### Concurrency protections

Three independent guarded-update mechanisms, all following the same
pattern established in Phase 2 (conditional `updateMany`, never
"read-then-write"):

1. **Stock decrement/increment** (`adjustInventoryByDelta`) — guards
   against going negative.
2. **Stock set-to-value** (`setInventoryQuantity`) — optimistic
   concurrency against a stale read.
3. **Order/payment status transitions** — guards against two actors
   racing to change the same order.

All three are proven with real Postgres integration tests using
`Promise.all`, not just sequential calls — including the specific scenario
the brief called out: a customer checkout and an admin stock correction
racing for the same units, verified to never lose either operation's
effect and never drive stock negative.

## Tests

`npm test` → **161 tests passing** (161 = 107 from Phase 1/2 + 54 new),
verified fresh against a completely empty database migrated from scratch
(see "Verification gate" below) — not dependent on any prior state.

New test files:

- `src/lib/admin/__tests__/password.test.ts` — hash/verify round trip,
  random salting, wrong-password rejection, malformed-hash safety,
  case sensitivity.
- `src/lib/validation/__tests__/admin-products.test.ts`,
  `admin-schools.test.ts` — negative price rejected, zero price accepted,
  negative/fractional stock rejected, invalid slugs rejected, invalid
  logo URL rejected, zero-quantity set item rejected.
- `src/server/commerce/__tests__/update-order-status.test.ts` (16 tests,
  real Postgres) — valid pickup transition, invalid skip-ahead transition,
  fulfillment-mismatched transition rejected, unknown order rejected,
  cancellation restores inventory + writes one audit row, **repeated
  sequential cancellation doesn't double-restore**, **true concurrent
  double-cancel (`Promise.all`) doesn't double-restore**, cancelling a
  `DELIVERED` order rejected, mark-paid, invalid payment transitions both
  directions, and the two new cancelled-order-payment tests above.
- `src/server/commerce/__tests__/inventory.test.ts` (10 tests, real
  Postgres) — delta increase/decrease, negative-delta rejected,
  stockStatus recompute on threshold cross, absolute set with matching
  optimistic lock, negative absolute value rejected, **CONFLICT on a stale
  optimistic-lock value (and confirms the stale write never applied)**,
  and the two concurrency scenarios: checkout + admin correction both
  succeeding when stock covers both, and exactly one succeeding (never
  both, never neither, stock never negative) when combined demand exceeds
  stock.
- `src/server/queries/admin/__tests__/domain-constraints.test.ts` —
  duplicate school-slug and product-slug rejection at the database
  constraint level (`P2002`), deactivated product/variant correctly
  excluded from the school storefront and generic category listings.

### Why admin CRUD (schools/products/categories) isn't integration-tested the same way

The admin Server Actions transitively import `src/lib/admin/session.ts`,
which is marked `"server-only"` — calling them directly from a Vitest test
(outside Next's request-handling context) throws immediately
("This module cannot be imported from a Client Component module"),
confirmed empirically before deciding this, not assumed. This is the same
architectural boundary Phase 1/2 already had for `lib/basket.ts`. Given
that, this phase's automated coverage is split deliberately:

- The **framework-agnostic commerce layer** (`update-order-status.ts`,
  `inventory.ts`) — where concurrency/idempotency correctness actually
  lives — has full Postgres integration test coverage, exactly like
  Phase 2's `place-order.ts`.
- The **database invariants the admin CRUD actions depend on** (unique
  slugs, `isActive` filtering) are tested directly against Postgres.
- The **admin CRUD action layer itself** (create/edit school, product,
  category, assignments, recommended sets) is verified through the manual
  browser pass below, end-to-end, rather than faked with a mocked session.

## Manual browser verification

Dev server + headless Chromium, one continuous flow, zero console errors
throughout:

1. Admin login (wrong password rejected with a generic message, correct
   password succeeds).
2. Created a school (`Test P3 School ...`), added a class ("Class 7").
3. Created a product (`Test P3 Product ...`), added a size (28, ₹399,
   stock 15).
4. Assigned the product to the school (school-wide, all genders).
5. Created a Recommended Complete Uniform Set for the school and added the
   product to it.
6. Visited the **public** school storefront — confirmed the product and
   the recommended set both appeared, with zero code changes or restarts.
7. Placed a real customer order for it (size 28, qty 1) through the normal
   checkout flow.
8. In admin, walked the order through the full Store Pickup lifecycle:
   Confirm → Start Preparing → Mark Ready for Pickup → Mark Paid → Mark
   Delivered — confirmed the order detail page reflected each state and
   confirmed stock dropped 15 → 14.
9. Placed a second order (qty 2) — confirmed stock dropped 14 → 12.
10. Cancelled that second order from admin — confirmed inventory
    restored 12 → 14, an inventory-adjustment record appeared on the
    order detail page, and the Cancel button disappeared (order now
    closed).
11. Attempted to cancel again — no cancel action available, stock stayed
    at 14 (not double-restored).
12. Verified `/admin/categories` and `/admin/inventory` (with a search
    filter) both render real data correctly.
13. **Mobile** (390×844): admin login, dashboard, and the hamburger menu
    opening the same nav as desktop, all confirmed.

One real gap was found and fixed during this pass (documented above under
"Payment-status strategy" — cancelled orders could otherwise be marked
Paid) — this is exactly why the brief requires actually exercising the app
rather than asserting it works from reading the code.

## Security review

Actual controls verified, not asserted:

- **Every admin page** is under `admin/(protected)/` except `/admin/login`
  — confirmed by listing all 12 admin `page.tsx` files.
- **Every one of the 23 exported admin Server Action functions** calls
  `getAdminSession()`/`requireAdmin()` as its first check — confirmed with
  a scripted per-function grep pass (`awk` matching each
  `export async function` block for a session-check call before its
  closing brace), not just spot-checked.
- **Passwords**: scrypt-hashed, salted, `timingSafeEqual` comparison;
  grepped the whole admin/auth code path for any password logging — none
  found.
- **Sessions**: only a SHA-256 hash of the token is stored; cookie is
  `httpOnly`, `secure` in production, `sameSite: lax`, scoped to
  `/admin`, 14-day expiry; expired/deactivated-user sessions are rejected
  server-side on lookup.
- **PII in logs**: grepped `server/actions`, `server/commerce`,
  `lib/admin` for `console.*` calls — the only one is the pre-existing
  Phase 2 `console.error` in `place-order.ts`, which logs only
  `err.message` (a Prisma constraint name, never customer data).
- **Access tokens**: grepped all admin queries/components/pages for
  `accessToken` — never referenced; the admin order views use the
  order number only.
- **CSRF**: Next.js Server Actions verify the request `Origin` header by
  default; `next.config.ts` has no `serverActions.allowedOrigins`
  override that would weaken this.
- **Raw database errors**: the one place that catches a specific Prisma
  error code (`P2003` on variant delete) returns a friendly message; every
  other unexpected error re-throws and is handled by Next.js's default
  production behavior (generic message to the client, full detail only in
  server logs) rather than being swallowed or hand-leaked.
- **Redirects**: every `redirect()` call in the codebase uses either a
  hard-coded path or a value the same request just generated/verified
  server-side (e.g. a freshly-created order's own accessToken) — never a
  raw, unvalidated user-supplied URL.
- **Secrets**: `.env` confirmed git-ignored; `.env.example` contains only
  placeholder values; grepped tracked files for the actual dev bootstrap
  password — not present anywhere outside the git-ignored `.env`.

### Known, honestly-documented limitations (not fixed this phase)

- **No login rate limiting / lockout.** A scripted brute-force attempt
  against `/admin/login` is only slowed by the scrypt hash cost itself,
  not blocked. Acceptable for a single small-shop admin account in this
  phase; flagged for Phase 4 if it becomes a real concern.
- **No audit log for admin CRUD** (who edited a product's price, when) —
  only inventory *quantity* changes are tracked (`InventoryAdjustment`).
  A broader admin activity log is a reasonable Phase 4 addition, not
  built here to avoid scope creep.
- **Single admin role.** Every `AdminUser` can do everything — no
  read-only staff, no per-section permissions, exactly as scoped
  ("Do not build complex roles/permissions").

## Verification gate

```
$ npm run typecheck   → clean
$ npm run lint        → clean
$ npm test            → 161/161 passed
$ npm run build       → succeeds, 22 routes (12 admin + 10 public/API)
```

Additionally, to prove the migration history is coherent and reproducible
(not just "worked on my already-migrated dev database"): created a
brand-new empty Postgres database, ran `prisma migrate deploy` (all three
migrations — Phase 1 `init`, Phase 2 `phase2_checkout_orders`, Phase 3
`phase3_admin_operations` — applied cleanly in order), ran `prisma/seed.ts`
and `prisma/create-admin.ts` successfully against it, then ran the full
161-test suite against that fresh database — all passing, confirming no
test depends on leftover local state. That verification database was then
dropped.

Dev database reset to a clean seeded baseline (demo catalog + one
bootstrap admin user) after all manual testing — no leftover test
schools/products/orders/inventory-adjustments remain.

## What remains for Phase 4

1. QR code generation/download per school, using the now-configurable
   `SITE_URL`.
2. School slug-change aliasing/redirects, if changing an established
   school's slug turns out to be a real operational need.
3. Real object storage for product/school images, replacing the
   URL-paste interim.
4. Admin activity log beyond inventory adjustments (who changed what,
   when) if that traceability becomes necessary.
5. Login rate limiting, if the admin surface is ever exposed somewhere
   more exposed than a small shop's own use.
6. Wiring `order-message.ts` into an actual WhatsApp/SMS send (still not
   done — still explicitly out of scope, same as Phase 2 left it).
7. Real online payment (UPI), using the `PaymentStatus`/`PaymentMethod`
   schema headroom already in place since Phase 2.
