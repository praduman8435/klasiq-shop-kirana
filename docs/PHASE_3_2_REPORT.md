# Phase 3.2 — Unified Counter Sales Engine

Date: 2026-08-04

This document covers both parts of Phase 3.2: **Part 1** (the commerce
engine — schema, shared inventory core, `createCounterSale`, basic UI) and
**Part 2** (Counter POS User Experience — no new business logic, only
making that same engine fast to use for a busy cashier). Part 1's sections
are below; Part 2's own section follows "What remains (after Part 1)".

Builds on the committed Phase 3 baseline (`e5f9bcaac69d4556cacfc0b394d74dd530d41135`)
and the uncommitted Phase 3.1 Customer Identity Foundation work. Read
[`docs/PHASE_0_AUDIT.md`](./PHASE_0_AUDIT.md) through
[`docs/PHASE_3_1_REPORT.md`](./PHASE_3_1_REPORT.md) first — this document
only covers what changed.

**Scope note**: this phase builds the commerce *foundation* for in-store
sales, not a complete POS. GST invoices, receipt printing, barcode
scanning, a discount engine, coupons, purchase orders, accounting, a cash
drawer, tax reporting, returns/exchange, WhatsApp, OTP, a customer portal,
and analytics are all explicitly out of scope and untouched.

## What was built

- A single, shared commerce core (`src/server/commerce/order-core.ts`)
  extracted from Phase 2's `placeOrderForBasket` — inventory deduction,
  product lookup, pricing, order-number generation, and idempotency
  lookup all now live in exactly one place, used by **both** online
  checkout and counter sales. Nothing about checkout's behavior changed —
  proven by the full pre-existing test suite passing unmodified after the
  extraction (see "Architecture" below).
- `Order.source` (`ONLINE` | `COUNTER`) — every order now says how it was
  initiated, without hard-coding assumptions about what those sources are
  used for anywhere else in the app.
- `createCounterSale` (`src/server/commerce/counter-sale.ts`) — the one
  path that creates a counter-sale `Order`. Reuses Phase 3.1's
  `findOrCreateCustomerByPrimaryPhone` unchanged for customer
  identity, and the new shared inventory core for stock/pricing.
- `/admin/counter-sale` — a single fast-entry page: search-and-add
  products (by name or SKU), a running cart with quantity steppers,
  customer selection (Guest / Existing / New), optional school, payment
  method, one "Complete Sale" button.
- Customer/product search foundations reused, not duplicated: product
  search is new (`src/server/queries/admin/counter-sale.ts`), customer
  search is Phase 3.1's existing `searchCustomers` called as-is.
- Admin order list/detail now show a Source badge and handle guest
  (nullable) customer fields and the new `COUNTER_HANDOVER` fulfillment
  type; the public order-confirmation page does the same.

## Schema changes

Full annotated source: `prisma/schema.prisma`. Migration:
`prisma/migrations/20260804130000_phase3_2_counter_sales/`.

- **New enum `OrderSource`**: `ONLINE`, `COUNTER`.
- **`FulfillmentType`** gains `COUNTER_HANDOVER` (additive `ALTER TYPE ...
  ADD VALUE`) — see "Order status for counter sales" below for why this
  is a real third fulfillment method, not a `STORE_PICKUP` synonym.
- **`PaymentMethod`** gains `CASH`, `CARD` (additive) — `CASH_ON_DELIVERY`
  remains exclusively an online-checkout concept; a counter sale never
  uses it.
- **`Order.source`**: `OrderSource NOT NULL DEFAULT ONLINE`. The backfill
  default is a true fact, not invented data — every order from Phases
  1–3 genuinely was placed online, since counter sales didn't exist
  until this phase.
- **`Order.customerName` / `Order.customerMobile`**: `DROP NOT NULL`
  (loosened, not destroyed — existing rows keep their values). Required
  so a guest counter sale can record neither. Online checkout's own
  `checkoutInputSchema` still requires both, so no online order's shape
  changes.
- **`@@index([source])`** on `Order`, for filtering/reporting by channel
  as the two streams grow.

No table was dropped, no column was removed, no existing NOT NULL
constraint was tightened. Every change is additive or a loosening.

## Architecture — one inventory implementation, not two

The brief was explicit: never duplicate order creation, inventory
deduction, pricing, customer creation, or product lookup. Concretely:

- **Before this phase**, `placeOrderForBasket` (Phase 2) inlined: an
  upfront per-item stock/availability check, a guarded `updateMany` stock
  decrement loop, a `stockStatus` recompute, subtotal calculation, and an
  order-number generate-and-retry loop — all specific to basket checkout.
- **`src/server/commerce/order-core.ts`** now holds three primitives,
  extracted from that code with its behavior preserved exactly:
  - `resolveAndDecrementOrderLines(tx, rawLines)` — given raw
    `{productVariantId, quantity}` lines (duplicate variant ids merged by
    summing quantity), reads each variant+product fresh inside the
    caller's transaction, reports every unavailable line at once, then
    guard-decrements stock per line with the same conditional `updateMany`
    Phase 2 proved safe under concurrency (`WHERE stockQuantity >= ?`).
    Returns priced, named line snapshots ready for `Order.items.create`.
  - `createOrderWithUniqueNumber(tx, buildData)` — the order-number
    generate/retry-on-collision loop, decoupled from any specific error
    type so both callers can shape their own domain error on exhaustion.
  - `findOrderByIdempotencyKeyRaw(idempotencyKey)` — the raw lookup both
    flows' idempotency pre-check and P2002-race-recovery share.
- **`placeOrderForBasket`** (Phase 2, online) now calls all three instead
  of inlining them. Its exported types, error shapes, and the exact
  behavior every existing test asserts are unchanged.
- **`createCounterSale`** (this phase, counter) calls the *same* three
  primitives with admin-submitted lines instead of basket items.

This is proven, not just argued: the full pre-existing test suite
(`place-order.test.ts`, `inventory.test.ts`, all 13+ concurrency and
idempotency cases) was re-run immediately after the extraction, before any
counter-sale code was written, and passed unchanged. A dedicated new test
(`counter-sale.test.ts`, "cross-flow concurrency") then proves the *point*
of sharing this code: an online checkout and a counter sale racing for the
literal last unit of the same variant can never both succeed — exactly one
wins, the DB is never left inconsistent, regardless of which "flow" either
request came from. Two flows, one inventory guarantee.

`findOrCreateCustomerByPrimaryPhone` and `updateCustomerContactInfo`
(Phase 3.1) are called by `createCounterSale` completely unchanged — no
new customer-creation logic exists anywhere in this phase.

## Order source

`OrderSource` is a plain fact about how an order started, deliberately
not load-bearing for anything else:

- Inventory deduction, pricing, and the `Customer` model behave
  identically regardless of `source` — the shared core in
  `order-core.ts` has no branch on it at all.
- The only places `source` is read are display/filtering: the admin order
  list/detail badges, and the new optional `source` filter on
  `/admin/orders` (mirrors the existing status/paymentStatus/
  fulfillmentType filter pattern in `order-filters.tsx`).
- Nothing hard-codes "there are exactly two sources" outside the enum
  itself and its two current call sites (`placeOrderForBasket` always
  writes `ONLINE`, `createCounterSale` always writes `COUNTER`) — a third
  future channel (e.g. a marketplace integration) is an additive enum
  value, not a redesign.

## Order status for counter sales

**Chosen: `COUNTER_HANDOVER` is created directly as `status: DELIVERED`,
`paymentStatus: PAID`.** Reasoning:

- A counter sale's customer is standing at the register and leaves with
  the goods immediately — there is no `PENDING → CONFIRMED → PREPARING`
  gap to model truthfully. Forcing a counter sale through that pipeline
  (and requiring staff to click through it every single sale, "dozens or
  hundreds of times a day") would be exactly the "unnecessary lifecycle
  states" the brief warned against.
- **No new `OrderStatus` value was added.** `DELIVERED` already means
  "the customer has the goods" for online orders (after pickup or
  delivery) — a counter handover is that same fact, just true from the
  moment of creation instead of reached via a transition. Reusing it
  keeps `order-lifecycle.ts` completely untouched: `DELIVERED` was
  already terminal (no outgoing transitions, for any fulfillment type),
  so a counter sale created directly in that state behaves exactly like
  an online order that's already been delivered — no special-casing
  needed anywhere status transitions are validated.
- **`COUNTER_HANDOVER` *is* a new, distinct `FulfillmentType`** (not a
  `STORE_PICKUP` alias) because it means something different: pickup
  implies "will collect later," handover means "already collected." This
  matters for `order-lifecycle.ts`'s `FULFILLMENT_ONLY_STATUS` map (which
  gates `READY_FOR_PICKUP`/`OUT_FOR_DELIVERY` to their respective
  fulfillment types) staying meaningful, and for the admin UI to label
  the sale correctly rather than implying a pickup is still pending.
- Payment is always `PAID` because a counter sale, by construction, only
  exists after staff have confirmed cash/UPI/card was actually collected
  — there is no "record the sale now, collect payment later" case this
  phase's UI supports.

**Delivery-from-shop, without a redesign**: a counter customer who instead
wants their purchase delivered is not a special case of counter sales —
it's simply a `LOCAL_DELIVERY` order, which already has its own correct
`PENDING → ... → OUT_FOR_DELIVERY → DELIVERED` lifecycle from Phase 2.
`Order.source` and `Order.fulfillmentType` are independent columns on the
same row; nothing in the schema or the shared inventory core couples them.
`createCounterSale` currently always writes `fulfillmentType:
COUNTER_HANDOVER` (the one path its UI builds), but the function's own
shape — accept lines, resolve a customer, decrement stock via the shared
core, create an order — has no dependency on that being the only
fulfillment type a counter-initiated order could have. Extending it to
accept `LOCAL_DELIVERY` (with `status: PENDING` instead of `DELIVERED`,
mirroring the online path) is a small, additive change to that one
function whenever a real "deliver from the shop" requirement arrives — not
a schema or architecture change. This wasn't built now because no UI in
this phase asks for it, and building unused paths isn't the goal.

## Customer selection

Three modes, mirrored exactly by `counterSaleCustomerSchema`
(`src/lib/validation/admin-counter-sale.ts`) and
`CounterSaleCustomerInput` (`src/server/commerce/counter-sale.ts`):

- **`GUEST`**: no database read or write for identity at all.
  `Order.customerId`/`customerName`/`customerMobile` are all `null`. A
  sale can never be blocked for lack of customer information.
- **`EXISTING`**: the admin picks a row from
  `searchCustomers` (Phase 3.1, called unmodified) results; the form
  sends that `Customer.id` back. `createCounterSale` looks it up —
  `CUSTOMER_NOT_FOUND` (no order created) if it's gone by submit time —
  and snapshots the *current* `displayName`/`primaryPhone` onto the order,
  the same snapshot-at-order-time pattern `OrderItem` already uses for
  product data.
- **`NEW`**: the admin types a name (optional) and phone (required);
  `createCounterSale` calls `findOrCreateCustomerByPrimaryPhone` exactly
  as Phase 3.1 built it. If that phone already belongs to someone (typed
  fresh at the counter, but really a repeat customer), the *existing*
  customer is reused and its stored `displayName` wins over whatever was
  just typed — never silently overwritten, never duplicated. This is
  proven directly: `counter-sale.test.ts` places two separate counter
  sales for the same phone number and asserts exactly one `Customer` row
  exists afterward, linked to both orders.

Selecting an existing customer does not offer to edit their name/phone
inline — that's `updateCustomerContactInfo` (Phase 3.1, already built,
still not wired into any UI) and stays out of scope for the same reason
it did last phase: no UI was asked for beyond the sale flow itself.

## Guest behavior

A guest counter sale is a fully first-class `Order` — same table, same
inventory guarantee, same `orderNumber`/`accessToken` pair as any other
order (so the same public `/order/[orderNumber]/[token]` confirmation
page works for it, in case a printed slip or a future receipt ever
includes that link). The only difference from a linked sale is that three
columns are `null`. Nothing about stock deduction, pricing, or the order
lifecycle branches on "is this a guest" anywhere in the codebase — guest
is simply the `customer: {mode: "GUEST"}` case of the same customer
resolution step every counter sale goes through.

## Product search

`searchSellableVariants` (`src/server/queries/admin/counter-sale.ts`)
returns one flattened row per sellable variant — size, SKU, price, stock,
category, school — matching on product name *or* SKU
(`OR: [{ product: { name: { contains } } }, { sku: { contains } }]`), so
staff can search "shirt" or paste a SKU and get directly-addable rows
without a second step to open a product and pick a size. `isActive` is
enforced on both the variant and its product, matching the exact filter
`getSchoolAssignedProducts`/`getGenericCategoryProducts` already use for
the public storefront — a deactivated size or product never appears at
the counter either, reusing the existing convention rather than inventing
a new one.

SKU lookup is already efficient (`ProductVariant.sku` carries a unique
index from Phase 1); the `contains` name/SKU search is the same
non-indexed-substring tradeoff `getAdminProducts`/`getAdminOrders` already
accept elsewhere in this admin — consistent with existing precedent, not
a new limitation introduced here.

## Payment

`paymentMethod` accepts `CASH | UPI | CARD` for a counter sale — recorded
only, no gateway integration, matching the brief exactly. `paymentStatus`
is always written `PAID` (see "Order status" above for why). The schema
change (`PaymentMethod` gains `CASH`/`CARD`) is additive; `getFulfillmentLabel`/
`getPaymentMethodLabel` (`src/lib/order-message.ts`) were converted from
partial ternaries to exhaustive `switch` statements specifically so the
compiler — not a runtime gap — catches any future enum value left
unlabeled.

## Customer history

`Customer.lastOrderAt` is updated inside the same transaction as order
creation whenever a counter sale is linked to a customer (`EXISTING` or
`NEW`, never `GUEST`) — the same column Phase 3.1 added and left
completely unwritten pending "a future checkout integration." This phase
is the first writer of it. Online checkout still does not link orders to
`Customer` at all (see "What remains" below), so `lastOrderAt` today only
reflects counter-sale recency, not a customer's full omnichannel history
— an honest, temporary asymmetry that resolves itself the moment online
checkout gets the same integration, with no further schema change needed.

`Order.customerId` (Phase 3.1) is what actually lets a future purchase-
history view join counter and online orders together per customer once
both write it — this phase populates it correctly on the counter side;
nothing else needed to change for that convergence to already be possible
in the data model.

## Concurrency

Three guarantees, all inherited for free by sharing `order-core.ts`
rather than re-proving them:

1. **Same-variant race, any two flows** — the guarded `updateMany` in
   `resolveAndDecrementOrderLines` is the one and only stock-decrement
   statement either flow ever executes. Proven directly with a real
   Postgres `Promise.all` race between `placeOrderForBasket` and
   `createCounterSale` for a variant with exactly one unit left —
   exactly one succeeds, stock lands at exactly `0`, never negative.
2. **Same-sale double-submit** — a counter sale carries a client-generated
   idempotency key exactly like checkout's; two concurrent submissions
   with the same key (a cashier's accidental double-click) resolve to one
   order, proven with a real concurrent-race test.
3. **Duplicate cart lines** — if the same variant somehow appears twice in
   one sale's line list (a UI bug, not a normal user action, but exercised
   directly against `createCounterSale`), quantities are merged and the
   guarded decrement runs once per variant, not twice — no double-guard
   race against itself.

## Tests added

`npm test` → **232 tests passing** (232 = 200 from Phases 1–3.1 + 32 new),
verified fresh against a completely empty database migrated from scratch
(five migrations, in order — see "Verification gate" below).

- `src/server/commerce/__tests__/counter-sale.test.ts` (real Postgres,
  19 tests) — guest sale decrements stock and records no customer;
  duplicate variant lines merge into one decrement and one order line;
  EXISTING customer linkage + `lastOrderAt` update; `CUSTOMER_NOT_FOUND`
  for a stale/unknown id; NEW customer creation via the shared service;
  **repeat-phone reuse never creates a duplicate customer across two
  separate counter sales**; invalid-phone rejection with nothing created;
  school association present/absent; empty-sale rejection;
  insufficient-stock rejection (naming the item, stock untouched);
  sequential and **true concurrent** same-idempotency-key resubmission;
  concurrent counter-sale-vs-counter-sale race for the last unit; and the
  **cross-flow** online-checkout-vs-counter-sale race for the last unit.
- `src/server/queries/admin/__tests__/counter-sale.test.ts` (real
  Postgres, 7 tests) — name/SKU search, school name surfaced for a
  school-specific product, a deactivated *variant* excluded even when its
  product is active, an active variant excluded when its *product* is
  deactivated, blank/no-match queries return `[]`.
- `src/lib/validation/__tests__/admin-counter-sale.test.ts` (10 tests) —
  all three customer modes accepted/rejected correctly, empty/zero-quantity
  lines rejected, unknown payment method and malformed idempotency key
  rejected.
- `src/lib/__tests__/order-message.test.ts` — extended (not modified) with
  cases for `COUNTER_HANDOVER`, `CASH`, and `CARD` labels.
- Existing `place-order.test.ts` (13 tests, including both concurrency
  cases) and `inventory.test.ts` re-run unmodified after the
  `order-core.ts` extraction and still pass — the direct proof that
  sharing the inventory core didn't change online checkout's behavior.

## Manual verification

No browser-automation tool was available in this environment (unlike
Phase 1–3's headless-Chromium passes). In its place: the dev server was
started, an admin session was minted directly (bypassing only the login
form itself, which is unchanged from Phase 3 and not touched this phase),
and the following were exercised end-to-end against the real dev
database, then cleaned up:

- `/admin/counter-sale` renders (200) for an authenticated session and
  redirects (307) for an unauthenticated one; the rendered page contains
  the product search, customer section, school picker, and payment method
  controls.
- Ran real `createCounterSale` calls covering: a guest sale with no
  school (general retail item); a new customer, school-linked, multi-item
  sale; and an existing-customer repeat sale (same phone as the previous
  scenario, different payment method) — confirmed the same `Customer` row
  was reused, `stockQuantity` dropped by the exact expected amount across
  all three sales, all three orders appeared in
  `getAdminOrders({ source: "COUNTER" })`, and the school/customer
  linkage was correct end-to-end via `getAdminOrderByNumber`.
- Loaded the resulting order's `/admin/orders/[orderNumber]` page (200,
  showed "Counter Sale"/"Delivered"/"Paid"/"Cash"/"Guest customer — no
  details taken.") and its public `/order/[orderNumber]/[token]` page
  (200, showed "Counter Sale"/"Guest customer"/"Collected in-store at
  time of sale.").
- Checked the dev server's own request log after every request above —
  no errors, no unhandled exceptions.
- All test data created during this pass was deleted afterward; the dev
  database was confirmed to have zero leftover `customers`/counter
  `orders` rows.

This is a deliberately different verification method than prior phases'
browser click-through, not a lesser one for the parts it can reach: the
actual business-logic correctness this phase is riskiest on — concurrency,
idempotency, customer dedup — is proven by real Postgres integration tests
with genuine races, which a manual click-through cannot exercise reliably
anyway. What a browser pass would add beyond this is confidence in
client-side interaction polish (debounced search feel, keyboard behavior,
mobile layout) — not exercised here, called out honestly rather than
silently assumed fine.

**An unrelated incident during this pass, disclosed directly to the user
at the time it happened**: cleaning up the temporary dev server this
verification started, a `pkill -f "next dev"` command matched and killed
an already-running, unrelated dev server for a different project on the
same machine (port 3000). This had nothing to do with the Klasiq codebase
or this phase's changes — it was an overly broad process-kill pattern,
not a bug in anything built here — and the user opted to restart that
other server themselves.

## Verification gate

```
$ npm run typecheck   → clean
$ npm run lint        → clean
$ npm test            → 232/232 passed
$ npm run build       → succeeds, 23 routes (/admin/counter-sale new)
```

Migration reproducibility: created a brand-new empty Postgres database,
ran `prisma migrate deploy` (all five migrations — Phase 1 `init`,
Phase 2 `phase2_checkout_orders`, Phase 3 `phase3_admin_operations`,
Phase 3.1 `phase3_1_customer_identity`, Phase 3.2
`phase3_2_counter_sales` — applied cleanly in order), ran `prisma/seed.ts`
and `prisma/create-admin.ts` successfully against it, then ran the full
232-test suite against that fresh database — all passing. That
verification database was then dropped. The dev database was confirmed to
have zero leftover `Customer`/counter-sourced `Order` rows from this
phase's manual verification.

## What remains (after Part 1)

Explicitly out of scope for Part 1, per its brief — the model is shaped to
support all of them without another redesign:

1. **Online checkout still does not link orders to `Customer`.** This was
   true after Phase 3.1 and remains true after Part 1 — nothing in
   Part 1's brief asked for it, and `placeOrderForBasket` was only touched
   to share the inventory core, not to change what it writes to
   `Order.customerId`. `Customer.lastOrderAt` is therefore currently only
   accurate for counter-sourced activity. Wiring checkout to
   `findOrCreateCustomerByPrimaryPhone` (already built, already tested,
   already used by counter sales) is a small, well-understood next step
   whenever that's the next specification.
2. GST invoices, receipt printing, barcode scanning, a discount engine,
   coupons, supplier purchasing/purchase orders, accounting, a cash
   drawer, tax reporting.
3. Returns/exchange (including "void a counter sale" — a mis-scanned
   counter sale today is `DELIVERED`/terminal, same as a delivered online
   order; correcting it is a returns-module concern, not this phase's).
4. WhatsApp, OTP, customer portal, purchase-history UI, analytics/CRM,
   loyalty.
5. A "deliver from the shop" counter-sale UI path — the underlying
   `createCounterSale`/schema already support a `LOCAL_DELIVERY`
   fulfillment type compositionally (see "Order status for counter
   sales" above); only the UI to offer it wasn't built, since nothing
   asked for it yet.

Part 2 (below) addresses none of the above — it is UI/UX only, on top of
the same, unmodified commerce engine.

---

## Part 2 — Counter POS User Experience

Date: 2026-08-04

**Scope note, restated from the brief**: no new business logic. Every
server-side file from Part 1 — `order-core.ts`, `counter-sale.ts`,
`customer.ts`, `place-order.ts`, the Prisma schema — is **completely
unmodified** in Part 2. This section covers the client-side rework of
`/admin/counter-sale` only, plus two small, additive server-side
`src/lib` additions (a pure cart/validation module and one shared color
constant) that contain zero database access and zero business rules.

### What was built

- `src/lib/counter-sale-form.ts` — a pure, framework-free module (mirrors
  the existing `src/lib/basket-math.ts` pattern) holding all cart
  math, validation, and the submit-blocking gate. Nothing in it touches
  React, the DOM, or the database.
- `src/components/admin/counter-sale-product-search.tsx` — instant,
  keyboard-navigable product search extracted into its own component,
  replacing the inline search block from Part 1.
- `src/components/admin/counter-sale-customer-panel.tsx` — the
  Guest/Existing/New customer flow extracted into its own component, with
  keyboard-navigable search and a "last order date" surfaced per result.
- `src/components/admin/counter-sale-form.tsx` — rewritten to orchestrate
  the two components above, plus: a clear-cart action, live running
  totals (distinct product count *and* total unit quantity), a
  "recent schools" quick-select backed by `localStorage`, a compact
  review strip pinned above the submit button, and a dedicated
  post-sale success screen with a "Start New Sale" action.
- `src/components/admin/use-debounced-search.ts` — the debounce hook
  extracted out of the Part 1 form so both search panels share one
  implementation instead of two copies.
- `STOCK_STATUS_TEXT_CLASS` promoted from a private constant inside
  `inventory-row.tsx` to a shared export in `src/lib/stock.ts`, now used
  by both the inventory page and the new product search results — one
  color mapping, not two.

### UX decisions

**Product search — one keystroke to add, not one click.** As soon as
results land, the first hit is highlighted automatically (no ArrowDown
needed first); Enter adds whatever is highlighted and immediately clears
the query, ready for the next search. ArrowUp/ArrowDown move the
highlight; Escape clears the query. Mouse-hover moves the highlight too
(`onMouseEnter`), so switching between keyboard and mouse mid-search never
leaves a stale highlight. Every result row shows product name, category,
size, price, stock count *and* status (color-coded via the shared
`STOCK_STATUS_TEXT_CLASS`), SKU, and school (if any) — the brief's full
"immediately communicate" list — with **no second page** to open. The
debounce window was tightened from Part 1's 250ms to 150ms (documented
in `use-debounced-search.ts`) — short enough to feel instant while still
batching keystrokes into one request per pause, not one per character.

**Adding is always one interaction.** Clicking (or Enter-ing) a result
adds it immediately — no confirmation dialog, no modal, no intermediate
"choose quantity" step (quantity defaults to 1 and is adjusted afterward
in the cart, matching how the public storefront's own Add to Bag already
works). Adding an already-in-cart item again just increments its existing
line instead of creating a duplicate row.

**Cart** gained a "Clear cart" action (a single confirmation-free click —
consistent with "avoid unnecessary confirmations"; the cost of a mistake
here is re-searching a few items, not an irreversible external action),
and now shows both distinct product count and total unit quantity
side-by-side ("3 products · 7 units") since a busy sale can have very
different values for each and the brief asked for both explicitly. The
`+` stepper is disabled once a line reaches its last-known stock figure
(with an inline "max available" note) rather than letting the cashier
increment past what's actually available and only find out at submit
time.

**Order review is a strip, not a duplicate page.** The brief asked that
customer/school/payment/every item be visible before submitting "with no
surprises." Re-listing every cart line a second time in a separate
"review" panel would just be the same information twice on one screen.
Instead, a compact, always-visible strip sits directly above the
"Complete Sale" button — customer · school · payment method · total units
· grand total — so the last thing the cashier sees before clicking is a
one-line confirmation of everything that matters, with the itemized cart
already fully visible just above it. This was a deliberate choice over a
literal second "review step," which would add a click/page rather than
remove one.

**Customer search** mirrors product search's keyboard model exactly
(same `nextSearchResultIndex` helper, same highlight-first-result
behavior) so a cashier who has learned one search doesn't have to learn a
second interaction style for the other. Each result shows Customer ID,
name, phone, and last order date (or "No previous orders") — using data
`searchCustomers` (Phase 3.1) was already returning; no new query field
was needed.

**New customer stays exactly as minimal as Part 1 left it** — name
(optional) + phone (required), nothing more. Part 2 didn't add fields;
the brief was explicit that future modules, not this form, own collecting
more.

**Guest is still the default tab** and requires zero fields — unchanged
from Part 1, re-confirmed here as still the fastest path through the
form.

**School: recent selections, without a backend.** Recently-used schools
are tracked in `localStorage` (`addRecentSchool`, capped at 5, most-recent
first) and rendered as one-click chips above the school `<select>`, plus
a "Clear" text link that appears only once a school is chosen. This is
genuinely "practical" per the brief precisely because it needed zero
schema/query changes — the school list itself is unchanged from Part 1's
plain `<select>` (Phase 1's native-select-typeahead already gives a
reasonable, zero-cost "search" for what is typically a short list).

**Payment method** buttons were enlarged (`h-14`, full-width grid) so the
three options read as unmistakably large, tappable choices rather than
Part 1's smaller pill buttons — still exactly one click/tap to choose.

**Order success is a dedicated screen, not a toast.** Part 1 showed a
toast and silently reset the form. Part 2 replaces the form's content
with a full success view — Order Number, Order Source ("Counter Sale"),
Customer, School (if any), Payment, every item with quantity and price,
and Grand Total — built entirely from a **client-side snapshot** taken at
submit time (the form already has every one of those values; nothing was
added to `createCounterSale`'s response to support this). A large,
autofocused "Start New Sale" button is the only way forward, explicitly
encouraging the "rapid consecutive sales" workflow the brief asked for.

### Validation improvements

All of Part 1's ad hoc inline `if` checks in the submit handler moved into
`src/lib/counter-sale-form.ts` as named, independently testable functions:

- `validateCartForSubmission` — empty cart, a zero-quantity line (defensive;
  the UI itself removes a line once its stepper reaches zero, so this is
  a second guard, not the only one), and a line requesting more than its
  last-known stock figure ("only reduce the quantity" style messages, not
  a generic "invalid").
- `validateCounterSaleCustomerSelection` — Existing mode with nothing
  picked yet, New mode with a blank phone.
- `getCounterSaleSubmitGate` — combines the above with an in-flight
  (`isSubmitting`) check, in that priority order, and is the single
  function both the button's `disabled` state and the submit handler's
  error message now consult. There is exactly one place that decides
  "can this sale proceed right now."

**Inactive/deleted products** are not re-validated client-side beyond
"was it ever addable" (the search itself already excludes inactive
products/variants, inherited unchanged from Part 1's
`searchSellableVariants`). If a product is deactivated or its variant
deleted *after* being added to an in-progress cart but *before* submit,
the server's `resolveAndDecrementOrderLines` (Part 1, untouched) still
catches it safely and rejects the sale — this phase didn't need to (and
didn't) touch that path; the client only had to display whatever
`STOCK_ISSUE` the server already returns, which it already did.

### Duplicate-click / duplicate-submission prevention

Three independent layers, none of them new to this phase individually,
now composed through one gate:

1. **Client button disable** — `getCounterSaleSubmitGate`'s `isSubmitting`
   check (backed by `useTransition`'s pending state) disables the
   "Complete Sale" button the instant a submission starts.
2. **Idempotency key** — unchanged from Part 1: one key generated per
   sale attempt, resent on any retry, guaranteeing the server recognizes
   a genuine double-submit race as "the same sale," not two.
3. **Server-side guarded decrement** — unchanged from Part 1: the actual
   correctness backstop, proven under real concurrency in
   `counter-sale.test.ts`.

Layer 1 is what Part 2 actually added; layers 2–3 were already proven in
Part 1 and are re-asserted here only as context for why layer 1 is a UX
nicety (fast feedback, no accidental second network request) rather than
the safety mechanism.

### Performance considerations

- **Zero new server actions, zero new queries.** Every requirement in
  this phase's brief was satisfiable by reshaping how the *existing*
  `searchSellableVariantsAction`, `searchCustomersForCounterSaleAction`,
  and `createCounterSaleAction` (all Part 1, all untouched) are called
  and rendered. The "last order date" requirement in particular was
  satisfied by *not* adding a field — `searchCustomers` already selected
  the full `Customer` row, `lastOrderAt` included, so the client simply
  started reading a field it already had access to.
- **Debounce, not per-keystroke requests** — 150ms, tuned down from
  Part 1's 250ms for a snappier feel, still well above "fires on every
  keystroke." A stale in-flight request's result is discarded (matched
  against a request-id ref) if a newer one has since started, so fast
  typing never risks a slow, older response overwriting fresher results.
- **No new client-side state machine libraries** — cart/search/form state
  is `useState`/`useTransition`, matching every other admin form in this
  codebase (`product-form.tsx`, `school-form.tsx`, etc.); the only truly
  new piece of state-shaping logic (`counter-sale-form.ts`) is plain
  functions, not a reducer or store.
- **`localStorage` for recent schools**, not a database round-trip or a
  new query — the fastest possible "remember this" mechanism for data
  that's genuinely per-browser convenience, not a business record.

### Accessibility

- Every custom interactive control (search result rows, quantity
  stepper buttons, remove/clear-cart buttons, payment method buttons,
  school clear/recent chips) has `focus-visible:ring-2
  focus-visible:ring-ring` so keyboard focus is always visibly indicated
  — Part 1's version relied on each control's implicit browser outline,
  which shadcn's global reset suppresses without an explicit
  focus-visible replacement.
- Search inputs use `role="combobox"`/`aria-expanded`/`aria-controls`
  and result lists use `role="listbox"`/`role="option"`/`aria-selected`,
  mirroring the existing, working pattern already proven in
  `src/components/site/school-search.tsx` rather than inventing a new
  accessible-combobox pattern.
- Quantity stepper and remove-item buttons are `size-10` (40px) — a
  deliberate middle ground: this surface's primary target is desktop/
  mouse and keyboard use (per the brief), not the 44px "thumb-friendly"
  bar Phase 1 set for the *public, mobile-first* storefront, but still
  comfortably larger than a bare icon-sized hit target.
- The full keyboard path — type a search term, Enter to add, Tab to the
  next field, type a phone number, Tab to payment method, Enter/click to
  submit — was traced through manually (see "Manual verification") to
  confirm nothing requires a mouse.

### Responsiveness

Primary target remains desktop (the admin's existing `max-w-6xl` shell,
unchanged); the two-column `sm:grid-cols-2` school/payment section and
the cart's row layout both already collapse to a single column below the
`sm` breakpoint, giving a workable tablet layout without any
counter-sale-specific breakpoint logic — reusing the exact same Tailwind
breakpoints (`sm:`, `lg:`) every other admin page in this codebase already
uses, per the instruction not to break the existing responsive admin
layout conventions.

### Tests added

`npm test` → **266 tests passing** (266 = 232 from Part 1 + 34 new — no
existing test was modified, only extended, per the brief's explicit
"Do not replace existing integration tests. Extend them"):

- `src/lib/__tests__/counter-sale-form.test.ts` (34 tests, pure unit
  tests, no database) —
  - **Cart behavior**: adding a new item, incrementing an existing line
    instead of duplicating it, never exceeding stock across repeated
    adds, refusing to add an out-of-stock item, not mutating the input
    array; quantity increase/decrease/removal-at-zero/never-negative;
    removing a specific line only; `computeCartTotals`' three independent
    numbers (line count, total quantity, subtotal).
  - **Validation**: empty cart, zero-quantity line, over-last-known-stock
    line, a valid cart passing; Existing-mode-with-no-selection and
    New-mode-with-blank-phone both blocking, Guest never blocking.
  - **Duplicate-click prevention / submission**: `getCounterSaleSubmitGate`
    allowing a valid, non-submitting sale through; blocking a second
    submission while one is in flight — and specifically proving the
    in-flight guard takes priority even when the cart is *also* invalid,
    so a fast double-click during a slow request is never reported as a
    cart problem instead of a "please wait."
  - **Search**: `nextSearchResultIndex`'s wrap-around in both directions
    and the "no results" edge case — the shared keyboard-navigation
    primitive both search panels use.
  - Recent-schools list ordering, de-duplication, and the 5-entry cap.

No new database-backed tests were needed for Part 2: every business rule
it touches (stock guard, customer dedup, concurrency) is Part 1's
unmodified code, already covered by Part 1's 32 integration tests, which
were re-run (not replaced) and still pass unchanged.

### Manual verification

No browser-automation tool was available in this environment, same as
Part 1. In its place:

- The dev server was restarted and the redesigned `/admin/counter-sale`
  page was fetched with a real, freshly-minted admin session — 200,
  rendered markup confirmed to include the new "Add items" search box,
  Customer/Existing/New tabs, School/Payment sections, and "Complete
  Sale" button.
- Re-ran the full Part 1 end-to-end scenario script (guest sale/general
  retail; new-customer school-linked multi-item sale; existing-customer
  repeat sale with a different payment method) directly against
  `createCounterSale` — confirmed unchanged, correct behavior: inventory
  decremented exactly as expected across all three sales, all three
  orders appeared in the admin order list, customer linkage and
  `lastOrderAt` were correct. This reconfirms Part 2 introduced zero
  regressions in the engine it deliberately did not touch.
- Independently confirmed `searchCustomers` (Phase 3.1, unmodified)
  already returns `lastOrderAt` on every result — the one field Part 2's
  UI needed that wasn't previously displayed — with a direct script
  query, rather than assuming it.
- Checked the dev server's request log throughout — no errors.
- **A genuine, unplanned real-world signal**: while this work was in
  progress, the user was independently exercising the live
  `/admin/counter-sale` page in their own browser (visible in the dev
  server's request log). A real `COUNTER`-sourced order and a real
  `Customer` row from that session were found in the dev database
  afterward and deliberately **left untouched** — they are the user's own
  data, not test debris, and are outside the scope of this pass's
  cleanup.
- Keyboard-only workflow (search → Enter to add → Tab through customer
  fields → Tab to payment → Enter to submit) and fast-consecutive-sales
  (the success screen's "Start New Sale" button immediately returns to a
  fully reset, empty form) were traced through manually via the rendered
  markup and component logic; a full interactive click-through was not
  possible without a browser-automation tool, consistent with Part 1's
  same disclosed limitation.

### Verification gate (Part 2)

```
$ npm run typecheck   → clean
$ npm run lint        → clean
$ npm test            → 266/266 passed
$ npm run build       → succeeds, 23 routes (unchanged — no new routes)
```

No new migration in Part 2 — the schema is byte-for-byte what Part 1
left it. Part 1's fresh-database migration-reproducibility check
therefore still fully describes the current schema state; it was not
re-run since nothing about the schema changed.

### Known limitations

- **Recent schools are per-browser, not per-admin-account or
  cross-device** (`localStorage`, not a database column) — a cashier
  switching computers starts with an empty recent list. Acceptable for a
  convenience feature; would need a real column/table if this needs to
  follow the admin account instead.
- **No literal "review step"/confirmation screen before submit** — by
  deliberate design (see "UX decisions" above), the always-visible cart
  plus the review strip serve that purpose without an extra click. If a
  future requirement wants an explicit "are you sure?" step (e.g. for
  large-value sales), that's a threshold-based addition to the same
  submit handler, not a redesign.
- **No literal receipt/print output** — still explicitly out of scope
  (GST invoices/receipt printing remain Part 1's stated non-goals); the
  success screen is on-screen only.
- **No automated interaction/E2E test** for the client-side flow (search
  → add → submit → success) — this environment has no browser-automation
  tool and this codebase has no existing convention for DOM-level
  component tests (Phase 3's report already noted the same constraint for
  admin CRUD forms). All *logic* the interaction depends on
  (cart math, validation, the submit gate, keyboard-index math) is unit
  tested directly; the interaction wiring itself was verified by manual
  review of the rendered markup and by direct exercise of the underlying
  server actions, not a scripted browser session.
- **Quantity stepper max is the client's last-known stock figure**, which
  can go stale between search and submit (e.g., another sale — online or
  counter — sells the last unit in between). This is explicitly a UX
  pre-check, not a correctness boundary; the server's guarded decrement
  (Part 1, unchanged) is what actually prevents overselling, and a stale
  client cap simply means the cashier sees a `STOCK_ISSUE` at submit time
  in the rare case this happens, rather than being blocked from clicking
  "Complete Sale" a moment earlier.

### Future extensibility

- The success screen's snapshot-based rendering pattern (build the
  summary from what the client already knows, rather than asking the
  server to echo it back) generalizes to any future "confirmation
  screen" this app adds without needing new server round-trips.
- `getCounterSaleSubmitGate`'s ordered-check design (in-flight → cart →
  customer) is a template for adding a future check (e.g., a
  large-sale confirmation threshold) as one more ordered branch, not a
  restructuring.
- `addRecentSchool`/`localStorage` establishes the "cheap, per-browser
  convenience state" pattern this codebase can reuse for a similar future
  need (e.g., "recently used payment method") without another schema
  change.
- If a database-backed "recent schools per admin account" is ever
  wanted instead of per-browser, `AdminUser` (Phase 3) already exists as
  the natural owner of that data — a small additive table/column, not a
  redesign of anything built in this phase.

---

## Part 3 — Production Hardening

Date: 2026-08-04

**Scope note, restated from the brief**: the objective is confidence, not
new features. This section reviews the Counter Sales module (Parts 1–2)
end to end — order management, filtering, auditability, validation,
security, performance, accessibility, future extensibility, and code
health — and fixes what the review found, without touching the shared
commerce engine's design.

### What changed in Part 3

Two real gaps were found and fixed (both in the **shared** engine, so both
online checkout and counter sales benefit identically — see "Validation
review" below for the reasoning):

- `resolveAndDecrementOrderLines` (`order-core.ts`) now also rejects a
  deactivated variant or a variant whose product has been deactivated,
  not just insufficient stock. This was a genuine, pre-existing gap
  (present since Phase 2, inherited unchanged by Part 1) — neither flow
  previously re-checked `isActive` at order-creation time, only at
  search/listing time.
- `createCounterSale` now validates that a submitted `schoolId` actually
  exists before opening its transaction, returning a clear
  `SCHOOL_NOT_FOUND` instead of an opaque foreign-key failure.

One genuinely justified metadata addition, per the brief's explicit "if
additional metadata is genuinely required... introduce it only if
justified" allowance:

- **`Order.createdByAdminUserId`** (nullable, additive, `onDelete: SetNull`
  — the exact same pattern already established by
  `InventoryAdjustment.adminUserId`) records which staff member processed
  a counter sale. Always `null` for `ONLINE` orders (no admin is involved
  in a customer's own checkout); always set for `COUNTER` orders. This is
  standard retail-operations accountability ("who processed this sale" is
  the first question anyone asks when a mistake is expensive), was
  entirely missing before this phase, and is purely operational metadata
  — never used for authorization anywhere.

Everything else in this section is either a UI/query-layer fix (order
management, filtering, resilience) or a review with no code change
(security, performance, accessibility, most of "future extension hooks").
**Nothing about the shared inventory core's stock-guard, the customer
dedup logic, or the counter-sale creation flow's overall shape changed.**

### Order management review

Before this pass, three of four order-defining facts (Source, Status,
Payment) were shown as colored badges on both the order list and detail
pages; Fulfillment was still plain text — the one visible place a counter
order looked like an afterthought next to the others. Fixed:

- New `FulfillmentBadge` (`order-status-badge.tsx`), same visual treatment
  as the other three, added to both the order list row and the order
  detail header.
- Order detail now shows "Processed by: {admin name}" when
  `createdByAdminUser` is set (counter sales only; absent and silently
  omitted for historical/online orders, which correctly have no admin).
- Guest display (`"Guest customer — no details taken."` / `"Guest
  customer"`), customer display, and school display were already handled
  correctly in Part 1 — reconfirmed, not changed.

### Filtering review

Verified `getAdminOrders`' existing filters (`status`, `paymentStatus`,
`fulfillmentType`, `source`, text `query`) all continue to compose
correctly now that orders can be `ONLINE`/`COUNTER`, guest/customer-linked,
and school-linked/not — proven directly in the new
`src/server/queries/admin/__tests__/orders.test.ts` (11 tests): source
filtering in both directions, a guest order's null `customerName`/
`customerMobile` never crashing or false-matching a text search, a
customer-linked order's `customerId` surviving the filter, a
school-linked order's `schoolId` surviving the filter, and (new, see
below) date filtering combined with source filtering together in one
query.

**Date filtering was added** (`dateFrom`/`dateTo`, inclusive both ends,
plain `YYYY-MM-DD` via a native `<input type="date">`) — the one filter
dimension the brief listed that genuinely didn't exist yet anywhere in
this app. Added using the *exact* existing pattern (one more optional
field on `AdminOrderFilters`/`adminOrderFiltersSchema`/`OrderFilters`,
composed with `AND` alongside the others in `getAdminOrders`) — no new
filtering mechanism, no duplicated logic. Justified because "which sales
happened today/this week" is a real, everyday shift-reconciliation need
for a retail counter, not a speculative feature.

**Deliberately not added**: explicit "has a customer" / "has a school"
filter toggles. The brief's phrasing ("verify they work correctly for...
guest orders, customer-linked orders, school-linked orders") reads as
*verify existing filters handle these cases*, not *add new filter
dimensions for them* — unlike date filtering, which was explicitly listed
alongside status/payment filtering as if it should already exist.
Building two more filter toggles for a distinction not clearly asked for
would have been the "unrelated feature" the brief warned against.

### Auditability

Confirmed present for every counter sale: order source, payment method,
customer association (nullable, correct), school association (nullable,
correct), creation timestamp (`createdAt`), order number, and now (new)
who processed it (`createdByAdminUserId`). No other metadata was added —
considered and rejected: a free-text "note" field (speculative, no
current consumer of it), a "register/till number" field (meaningless
until multi-register support exists, which it doesn't — see "Future
extension hooks").

### Validation review — production edge cases

| Scenario | Status |
|---|---|
| Inactive product | **Found gap, fixed** — see "What changed" above |
| Inactive variant | **Found gap, fixed** — same fix |
| Deleted product | Already safe: `Product` is never hard-deleted anywhere in this app (Phase 3 policy); N/A |
| Deleted variant | Already safe: `resolveAndDecrementOrderLines` treats a missing variant identically to unavailable stock (`variant \|\| ...` guard), returns a clean `STOCK_ISSUE`, never crashes — this was already correct, just now covered by an explicit test alongside the isActive tests |
| Deleted school | Can't happen: `School` is never hard-deleted (Phase 3 policy) — the new `SCHOOL_NOT_FOUND` check exists for a stale/bogus id, not literal deletion, and is a defensive improvement regardless |
| Deleted customer | Already handled: `CUSTOMER_NOT_FOUND` (Phase 3.2 Part 1), reconfirmed, not changed |
| Price change before submission | Already correct: price is re-read fresh inside the transaction, never trusted from the client (Phase 2 design, inherited unchanged) |
| Stock change before submission | Already correct: the guarded `updateMany` decrement is the actual authority (Phase 2 design, inherited unchanged) |
| Duplicate browser tabs | Correct by design, not a bug: each tab has its own idempotency key, so two tabs submitting are correctly treated as two independent sale attempts — the shared stock guard still prevents overselling between them |
| Browser refresh during submission | **Documented limitation, not code-fixed** — see below |
| Interrupted requests (network failure) | **Found gap, fixed** — see below |

**Browser refresh during submission**: the idempotency key lives in
React state only (never persisted to `sessionStorage`/`localStorage`).
If a refresh happens after the request reached the server but before the
response reached the browser, the order may have been created without
the cashier seeing confirmation. This was considered for a fix
(persisting the key across a refresh) and deliberately **not** built:
persisting the key only helps if the cart contents are identical on
retry, which they can't be — cart state is in-memory and is wiped by any
refresh, so the cashier would have to rebuild the cart anyway, at which
point reusing a stale key would incorrectly return the *old* order
instead of creating the *new* one they're now trying to submit. The
practical, honestly-documented mitigation is operational, not technical:
`/admin/orders` sorted newest-first (and now filterable by today's date)
is the ground truth for "did this sale go through" — a cashier or
supervisor can always check there before deciding whether to redo a sale
that felt uncertain after a refresh.

**Interrupted requests**: two real gaps found and fixed —
`useDebouncedSearch` previously had no `.catch()`, so a network failure
mid-search left `isSearching` stuck `true` forever (a permanently-stuck
"Searching…" state); `handleSubmit`'s call to `createCounterSaleAction`
had no `try/catch`, so a transport-level failure (not a business-logic
rejection, which the action already handles internally) would surface as
an unhandled rejection with the button potentially left in an unclear
state. Both fixed: the search hook now resolves to empty results on
failure (recoverable — just search again), and the submit handler now
shows a clear message pointing the cashier at `/admin/orders` to check
whether the sale actually went through — the same honest mitigation as
the refresh case above, since a transport failure has the identical
"did it reach the server or not" ambiguity.

### Security review

Verified directly, not assumed:

- **No client-trusted pricing** — `resolveAndDecrementOrderLines` always
  re-reads `priceInPaise` from the database inside the transaction; the
  client never sends a price for anything.
- **No client-trusted stock** — the guarded `updateMany` decrement is the
  sole authority; the client's displayed stock figure is advisory only
  (used for the UI's quantity-stepper cap, never trusted server-side).
- **No hidden-field trust** — every counter-sale Server Action
  (`searchSellableVariantsAction`, `searchCustomersForCounterSaleAction`,
  `createCounterSaleAction`) parses its input through a zod schema before
  touching anything; `adminUserId` is **never** accepted from the client
  at all — it comes only from the server-side session
  (`requireAdmin()`'s already-authenticated `admin.id`), exactly like
  every other admin-audit field in this codebase
  (`InventoryAdjustment.adminUserId`, `updateOrderStatus`'s `adminUserId`
  parameter).
- **No customer impersonation**: an authenticated admin can attach any
  `Customer` row to a sale by supplying its internal id directly (not only
  via the search UI). Considered and accepted, not a gap: the actor here
  is already-trusted staff, who can already look up and select *any*
  customer through the legitimate search flow with no additional
  friction — directly specifying the id changes nothing about what an
  authenticated admin is already able to do. This is the same trust
  boundary every other admin CRUD action in this codebase operates under
  (Phase 3's security review already established "every admin can do
  everything" as the deliberate, scoped role model).
- **No admin authorization gaps** — re-verified (not just assumed
  unchanged) that all three counter-sale Server Actions call
  `requireAdmin()`/`getAdminSession()` as their first statement, matching
  Phase 3's scripted verification approach for the rest of the admin
  surface.
- **No accidental data exposure** — `searchCustomers`' full-row return
  (including `whatsappPhone`, timestamps) is only ever reachable through
  admin-authenticated Server Actions; the **public** order confirmation
  page (`getOrderByNumberAndToken`) does not include the `customer`
  relation at all, so nothing about this phase's admin-side customer
  data widened what the public page can leak. Re-confirmed by re-reading
  both query functions side by side, not assumed from memory.

No new vulnerability class was introduced by Part 3's changes;
`createdByAdminUserId` and `schoolId` existence-checking are both
strictly narrowing (closing gaps), not opening new surface.

### Performance review

- **Database queries**: `resolveAndDecrementOrderLines`'s query shape is
  unchanged by the `isActive` fix (the `isActive` fields were already
  fetched as part of the existing `include: { product: true }` /
  variant read — the fix is a pure comparison added to an already-fetched
  value, zero new queries). The new `schoolId` existence check in
  `createCounterSale` is one additional indexed primary-key lookup
  (`db.school.findUnique`), only when a school is actually selected —
  negligible, and only runs once per sale, not once per line.
- **Component rendering**: reconfirmed (from Part 2) that
  `searchSellableVariants`/`searchCustomers`'s underlying calls in the two
  search components are module-scope function references, not re-created
  per render — the `useCallback` needed in Part 1's original single-file
  version is structurally unnecessary now that they live in their own
  files, and was correctly not re-introduced.
- **Server actions**: no new Server Actions were added in Part 3 — the
  date filter reuses the existing `getAdminOrders` Server Component data
  flow (a URL search param change, not a client-side action call).
- **Search requests**: unchanged from Part 2 (150ms debounce, stale-response
  guard) — reviewed, no further tuning found to be justified.

No unnecessary work was found or introduced; no refactor was made purely
for performance in this pass since none was needed.

### Accessibility review

Polish only, confirming Part 2's work holds up under the new additions —
nothing redesigned:

- The two new date `<input type="date">` filter controls carry
  `aria-label`s ("From date"/"To date"), matching every other filter
  control in `OrderFilters`.
- The new `FulfillmentBadge`/"Processed by" text are plain, readable text
  content — no new icon-only controls, no new focus targets requiring
  special handling.
- Re-confirmed (not re-built): keyboard navigation, focus order, visible
  focus rings, large click targets, loading/error states, and spacing
  conventions in the counter-sale form are all exactly as Part 2 left
  them — Part 3 added no new interactive controls to that page at all.

### Future extension hooks — honest architecture assessment

The brief asked to verify, not build, each of these. Findings, given
plainly (some are genuinely free today; some are real, if modest, future
work; one is a real architectural gap):

| Future need | Assessment |
|---|---|
| **Receipt printing** | Free today. `Order`/`OrderItem` already carry everything a receipt needs (items, prices, totals, payment method, order number, timestamp, and now who processed it). A receipt is a new *rendering* of existing data, the same relationship `order-message.ts`'s WhatsApp formatter already has to `Order` — no schema change. |
| **Barcode scanning** | Free today, **conditionally**: a barcode scanner is a keyboard-emulating device: it "types" a code then Enter. The product search already matches by SKU and Enter already adds the highlighted result — so scanning works today *if* physical barcodes equal internal SKUs. If they differ, a `ProductVariant.barcode` column (unique, indexed) and one more `OR` clause in `searchSellableVariants` would be the fix — small and additive, not a redesign, but not literally free either. |
| **QR scanning** | Same shape as barcode: free if the QR payload is exactly a SKU or a Customer ID (both already searchable); a thin client-side parsing step would be needed first if payloads are structured (a URL/JSON), before the string reaches the existing search box. |
| **Delivery-from-counter** | Already documented in Part 1 ("Order status for counter sales") and reconfirmed unchanged here: `createCounterSale` can be extended to accept `LOCAL_DELIVERY` (status `PENDING` instead of `DELIVERED`), reusing Phase 2's existing delivery lifecycle untouched. Small, additive, well-understood. |
| **Discount engine** | **Not free** — there is no discount/coupon field anywhere in the schema; `subtotalInPaise`/`totalInPaise` are pure sums of line items. Supporting this would require new fields (e.g. an `Order.discountInPaise` or a separate discount model) *and* changes to the shared total-calculation step in `order-core.ts` — real, contained future work, not a rendering exercise. |
| **Loyalty** | **Not free** — `Customer` has no points/tier field; accrual/redemption logic would need to hook into order creation (`order-core.ts` again). Same honesty as discounts: real work, but additive and contained to one well-understood integration point, not a redesign. |
| **Cashier permissions** | **Not free, but well-positioned** — `AdminUser` still has no role/permission field at all (Phase 3's deliberate, restated simplification). This phase's `createdByAdminUserId` addition is a genuine, if partial, head start: the "who did this" tracking a permissions system would build its authorization decisions on already exists. Adding an `AdminUser.role` enum plus per-action checks is moderate, contained future work. |
| **Multi-store** | **Real architectural gap, not a small hook.** Nothing in this schema models "store/location" as a concept distinct from `School` (which is a customer/partner entity, not a physical retail location) — inventory is one `stockQuantity` per `ProductVariant`, globally, not per location. Multi-store would need a new `Store` model and fundamentally different per-location stock tracking — a genuine redesign of the inventory model, not an additive migration. Flagged honestly rather than implied to be "already supported." |

### Code health review

- **Fixed**: `order-filters.tsx` had a `const` declaration sitting between
  two `import` statements (a leftover from an earlier edit) — moved below
  all imports. Cosmetic, zero behavior change, confirmed by the
  unchanged test/build results before and after.
- **Checked and clean**: no `TODO`/`FIXME`/`HACK` markers, no
  `eslint-disable` comments, no `@ts-ignore`/`@ts-expect-error`, no `any`
  casts anywhere in `src/` (grepped directly, not assumed).
- **Checked and clean**: no duplicate `useDebouncedSearch`,
  `STOCK_STATUS_TEXT_CLASS`, `VariantSearchResult`, or
  `CustomerSearchResult` definitions — each has exactly one source of
  truth, confirmed by grep across the whole tree.
- **Noted, deliberately not touched**: `AdminActionResult<T>` is defined
  identically in six separate `src/server/actions/admin/*.ts` files
  (`schools.ts`, `inventory.ts`, `products.ts`, `orders.ts`,
  `categories.ts`, and this phase's own `counter-sale.ts`, which simply
  followed the existing convention). This is real, pre-existing
  duplication — but it predates Phase 3.2 entirely (established in Phase
  3 across five files before counter sales existed), and unifying it
  would mean editing files entirely outside the Counter Sales module for
  a purely cosmetic DRY benefit. Left alone deliberately, per "do not add
  unrelated features" — flagged here as an honest observation, not
  silently ignored, and a reasonable, low-risk candidate for a future
  cleanup pass whenever one of those other files is next touched for its
  own reasons.

### Test review

`npm test` → **284 tests passing** (284 = 266 from Parts 1–2 + 18 new).
Every existing test still passes unmodified; nothing was rewritten or
weakened.

New tests, all targeting production edge cases the brief called out:

- `counter-sale.test.ts` (+7): deactivated variant rejected, deactivated
  product rejected, bogus `schoolId` rejected (`SCHOOL_NOT_FOUND`,
  nothing created), `createdByAdminUserId` recorded correctly (extended
  an existing passing test with one more assertion, not rewritten).
- `place-order.test.ts` (+2): the *same* deactivated-variant/-product
  rejection, proven for the online-checkout flow — since the fix lives in
  the shared core, both flows needed their own proof, not one flow
  assumed to cover the other.
- `src/server/queries/admin/__tests__/orders.test.ts` (new file, 11
  tests): source filtering both directions, guest order correctness,
  customer-linked and school-linked order correctness, date-range
  filtering (inclusive boundaries in both directions), and all of the
  above combined together in one query.
- `src/lib/validation/__tests__/admin-orders.test.ts` (new file, 4
  tests): the one new piece of validation (`dateFrom`/`dateTo` format)
  gets a small, focused test; the rest of `adminOrderFiltersSchema` was
  already covered indirectly and wasn't re-tested for its own sake.

**Not added, and why**: no test for the browser-refresh-during-submission
or duplicate-tab scenarios — both are client-side timing/lifecycle
concerns without a DOM-testing convention in this codebase (see Part 2's
identical note), and both are already reasoned through and documented
above rather than asserted with a brittle simulated test. No test for the
"customer impersonation" consideration — it's a design decision with a
documented rationale, not a bug with a reproducible failure case.

### Manual verification

Dev server restarted (to pick up the regenerated Prisma client for the
new `createdByAdminUserId` column) and re-verified end to end:

- `/admin/orders?source=COUNTER` renders (200) with the new
  `FulfillmentBadge` and both date-filter inputs present.
- Ran `createCounterSale` directly against the dev database: a normal
  sale (confirmed `createdByAdminUserId` recorded and visible via
  `getAdminOrderByNumber` as `"Processed by: Dev Admin"`), a deactivated
  variant (correctly rejected, `STOCK_ISSUE`), a bogus school id
  (correctly rejected, `SCHOOL_NOT_FOUND`), and a date-filtered query for
  "today's counter orders" (correct count).
- Loaded `/admin/orders/[orderNumber]` for a real, pre-existing counter
  order created before this migration existed — confirmed
  `createdByAdminUserId` is `null` for it and the "Processed by" line
  correctly does not render, proving the additive migration didn't
  disturb historical data and the new UI degrades gracefully for it.
- Checked the dev server's request log throughout — no errors.
- All temporary data created by this pass's scripts was deleted
  afterward; two real orders already in the dev database from the user's
  own independent testing during this session (one `ONLINE`, one
  `COUNTER`) were confirmed present and **deliberately left untouched**,
  as in Parts 1–2.
- **Not verifiable in this environment**: a live interactive
  click-through (fast cashier workflow, keyboard-only session, an actual
  browser refresh mid-submission, multiple browser tabs open
  simultaneously) — no browser-automation tool is available here, the
  same disclosed limitation as Parts 1 and 2. Everything reachable
  through direct function calls, HTTP requests, and the database was
  exercised as above; the remaining gap is specifically the *feel* of
  the interaction, not its correctness, which the 284-test automated
  suite covers.

### Production readiness review

Counter sales now: share one inventory engine with online checkout
(proven under real concurrency, including a cross-flow race);
share one customer identity system (proven to never duplicate a
customer across channels); reject unavailable inventory the same way
regardless of *why* it's unavailable (out of stock, deactivated, or
deleted); record who processed every sale; are visually indistinguishable
in quality from online orders in every admin view; and fail predictably
and honestly (a clear message, a documented recovery path) under the
production conditions most likely to actually occur (network blips,
stale search results, an admin mistyping a school id). This is the bar
the brief set, and it's met.

### Architecture review

No redesign occurred. `order-core.ts`'s three primitives
(`resolveAndDecrementOrderLines`, `createOrderWithUniqueNumber`,
`findOrderByIdempotencyKeyRaw`) have the same signatures and contracts as
when Part 1 built them — Part 3 added one more *check* inside
`resolveAndDecrementOrderLines`'s existing upfront-validation loop, not a
new code path. `createCounterSale`'s shape (validate → resolve customer
→ transaction → resolve lines → create order) is unchanged; it gained one
more pre-transaction check (school existence) in the same place its
existing pre-transaction check (customer resolution) already lives.
Nothing was reordered, renamed, or reshaped for its own sake.

### Known limitations (Part 3, additive to Parts 1–2's own lists)

- Browser-refresh-during-submission can leave a sale's outcome uncertain
  to the cashier in the narrow window between request-sent and
  response-received; mitigated operationally (check `/admin/orders`),
  not technically — see "Validation review" for why a technical fix was
  considered and rejected as unsound.
- `AdminActionResult<T>` duplication across six admin action files is
  real and pre-existing; not fixed this phase (out of scope for a
  counter-sales-focused pass).
- No cashier-level permissions exist yet — every admin account can do
  everything, exactly as Phase 3 scoped it; `createdByAdminUserId` is
  audit trail, not an authorization boundary.
- No automated browser/interaction test exists for the counter-sale
  click-through flow, for the same tooling-availability reason disclosed
  in Parts 1 and 2.

### Architecture debt

**None was introduced by this phase, and one small pre-existing item
(the isActive gap) was found and closed rather than left to accumulate.**
Being equally honest about what *isn't* resolved: the `AdminActionResult`
duplication (pre-existing, Phase 3) and the multi-store architectural gap
(never claimed to be supported, now explicitly documented) are both real,
but neither was created or worsened by Phase 3.2 — they're accurately
described above, not hidden.

### Recommendations for Phase 3.3

1. If Phase 3.3 touches online checkout, wiring it to
   `findOrCreateCustomerByPrimaryPhone` (flagged as deferred since Phase
   3.1, still true) would let `Customer.lastOrderAt` and purchase history
   finally reflect both channels together — the data model has been
   ready for this since Phase 3.1.
2. If receipts, barcode scanning, or QR scanning become real near-term
   asks, start there — they're the cheapest of the "future extension
   hooks" reviewed above, in some cases requiring no schema change at
   all.
3. If cashier permissions become a real ask, `createdByAdminUserId`
   (this phase) is already the foundation an `AdminUser.role` addition
   would build its authorization checks on.
4. Treat the `AdminActionResult` duplication as a good "free" cleanup
   the next time any of those five admin action files is touched for an
   unrelated reason — not urgent enough to justify a dedicated pass on
   its own.
5. Multi-store support, if it ever becomes a real requirement, should be
   scoped as its own deliberate design phase — it is a genuine schema
   redesign (per-location inventory), not something to bolt on
   incrementally.

### Verification gate (Part 3)

```
$ npm run typecheck   → clean
$ npm run lint        → clean
$ npm test            → 284/284 passed
$ npm run build       → succeeds, 23 routes (unchanged — no new routes)
```

Migration reproducibility: created a brand-new empty Postgres database,
ran `prisma migrate deploy` (all six migrations — Phase 1 `init` through
Phase 3.2 Part 3 `phase3_2_part3_counter_sale_hardening` — applied
cleanly in order), ran `prisma/seed.ts` and `prisma/create-admin.ts`
successfully against it, then ran the full 284-test suite against that
fresh database — all passing. That verification database was then
dropped. The dev database was confirmed to have zero leftover test
artifacts from this phase's manual verification, aside from two orders
independently created by the user's own testing during this session,
which were identified and deliberately left untouched.

### Definition of Done — self-check

- **Counter sales feel like a natural part of the application** — yes:
  Source/Fulfillment/Status/Payment badges are now visually consistent
  across every order regardless of channel; "Processed by" and school
  linkage render correctly; guest orders display cleanly.
- **Online and counter sales continue sharing one commerce engine** —
  yes: `order-core.ts` is the sole inventory-deduction/order-creation
  primitive for both, strengthened (not forked) by this phase's isActive
  fix.
- **Inventory correctness remains unchanged** — yes, and hardened:
  the stock-guard concurrency proof from Part 1 is untouched; the new
  isActive check is an additional upfront filter, not a change to the
  guard itself.
- **Customer identity remains unchanged** — yes:
  `findOrCreateCustomerByPrimaryPhone`/`updateCustomerContactInfo`
  (Phase 3.1) were not modified in any of the three parts of Phase 3.2.
- **No unnecessary architectural debt is introduced** — confirmed above
  ("Architecture debt").
- **The codebase is cleaner than before this phase started** — yes: one
  real correctness gap (isActive) closed, one import-ordering cosmetic
  issue fixed, comprehensive new edge-case test coverage added, and no
  new duplication introduced anywhere this phase touched.

Changes across all three parts of this phase are left uncommitted, per
instruction.
