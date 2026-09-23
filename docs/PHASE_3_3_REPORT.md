# Phase 3.3 Part 1 — Unified Customer-Aware Checkout Foundation

Date: 2026-08-05

Builds on the committed Phase 3 baseline (`e5f9bcaac69d4556cacfc0b394d74dd530d41135`)
and the uncommitted Phase 3.1 (Customer Identity Foundation) and Phase 3.2
Parts 1–3 (Counter Sales module) work. Read
[`docs/PHASE_0_AUDIT.md`](./PHASE_0_AUDIT.md) through
[`docs/PHASE_3_2_REPORT.md`](./PHASE_3_2_REPORT.md) first — this document
only covers what changed.

**Scope note**: this phase connects the *existing* public checkout to the
*existing* Customer model. No new UI, no OTP, no WhatsApp, no customer
portal, no schema change. Everything listed under the brief's "Out of
Scope — Do Not Implement" section is untouched.

## Current architecture audited (before changing anything)

Per the brief's explicit instruction, the actual current code was read
fresh (not assumed from prior reports) before any change:

- `src/server/commerce/place-order.ts` — `placeOrderForBasket`, the sole
  path creating an `Order` from a basket. Before this phase: computed
  stock/pricing via the shared `order-core.ts`, wrote
  `customerName`/`customerMobile` as plain snapshot strings, and left
  `Order.customerId` unset (always `null`) — exactly as Phase 3.1/3.2's
  own reports documented as the deferred integration point.
- `src/server/commerce/order-core.ts` — `resolveAndDecrementOrderLines`
  (shared inventory guard, now also isActive-checked per Phase 3.2 Part 3),
  `createOrderWithUniqueNumber`, `findOrderByIdempotencyKeyRaw`. Unchanged
  in this phase.
- `src/server/commerce/customer.ts` — `findOrCreateCustomerByPrimaryPhone`
  (Phase 3.1's dedup-by-normalized-phone primitive, used unchanged by
  Phase 3.2's counter sales) and `updateCustomerContactInfo`. This phase
  extends the former (see "Transaction boundary decision" below); the
  latter is untouched and still not called from anywhere.
- `src/lib/phone.ts` — `normalizePhoneNumber`, unchanged, reused exactly
  as-is.
- `src/lib/validation/checkout.ts` — `checkoutInputSchema` already
  collects `customerName` (required) and `customerMobile` (required,
  validated by its own loose Indian-mobile regex, spaces/hyphens
  stripped). **No WhatsApp field exists** — confirmed by reading the
  schema directly, not assumed. Per the brief's section 6, this phase does
  **not** add one.
- `src/server/actions/checkout.ts` — thin `"use server"` wrapper, parses
  input, calls `placeOrderForBasket`, forwards its result. Unchanged.
- `src/lib/order-lifecycle.ts`, basket conversion
  (`Basket.status`/`convertedOrderId`), idempotency (`Order.idempotencyKey`
  pre-check + P2002 race recovery) — all read and confirmed unchanged by
  this phase; the existing tests for all of them (place-order.test.ts,
  inventory.test.ts) were re-run before any edit to establish a passing
  baseline, then re-run after every edit.

## What was built

- `findOrCreateCustomerByPrimaryPhone` (`customer.ts`) gained one optional
  parameter — a Prisma client (defaults to the existing, unchanged `db`
  singleton) — so it can participate in a caller's transaction. Every
  existing caller (Phase 3.2's `counter-sale.ts`, all of Phase 3.1/3.2's
  tests) passes nothing for it and is completely unaffected — same
  inputs, same outputs, same behavior, confirmed by every existing test
  for it passing unmodified.
- `placeOrderForBasket` now resolves/creates the Customer **inside** the
  same transaction as stock decrement and order creation, links
  `Order.customerId`, and updates `Customer.lastOrderAt` — all before the
  transaction commits.
- A new `CUSTOMER_ERROR` variant on `PlaceOrderError`, for the
  (practically unreachable, since `checkoutInputSchema` already validates
  the phone shape) case where phone normalization fails unexpectedly.
- A new, additive integration test file,
  `checkout-customer-identity.test.ts` (11 tests), plus small,
  behavior-preserving cleanup fixes to two existing test files (see "Test
  review").

**No schema change. No migration.** Confirmed directly: `prisma migrate
diff` against the live dev database schema produced "This is an empty
migration" both before and after this phase's code changes — `Customer`,
`Order.customerId`, and every field this phase needed already existed
from Phase 3.1.

## Customer-resolution flow

For a successful checkout:

1. `checkoutInputSchema` validates `customerName`/`customerMobile` (already
   existing, unchanged).
2. `placeOrderForBasket`'s existing pre-transaction checks run first, in
   their existing order: empty-basket, idempotency pre-check,
   already-converted-basket check, fulfillment-enabled checks. None of
   these reach customer resolution — a checkout that fails any of these
   never touches the `Customer` table at all.
3. Inside the (single, existing) order transaction: stock is validated and
   guard-decremented first (unchanged `resolveAndDecrementOrderLines`
   call). **Only if that succeeds** does the transaction call
   `findOrCreateCustomerByPrimaryPhone({ rawPhone: input.customerMobile,
   displayName: input.customerName }, tx)`.
4. The resolved `customer.id` is passed into `createOrderWithUniqueNumber`
   as `Order.customerId`, alongside the pre-existing
   `customerName`/`customerMobile` snapshot fields (both written exactly
   as before — this phase adds the relation, it does not replace the
   snapshot).
5. Immediately after the order is created, `tx.customer.update({
   lastOrderAt: new Date() })` runs — same transaction, so it only commits
   if the order does.
6. The basket is marked `CONVERTED` (unchanged, last step, as before).

## Transaction boundary decision

This was the central design question the brief asked me to reason through
explicitly, so the reasoning is given in full.

**Constraint 1 (brief, section 7)**: an abandoned/failed checkout should
not leave behind an unnecessary Customer record if the architecture can
cleanly avoid it.

**Constraint 2 (Phase 2, non-negotiable)**: stock decrement and order
creation must remain atomic — a failure anywhere must never leave stock
decremented with no corresponding order.

**Constraint 3 (brief, sections 3/24/29)**: reuse
`findOrCreateCustomerByPrimaryPhone` as-is; do not fork a second,
online-specific customer implementation; do not rewrite stable
architecture.

These three constraints interact in a way worth spelling out. The
straightforward-looking option — resolve the customer *inside* the same
Prisma interactive transaction as the order, using its existing
retry-on-P2002 recovery logic unchanged — is actually unsafe: Postgres
aborts an **entire** transaction the moment any statement inside it
errors ("current transaction is aborted, commands ignored until end of
transaction block"). `findOrCreateCustomerByPrimaryPhone`'s existing
recovery path (catch the failed `create`, then run a `findUnique` to
recover the race's winner) issues a *second* query after the first one
failed — safe when each call is its own independent transaction (true for
every existing caller, which use the default `db`), but not safe if that
second query runs inside a transaction already poisoned by the first
query's error.

The chosen fix, applied narrowly:

- `findOrCreateCustomerByPrimaryPhone` now takes an optional client
  parameter. When it's the default `db` (a real, standalone Prisma call),
  behavior is **byte-for-byte unchanged** — same retry count, same
  in-place recovery, same everything, because each `db.X` call really is
  independent.
- When a real transaction client (`tx`) is passed, the function makes
  **exactly one** create attempt and lets a collision (P2002 on
  `primaryPhoneNormalized`) propagate uncaught, rather than trying to
  recover inside the now-poisoned transaction.
- `placeOrderForBasket` wraps its entire `db.$transaction(...)` call in a
  small retry loop (up to 3 attempts) that recognizes specifically that
  one error (`isUniqueConstraintErrorOn(err, "primaryPhoneNormalized")`)
  and retries the **whole transaction** — which, because Postgres rolled
  back everything from the failed attempt (including the stock
  decrement), starts completely fresh and finds the now-committed
  customer via the plain `findUnique` check on its next pass instead of
  racing to create it again.

This is the same "retry the whole unit of work on a specific recognized
race" shape Phase 2 already established for order-number collisions
(retried *inside* the transaction, since generating a fresh random number
has no such poisoning risk) and for idempotency-key races (recovered
*after* the transaction, by returning the winner's order) — a third
instance of an existing pattern, not a new one.

**Net effect on constraint 1**: a checkout now only reaches customer
resolution *after* stock is confirmed available, which is where the large
majority of real checkout failures happen (an item selling out between
page load and submit). It is not a 100%-airtight guarantee against ever
creating a customer for a failed attempt — an order-number exhaustion
(astronomically unlikely) occurring *after* customer resolution would
still leave the customer committed — but closing that last, vanishingly
rare gap would require either fragile Postgres `SAVEPOINT` plumbing or
forking a second customer-creation implementation, both of which
constraint 3 rules out as disproportionate. This is a deliberate,
documented trade-off, not an oversight.

## Existing-customer behavior

Unchanged from Phase 3.1/3.2: `findOrCreateCustomerByPrimaryPhone` looks
up by `primaryPhoneNormalized` first; if found, it's returned as-is —
**the stored `displayName` is never overwritten by whatever name was
typed at this checkout.** This phase does not call
`updateCustomerContactInfo` anywhere in the checkout path (see "Customer
contact-update policy" below for why), so a returning customer's record
is read, linked, and `lastOrderAt`-touched, and otherwise left exactly as
it was.

## New-customer behavior

`findOrCreateCustomerByPrimaryPhone` creates exactly one `Customer` row,
with `customerId` from the existing, unchanged
`generateCustomerId()` (`KLQ-XXXXXX`, server-side only — the browser
never sees or supplies a customer ID), `displayName` set to the checkout's
`customerName`, and `primaryPhone`/`primaryPhoneNormalized` set from the
checkout's `customerMobile`. No signup screen, no password, no session —
the parent experience is unchanged; identity is resolved entirely
server-side as part of the same request that creates their order.

## Phone normalization reuse

`normalizePhoneNumber` (`src/lib/phone.ts`) is called with zero
modification, exactly as Phase 3.1 built it and Phase 3.2's counter sales
already use it. `9876543210`, `+91 9876543210`, `+919876543210`,
`98765 43210`, and `98765-43210` all normalize to the identical
`+919876543210` and therefore resolve to the identical `Customer` —
proven directly in `checkout-customer-identity.test.ts`'s "phone
normalization equivalence" test, not just asserted.

## Customer contact-update policy

The brief's example: an existing customer "Rahul Kumar" checks out again
as "Rahul K." with the same phone — should the stored name update?

**Policy: no, it does not update automatically.** This checkout
integration never calls `updateCustomerContactInfo` — a returning
customer's `displayName` is read and reused as-is, never silently
overwritten by whatever was typed on this particular order. Reasoning:

1. This is not a new decision invented for this phase — it's Phase 3.1's
   own designed behavior for `findOrCreateCustomerByPrimaryPhone`
   ("reuse must never silently clobber," stated in that function's own
   doc comment since Phase 3.1), and it's the exact behavior Phase 3.2's
   counter-sale "NEW mode" already relies on. Online checkout adopting
   the identical policy keeps the two channels genuinely convergent,
   rather than introducing a behavioral difference between them for no
   documented domain reason (which section 24 explicitly disallows).
2. A checkout name field is filled in under time pressure by someone
   trying to buy socks, not deliberately managing their own contact
   record — treating every checkout's name as an authoritative update
   would let a typo, a nickname, or someone else placing the order on a
   shared phone silently overwrite a real record with something worse.
3. `updateCustomerContactInfo` (Phase 3.1) already exists as the correct,
   deliberate mechanism for when a customer's details genuinely need
   updating — that's an explicit action a future, verified (OTP-backed)
   surface should trigger, not an automatic side effect of every order.

This is conservative by design, exactly as the brief asked, and avoids
the "destructive or surprising overwrite" it specifically warned against.

## `lastOrderAt` semantics

Updated **only** as the very last write inside the same transaction as a
successful order, immediately after `createOrderWithUniqueNumber`
succeeds. Consequences, each proven by a specific test in
`checkout-customer-identity.test.ts`:

- **Successful new customer**: `lastOrderAt` is set (not null) —
  ("new online customer" test).
- **Successful repeat customer**: `lastOrderAt` advances to the latest
  order's time — ("repeat online customer" test asserts the second
  checkout's timestamp is `>=` the first).
- **Failed checkout (out of stock)**: never reached — the transaction
  throws before customer resolution even runs, so there is no `Customer`
  row to update *or* create for that attempt — ("failed checkout... does
  not update lastOrderAt" test, which also confirms no orphan customer
  exists for this specific failure mode).
- **Failed checkout (empty basket)**: same — fails before customer
  resolution is ever reached.
- **Idempotent replay (same key, sequential)**: the *second* call to
  `placeOrderForBasket` with an already-used idempotency key returns
  immediately via the existing pre-check, **without re-entering the
  transaction at all** — `lastOrderAt` is not touched a second time,
  confirmed by asserting the timestamp is byte-identical before and after
  the replay.
- **Idempotent replay (same key, true concurrency)**: proven with a real
  `Promise.all` race — exactly one order and one customer result, and
  `lastOrderAt` is set exactly once (whichever attempt actually won the
  underlying insert).

## Idempotency interaction

Two independent races can now occur inside the same transaction attempt,
each recovered differently, and both proven correct **together** (not
just independently) by real concurrent-call tests:

1. **Idempotency-key race** (Phase 2, unchanged): two submissions with the
   *same* key both pass the pre-check before either commits; the loser's
   `Order.create` hits the `idempotencyKey` unique constraint. Recovered
   in the existing outer `catch` block by looking up and returning the
   winner's order — unchanged from Phase 2.
2. **Customer-phone race** (new, this phase): two submissions for the
   *same never-before-seen phone* (regardless of whether they share an
   idempotency key) both pass the customer-existence check before either
   commits; the loser's `Customer.create` hits the
   `primaryPhoneNormalized` constraint. Recovered by retrying the whole
   transaction (see "Transaction boundary decision").

`checkout-customer-identity.test.ts` proves both racing *together*: two
truly concurrent calls with the identical idempotency key for a
brand-new phone resolve to exactly one order, one customer, and correct
linkage — neither recovery path interferes with the other.

## Concurrency guarantees

Proven with real Postgres integration tests (`Promise.all`, not
sequential calls, per the brief's explicit requirement):

- Two concurrent checkouts, different baskets, equivalent-but-differently-
  formatted phone representations, brand-new customer → exactly one
  `Customer` row, both orders linked to it.
- Two concurrent checkouts, same idempotency key, brand-new customer →
  exactly one order, exactly one customer.
- The existing Phase 2/3.2 inventory concurrency guarantees (ONLINE vs
  ONLINE, ONLINE vs COUNTER) were **re-verified untouched** —
  `place-order.test.ts`'s existing 15 tests, including its two
  concurrency tests, and `counter-sale.test.ts`'s cross-flow concurrency
  test, all pass unmodified after this phase's changes (the latter with a
  fixture fix — see "Test review" — not an assertion change).

## Counter/online identity convergence

The stated goal — proven directly, not just asserted:

- A customer created at the counter (Phase 3.2's `createCounterSale`,
  `NEW` mode) is found and reused by a later online checkout for the
  same normalized phone, in a different format. Same permanent
  `customerId`, same internal id, one `Customer` row total.
- Reversed: a customer created by online checkout is found and reused by
  a later counter sale (`createCounterSale`'s own `NEW` mode, which
  already calls the identical, unmodified
  `findOrCreateCustomerByPrimaryPhone`).

No new convergence logic was needed for this — both directions work
because both flows call the exact same function with the exact same
dedup key. This is the direct, intended payoff of Phase 3.1's original
design and Phase 3.2's decision to reuse it unchanged for counter sales.

## Security implications

- **No public order-history/customer lookup was built.** Nothing new
  accepts a `Customer ID` from an unauthenticated request anywhere.
- **The public order confirmation page
  (`/order/[orderNumber]/[token]`) is completely unmodified** — its query
  (`getOrderByNumberAndToken`) does not include the `customer` relation
  and was not changed to include it. A customer's permanent `KLQ-` id is
  **never rendered** on that public page — verified directly by fetching
  a real, freshly-created order's confirmation page and confirming its
  HTML contains the customer's *name* (the existing, unchanged snapshot
  field) but not their `customerId`. The existing `orderNumber` + secret
  `accessToken` pair remains the sole authority for viewing that page,
  exactly as Phase 2 established — this phase does not touch that model
  at all.
- **The admin order detail page** (already customer-aware since Phase
  3.1/3.2, and already behind `getAdminSession()` authentication) now
  additionally shows this linkage for ONLINE orders too, with zero code
  changes to that page — it already handled `order.customer` generically
  for any source. Verified directly: fetched a real order's admin detail
  page and confirmed it shows the `KLQ-` id there (correctly, since that
  page is admin-authenticated staff-only), while the public page for the
  identical order does not.
- **No client-trusted identity**: the browser never sends a customer
  database id, a `customerId`, or anything customer-related beyond the
  same `customerName`/`customerMobile` strings `checkoutInputSchema`
  already validated before this phase existed. The server resolves
  everything.
- **No new authorization surface**: `findOrCreateCustomerByPrimaryPhone`
  is called only from server-side commerce code (`place-order.ts`,
  `counter-sale.ts`), never from a public route or unauthenticated
  action.

## Tests added

`npm test` → **295 tests passing** (295 = 284 from Phases 1–3.2 + 11 new).
Every existing test still passes; none were rewritten or weakened.

- `src/server/commerce/__tests__/checkout-customer-identity.test.ts` (new,
  11 tests, real Postgres): new online customer (Customer created,
  linked, `lastOrderAt` set); repeat online customer (same Customer
  reused, `lastOrderAt` advances); phone-format equivalence; counter→
  online convergence; online→counter convergence; concurrent
  brand-new-customer checkout race (no duplicate); sequential
  same-idempotency-key replay (customer untouched on replay); **true
  concurrent** same-idempotency-key race (one order, one customer);
  failed checkout (stock issue) leaves no orphaned `lastOrderAt` update
  and, per the documented trade-off, no customer at all for *this*
  specific failure mode; empty-basket failure touches no customer state;
  a hand-constructed historical-shape order (`customerId: null`) still
  reads back correctly.
- `src/server/commerce/customer.ts`'s new transactional code path is
  **not** given a separate isolated unit test — it's fully exercised,
  including its actual race-recovery behavior, by the concurrent tests
  above (which only pass because that code path works correctly under
  real concurrency). Adding a synthetic, mocked-transaction unit test on
  top would test the same behavior with less confidence than the real
  integration test already provides.

## Regression testing

All 284 pre-existing tests from Phases 1–3.2 still pass, run alongside
the 11 new ones (no test file was excluded or skipped). Two existing test
files needed a small, **non-assertion** fix, explained here per the
brief's explicit requirement to justify any change to old tests:

- `place-order.test.ts` and `inventory.test.ts` both use fixed, reused
  phone numbers in their checkout fixtures (`pickupInput()`/
  `deliveryInput()`'s defaults, and a similar fixed number in
  `inventory.test.ts`). Before this phase, `placeOrderForBasket` had no
  side effect on any other table those numbers could touch; since this
  phase makes customer resolution a real side effect of every successful
  checkout, those fixed numbers now also create/reuse real `Customer`
  rows. Their `afterAll` blocks previously had nothing to clean up there
  and now do — both were extended (not rewritten) to delete the specific,
  known, fixed-phone `Customer` rows they create, so the dev database is
  left exactly as clean as before the phase existed. **No assertion in
  either file was touched.**
- `counter-sale.test.ts`'s cross-flow concurrency test used a fixed phone
  number for its online-checkout side; changed to a fresh, random one
  (the same `freshTestPhone()` helper already used throughout that file)
  purely to avoid collision with the other two files' fixed numbers, and
  the resulting customer is now tracked and cleaned up like every other
  customer that file creates. **No assertion was touched.**

This was found by inspecting the actual dev database after a full test
run (not assumed) — confirmed a real, if harmless-in-content, gap before
fixing it, and confirmed zero leftover rows after.

## Fresh-database verification

Created a brand-new empty Postgres database, ran `prisma migrate deploy`
— **still exactly the six pre-existing migrations, zero new ones** —
then `prisma/seed.ts` and `prisma/create-admin.ts`, then the full
295-test suite: all passing. That database was dropped afterward. This
isolated run is the authoritative gate per the brief's section 27, and it
is unaffected by the dev-database observation immediately below.

**An honestly-reported observation, not a regression**: repeated `npm
test` runs directly against the shared local dev database (a convenience
check, not the authoritative gate above) intermittently failed one of two
*pre-existing* assertions — `customer.test.ts`'s "rejects an invalid
phone number without creating anything" and
`counter-sale.test.ts`'s "rejects an invalid phone in NEW mode" — both
written in earlier phases, both using the pattern `before =
db.customer.count(); ...call...; after = db.customer.count();
expect(after).toBe(before)`. That pattern is only reliable when nothing
else can write to the `customers` table during the check. Because the
user was independently, actively using the live app throughout this
session (see "Manual verification" below), real concurrent customer
creation occasionally landed inside that exact window and made the
global count comparison fail — not because either invalid-phone call
created anything, but because *something else, at the same moment,*
legitimately did. This is environmental noise specific to sharing a dev
database with live, concurrent real usage, not a defect introduced by
this phase (neither test was touched, and both use a pattern that
predates it — `customer.test.ts` since Phase 3.1, `counter-sale.test.ts`
since Phase 3.2). The isolated fresh-database run above, which has no
such concurrent writer, passed all 295 tests including both of these
every time. Per the brief's explicit instruction not to modify old tests
merely to accommodate a regression — and this isn't one — neither test
was changed.

## Manual verification

No interactive browser-automation tool is available in this environment
— disclosed honestly, same as Phases 3.2 Parts 1–3. In its place, and
made more interesting this time by a live, independent signal:

- **The dev server was already running and being actively used by the
  user themselves throughout this implementation** (visible in its
  request log: live counter-sale searches, an order payment-status
  update, and — after this phase's code changes were hot-reloaded by
  Turbopack with no server restart needed, since there was no schema
  change — **a brand-new real online order the user placed through the
  actual browser checkout**, which correctly created a new `Customer`
  row). This wasn't a script or a test; it's independent, organic
  confirmation that the wiring works through the real UI, not just
  through direct function calls.
- Separately, targeted isolated scripts (own fresh product/phone data,
  cleaned up immediately after, never touching the shared products/
  baskets the user might have been using) exercised: a brand-new online
  checkout (`Customer` created, linked, correct `KLQ-` id) and a repeat
  checkout with differently-formatted phone digits (same `Customer`
  reused, confirmed exactly one row exists for that phone).
- Fetched a real order's `/admin/orders/[orderNumber]` page — confirmed
  it renders the linked `KLQ-` id and display name (200, no errors).
- Fetched the *same* order's public `/order/[orderNumber]/[token]`
  confirmation page — confirmed it renders normally (200, shows the
  customer's name as before) and **does not** render any `KLQ-` id
  anywhere in its HTML.
- Checked the dev server's request log throughout — no errors.
- **Deliberately not restarted**: since the user was actively using the
  live dev server (visible in its logs) and this phase's changes needed
  no schema migration (so no client regeneration requiring a restart),
  restarting was both unnecessary and would have disrupted their
  in-progress session — so it was not done, and Turbopack's hot-reload
  was relied on and then confirmed working via the log evidence above.
- **Not verifiable in this environment**: an actual interactive
  click-through of the checkout form itself (typing into fields, clicking
  Place Order) — no browser-automation tool exists here. Given the user
  was independently doing exactly this in parallel, and it visibly
  succeeded, this gap is considered adequately covered by real-world
  evidence rather than left unaddressed.
- All temporary data created by this phase's own verification scripts was
  deleted afterward; the user's own real orders/customers from this and
  prior sessions were identified and left completely untouched.

## Known limitations

- The "avoid creating a customer for a failed checkout" property is not
  100% airtight — an order-number-exhaustion failure (astronomically
  unlikely; requires 5 consecutive collisions on a 30-character-alphabet,
  5-character-suffix space) occurring *after* customer resolution would
  still leave a committed customer with no order. Documented and accepted
  in "Transaction boundary decision" above, not hidden.
- `updateCustomerContactInfo` (Phase 3.1) remains unwired into any flow —
  a customer's name/phone can still only be corrected by a future,
  deliberate surface (customer portal or admin tool), not automatically
  by checkout. This was a deliberate choice (see "Customer
  contact-update policy"), not an oversight.
- WhatsApp phone is still never collected anywhere (checkout has no such
  field, per the brief's explicit instruction not to add one this
  phase) — `Customer.whatsappPhone`/`whatsappPhoneNormalized` remain
  populated only via Phase 3.1's `updateCustomerContactInfo`, which
  nothing currently calls.
- Historical Phase 1–3 orders remain `customerId: null` permanently, by
  design — no backfill was performed or attempted, per the brief's
  explicit instruction.

## Architecture debt

**None was introduced by this phase.** The one structural change —
`findOrCreateCustomerByPrimaryPhone` accepting an optional transaction
client — is additive, backward-compatible (every pre-existing call site
is provably unaffected, confirmed by every pre-existing test for it
passing unmodified), and closes a real gap (transactional customer
resolution) rather than opening one. The two test-fixture cleanup
additions are hygiene fixes, not workarounds. No new duplicated
business logic exists: phone normalization, customer-id generation, and
the dedup/find-or-create rule all still live in exactly one place each,
now used identically by three callers (online checkout, counter sale
`NEW` mode, and — unchanged — counter sale's own internal reuse).

The one honestly-flagged, deliberate limitation (order-number-exhaustion
edge case, above) is a documented trade-off accepted in exchange for not
forking a second customer-creation implementation or introducing
`SAVEPOINT`-based transaction plumbing — judged the correct call given
its astronomically low likelihood versus the complexity and risk of
fully closing it.

Changes across Phase 3.1, Phase 3.2 (all parts), and this phase are left
uncommitted, per instruction. Phase 3.3 Part 2 has not been started —
awaiting review and the next specification.

---

# Part 2 — Geoapify Checkout & Delivery

Date: 2026-08-07

Builds on Part 1 above (customer identity is completely preserved — see
"Preserving Part 1" below) and every prior phase's inventory-concurrency,
idempotency, and counter-sale guarantees. Read Part 1 first if you haven't.

**Scope**: connect checkout to Geoapify for address autocomplete and
route-based delivery distance; replace the old flat/subtotal-only delivery
fee rule with a distance-aware one; add a WhatsApp contact field (no
messaging); GST-ready wording only, no real tax engine. Everything under
the brief's "Out of scope" list (OTP, WhatsApp messaging, payments, GST
invoices, driver tracking, multi-store, coupons, loyalty, etc.) is
untouched.

## Current architecture audited (before changing anything)

Per the brief's instruction, current code was read fresh before any
change — most relevantly: `checkout-form.tsx`'s old flat delivery-fee
`useMemo`, the old single-shape `calculateDeliveryFee(fulfillmentType,
subtotalInPaise, deliveryFeeInPaise, freeDeliveryThresholdInPaise)` in
`fulfillment-config.ts`, the `Order` schema's existing
`deliveryAddressLine`/`deliveryArea`/`deliveryLandmark` free-text fields,
`placeOrderForBasket`'s existing transaction shape, and Part 1's customer
resolution (`findOrCreateCustomerByPrimaryPhone`,
`updateCustomerContactInfo` — unwired since Phase 3.1). None of this had
any concept of a route distance or a selected geocoded location.

## Geoapify integration architecture

`src/server/geoapify.ts` is the **sole** integration point with Geoapify —
no other file calls `fetch` against Geoapify. It is marked `server-only`
(the same boundary pattern already used by `src/lib/admin/session.ts` and
`src/lib/basket.ts`), so a build would fail if any Client Component ever
tried to import it directly. It exports two typed operations
(`searchDeliveryAddresses`, `calculateRouteDistanceMeters`) plus
`isGeoapifyConfigured()`, and never throws — every failure mode collapses
into a `{ success: false, error: { type, message } }` result so callers
can show an honest message instead of a stack trace.

The browser never talks to Geoapify or holds the API key. Two Server
Actions (`src/server/actions/checkout-address.ts`) proxy the two
operations:

- `searchDeliveryAddressAction` — thin proxy over `searchDeliveryAddresses`.
- `previewDeliveryFeeAction` — takes only `{ lat, lon }` from the client,
  reads the **current basket's subtotal fresh from the database**
  (`getBasket()` + `basketTotalInPaise()` — never a client-submitted
  number), calls `calculateRouteDistanceMeters`, then
  `calculateDeliveryFee`, and returns the fee/total/distance. This mirrors
  the existing Server-Action-proxy pattern already proven for counter-sale
  product/customer search (`src/server/actions/admin/counter-sale.ts`)
  rather than inventing a new architecture.

A Client Component, `src/components/checkout/delivery-address-search.tsx`
(`DeliveryAddressSearch`), calls these two actions and reports only a
**selected** location and its fee preview up to `CheckoutForm` — see
"Selected-location semantics" below.

## Shop coordinate source

`FULFILLMENT_CONFIG.shopLatitude`/`shopLongitude` (`src/lib/
fulfillment-config.ts`), defaulting to **25.9579568, 83.2697821** —
Milan Readymade & General Store, sourced from the Google Maps link the
brief provided
(`https://maps.app.goo.gl/ZdogcBAuFPhCApXN9`) purely to identify these
coordinates. Google Maps is not used anywhere at runtime; only Geoapify is
called. Kept as configuration (env-overridable via `SHOP_LATITUDE`/
`SHOP_LONGITUDE`), not scattered as inline literals — deliberately, so a
future multi-store phase has one place to replace with a per-order origin
lookup instead of a hunt-and-replace (see "Architecture debt").

## Address autocomplete

Geoapify's **Geocoding Autocomplete API** (`GET /v1/geocode/autocomplete`).
`searchDeliveryAddresses(query)`:

- Returns `{ success: true, suggestions: [] }` immediately for an
  empty/whitespace query, without calling Geoapify at all.
- Biases (not hard-filters) results toward the shop using Geoapify's
  `bias=proximity:...` and a generous 50km `filter=circle:...` — wide
  enough to never exclude a legitimately nearby address, narrow enough to
  keep results regionally relevant instead of surfacing unrelated matches
  from other states/countries.
- Maps each result to `{ id, formattedAddress, city, county, state,
  postcode, lat, lon }`, filtering out any entry missing `lat`/`lon`/
  `formatted` — a suggestion without real coordinates is never shown,
  since it could never be selected safely.
- **Raw latitude/longitude are never rendered to the customer** — only
  `formattedAddress` (which already reads naturally: street, locality,
  district, state, PIN) appears in the UI. Coordinates travel only through
  component state, Server Action payloads, and the database — never the
  visible DOM, a URL, or a log line.

Debouncing (350ms) and a 3-character minimum query length live in
`DeliveryAddressSearch`, driven directly from the input's `onChange`
handler via a ref-held timer (not a `useEffect` keyed on the query state —
see "Performance review" for why this matters, and the "Selected-location
semantics" section for the architectural reason).

## Selected-location semantics

A free-typed address string is **never** treated as an authoritative
location — only a suggestion the customer actually clicked. `handleSelect`
records the suggestion's exact `formattedAddress` in a ref
(`lastAppliedSelectionText`) at the same moment it applies that text to
the visible input and reports the selection (and kicks off the fee
preview) to the parent.

If the customer edits the input afterward — even by one character — the
query no longer matches that ref, and `handleQueryChange` immediately (in
the same event-handler call, not a later render) clears the selection, the
preview, and notifies the parent via both callbacks with `null`. This
means: **stale coordinates can never remain authoritative for a
now-different-looking address.** A fresh search only starts once editing
stops for a moment (the debounce), and the "selected" UI (formatted
address + distance/fee card) disappears the instant editing begins, so
there's no visual ambiguity about whether the shown fee still applies.

## Server authority

The browser never decides or submits: route distance, delivery fee,
free-delivery flag, subtotal, or grand total. It may submit
`destinationLat`/`destinationLon`/`destinationFormattedAddress` (the
selected location) and `expectedDeliveryFeeInPaise` (its last-seen
preview) — but the server treats the latter as a **staleness-comparison
baseline only**, never the charge (see "Delivery quote consistency"
below). `placeOrderForBasket` always recalculates subtotal, route
distance, and fee itself, from the database and a fresh Geoapify call,
regardless of what the client last saw.

## Delivery rules

`calculateDeliveryFee` (`src/lib/fulfillment-config.ts`) is now a pure
function over a discriminated union:

```ts
export type DeliveryFeeParams =
  | { fulfillmentType: "STORE_PICKUP" }
  | {
      fulfillmentType: "LOCAL_DELIVERY";
      subtotalInPaise: number;
      routeDistanceMeters: number;
      deliveryFeeInPaise: number;
      freeDeliveryThresholdInPaise: number;
      freeDeliveryRadiusMeters: number;
    };
```

The `LOCAL_DELIVERY` branch's type signature makes it **impossible to
call without a route distance already resolved** — there is no code path
that can compute a delivery fee by accident without one. Rule:

- `routeDistanceMeters <= freeDeliveryRadiusMeters` (default 3000m / 3km)
  → **always free**, regardless of subtotal.
- Beyond that radius: `subtotalInPaise >= freeDeliveryThresholdInPaise`
  (default ₹1,500 / 150000 paise) → **free**; otherwise →
  `deliveryFeeInPaise` (default ₹50 / 5000 paise) is charged.

All three numbers are plain integers (paise, meters) — no floating-point
currency or distance math anywhere in this function, matching the
codebase's existing money convention.

**3km boundary, tested exactly** (`fulfillment-config.test.ts`): 2999m →
free, 3000m → free (inclusive), 3001m → charged. **₹1,500 threshold,
tested exactly**: ₹1,499.99 (149999 paise) → charged, ₹1,500 (150000
paise) → free. The full spec-section-34 boundary matrix (2km+₹500,
exactly-3km+₹500, 3.001km+₹500, 5km+₹1499.99, 5km+₹1500, 10km+₹5000) is
covered by dedicated tests.

₹50/₹1,500/3km are the current agreed values, kept in the **existing**
`DELIVERY_FEE_IN_PAISE`/`FREE_DELIVERY_THRESHOLD_IN_PAISE` env vars (only
their default values changed, from Phase 2's unvalidated ₹40/₹1,000
placeholders) plus a new `FREE_DELIVERY_RADIUS_METERS` (default 3000) and
`SHOP_LATITUDE`/`SHOP_LONGITUDE` — the brief's own suggested names
(`LOCAL_DELIVERY_FEE_PAISE` etc.) were **not** adopted, per the brief's
explicit allowance to reuse an existing, cleaner convention instead of
introducing parallel names for the same config.

## Routing endpoint / route-distance definition

Geoapify's **Routing API** (`GET /v1/routing`, `mode=drive`) — chosen over
the Route Matrix API because this is always exactly one origin (the shop)
to one destination (the customer) per checkout; the matrix API is for
many-to-many lookups and would be unnecessary cost/complexity here.
`mode=drive` (road routing) is used as the closest available proxy for a
local delivery run by scooter/bike — Geoapify has no dedicated two-wheeler
mode, and drive-mode road distance is a reasonable approximation at this
delivery radius. **Route distance is explicitly the Geoapify routing
result's `distance` property (road distance along an actual route),
never Haversine/straight-line distance** — confirmed by reading the
routing response shape directly and rounding `distance` to the nearest
meter; no straight-line fallback exists anywhere in this codebase.

## External API failure handling

Every Geoapify failure mode is a distinct typed error
(`GeoapifyErrorType`): `NOT_CONFIGURED` (no API key), `TIMEOUT` (8s hard
timeout via `AbortController`), `NETWORK_ERROR`, `RATE_LIMITED` (HTTP
429), `PROVIDER_ERROR` (non-ok response or malformed JSON shape), and
`NO_ROUTE` (routing succeeded but returned no usable route/distance). In
every case, `placeOrderForBasket` returns `{ success: false, error: {
type: "DELIVERY_UNAVAILABLE", message: "We couldn't verify delivery
distance right now. Please try again or choose Store Pickup." } }` —
**never a guessed distance, never a silently-granted or silently-charged
fee**. This is proven directly by a test that mocks the Geoapify boundary
to fail and asserts both the exact error type and that zero orders/rows
are created. The same message is used by `previewDeliveryFeeAction` for
the pre-submission preview.

## API call strategy (cost control)

- **Autocomplete**: debounced 350ms from the last keystroke, minimum
  3 characters, and only ever triggered by the query actually changing —
  selecting a suggestion sets a ref that suppresses the next search
  entirely (see "Selected-location semantics"). A request in flight is
  never left to race a newer one: each request carries an incrementing id
  and a stale response is discarded on arrival.
- **Routing**: called **exactly once** per checkout submission (inside
  `placeOrderForBasket`, before the transaction) and **exactly once** per
  address *selection* during preview (`previewDeliveryFeeAction`, called
  only after a suggestion is clicked — never per keystroke, never
  speculatively). Editing the address after selecting it clears the
  preview instead of firing a new routing call until a *new* selection is
  made.
- **No caching layer was added.** Per the brief's explicit "don't
  over-engineer prematurely" guidance, a single-shop, low-volume checkout
  doesn't yet justify one — see "Architecture debt".
- **Expected Geoapify calls per successful Local Delivery checkout**: one
  or more autocomplete calls while typing (bounded by debounce +
  minimum-length gating, typically 1–3 for a real address), exactly one
  routing call for the preview, and exactly one more routing call at
  submission (see "Delivery quote consistency" for why submission
  recalculates rather than reusing the preview's result). Store Pickup:
  zero Geoapify calls, ever.

## Key security

`GEOAPIFY_API_KEY` is read only inside `src/server/geoapify.ts`
(`server-only`-marked), never destructured into `fulfillment-config.ts`
(which is explicitly documented as safe-for-broad-import, non-secret
business config) or any Client Component. It reaches Geoapify only as a
query parameter Geoapify itself requires; `fetchGeoapify`'s error logging
deliberately logs only the request **path**, never the full URL (which
would contain the key) and never the raw response body. A dedicated test
(`geoapify.test.ts`, "never sends the API key anywhere but as a request
param, and never logs it") asserts the key appears in the outgoing fetch
URL but never in any `console.error` call. **No real key is committed
anywhere** — `.env.example` has an empty `GEOAPIFY_API_KEY=` placeholder
with a comment; the real (if any) key lives only in the local, gitignored
`.env`. No Geoapify key was found anywhere in this environment (checked
`.env`, `.env.example`, shell environment) despite the brief stating one
exists locally — the integration degrades gracefully to `NOT_CONFIGURED`
rather than failing to build or fabricating a key (see "Manual
verification").

## Location privacy

Raw coordinates are never rendered in: the customer-facing checkout UI
(only `formattedAddress` and a rounded km distance are shown),
the public order confirmation page, or any URL. The admin order detail
page shows the formatted address and route distance (operationally useful
for a real delivery run) but **not** raw latitude/longitude, consistent
with "avoid broad admin data exposure." Coordinates exist only in
component state, Server Action payloads, and the `Order` table's snapshot
columns.

## Schema changes

Four new **nullable, additive** columns on `Order` (migration
`20260805100000_phase3_3_part2_delivery_geo`, pure `ALTER TABLE ... ADD
COLUMN`, no data migration, no existing column touched):

```prisma
deliveryLatitude            Float?
deliveryLongitude           Float?
deliveryFormattedAddress    String?
deliveryRouteDistanceMeters Int?
```

The existing `deliveryAddressLine`/`deliveryArea`/`deliveryLandmark`
free-text fields are unchanged and still written — they're documented as
"delivery details" (house number, street, landmark) as distinct from the
new geocoded snapshot, per the brief's explicit separation of "what
determines distance" from "what helps the delivery person." `deliveryArea`
is now effectively redundant (the geocoded `deliveryFormattedAddress`
already carries locality/state/PIN) and was made optional in validation,
but its column and UI display (for old orders that have it) were left in
place rather than removed, since removing a column is a larger, riskier
change than leaving an optional one unused going forward.

**Per the brief's explicit instruction, the `Customer` model was not
touched** — no delivery coordinates were added to it. A customer can order
to different locations over time; only the `Order` gets a snapshot.

## Order snapshot design ("recalculate vs. signed quote")

At order placement, `placeOrderForBasket` **recalculates the route fresh**
from Geoapify (not a reused preview, not a signed/short-lived quote token)
immediately before opening the database transaction. This was a deliberate
choice between two documented options:

1. Recalculate fresh at submission (chosen).
2. Sign/validate a short-lived quote from the preview step and trust it at
   submission if not expired.

**Reasoning: correctness over micro-optimization**, per the brief's own
framing. A signed-quote approach saves one Geoapify call per checkout but
introduces real complexity (issuing, validating, and expiring a signed
token; deciding what happens on expiry) to save a single, already-cheap
API call on the least frequent step of checkout (order submission happens
once; autocomplete happens many times per checkout and is already the
cost-dominant call). Recalculating fresh also means the **stored
snapshot is always provably correct at the moment of order creation** —
no signed-but-possibly-stale value that then needs re-verifying against
the same source anyway.

The resolved `routeDistanceMeters` is computed **once**, before the
transaction (and before the customer-phone-race retry loop — see
"Concurrency" below), and that single value is what's used for both the
fee calculation and the `deliveryRouteDistanceMeters` snapshot written to
the order. This means a historical order can be fully explained (address,
distance, fee, total) **without another Geoapify call** — exactly the
brief's requirement.

## Delivery quote consistency ("stale quote" handling)

The client's `expectedDeliveryFeeInPaise` (its last-seen preview) is
compared against the freshly-recalculated authoritative fee inside the
transaction. A mismatch — e.g., the basket's subtotal crossed the
free-delivery threshold between preview and submission, or someone
tampered with the client payload — throws a `DELIVERY_QUOTE_STALE` domain
error, rolling back safely. **The order is never created with a silently
different amount than what the client believed it agreed to.** This is
explicitly **stricter** than Phase 2's existing behavior for a changed
*subtotal* alone (which recalculates and proceeds silently) — per the
brief's explicit instruction that this specific dishonesty (a different
delivery charge than shown) must never happen silently. The checkout UI
(`checkout-form.tsx`) catches this specific error and automatically
re-fetches the preview so the customer sees the corrected total
immediately, rather than being left to guess why submission failed.

## Concurrency / transaction-boundary decision

The Geoapify routing call is a real network round-trip (up to the 8s
timeout under a slow response) — holding a Postgres transaction open for
that long would needlessly extend the guarded stock-decrement's lock
window and risk exhausting the connection pool under concurrent checkouts.
So `calculateRouteDistanceMeters` is called **once, before**
`db.$transaction(...)` opens — never inside it. The existing
customer-phone-race retry loop (Part 1) wraps the **whole transaction**,
not this call: since route distance is purely geographic and unaffected
by that race, re-querying Geoapify on every retry attempt would be wasted,
billable calls for no benefit, so the same resolved distance is reused
across all retry attempts. This mirrors Part 1's own reasoning for why the
customer-phone race is recovered by retrying the whole transaction rather
than a sub-step. All of Phase 2's inventory concurrency, Phase 3.2's
counter-sale hardening, and Part 1's customer/idempotency guarantees are
completely unmodified by this change (proven by every existing
concurrency test still passing unmodified).

## WhatsApp behavior

A `whatsappSameAsPrimary` checkbox (default checked) plus a conditional
"WhatsApp number" field, using the **existing** Phase 1 phone-format
validation (`mobileNumberSchema`, shared with `customerMobile`) and the
**existing, previously-unwired** Phase 3.1 `updateCustomerContactInfo`.
When unchecked with a distinct number provided, `placeOrderForBasket`
calls it **after** the order transaction commits successfully — a
best-effort, non-blocking update: its failure is caught, logged, and
never turns a successful order into a failure response, since a WhatsApp
number is a contact-info convenience, not part of what makes the order
valid. **No WhatsApp messages are sent. No OTP. No Meta/WhatsApp Business
API integration.** This phase only collects and stores the number.

## GST / tax treatment

**GST-ready, not GST-implemented.** The order summary (both checkout and
confirmation pages) shows an honest "Taxes: Included where applicable"
line — no invented 5%/12%/18% rate, no separate tax line item, no GST
invoice. `Order.subtotalInPaise`/`deliveryFeeInPaise`/`totalInPaise`
already exist and are untouched; adding an explicit tax amount later would
mean adding a new column and a new line in the summary, not restructuring
anything that exists today.

## Mobile UX

`DeliveryAddressSearch` and the WhatsApp checkbox use the same `Input`/
`Label` components and touch-friendly sizing as the rest of the checkout
form (large tap targets, no horizontal scroll — suggestions render as a
full-width stacked list, not a wide table). Loading states (`Searching...`,
`Calculating delivery fee...`) and errors are shown inline, in place,
rather than as toasts that could be missed. The submit button's label
changes to "Select a delivery location to continue" and stays disabled
until a preview is available for Local Delivery, so there's no ambiguity
about why it can't be pressed yet.

## Preserving Part 1 (customer identity)

Completely unchanged: no login, no signup, no password, automatic
resolution by normalized phone, no exposure of `Customer.id` or
`customerId` anywhere in the checkout or confirmation flow. The WhatsApp
addition reuses `updateCustomerContactInfo` exactly as Part 1 left it —
this phase is the first caller, but the function itself was not modified.

## Tests

**325 tests passing** (295 from Phases 1–3.3 Part 1 + 30 new/rewritten for
this phase). New/changed:

- `src/server/__tests__/geoapify.test.ts` (new, 15 tests, mocked
  `global.fetch`, zero live network dependency): `NOT_CONFIGURED` for both
  operations and `isGeoapifyConfigured()`; empty-query short-circuit;
  successful autocomplete mapping (including filtering out
  coordinate-less results); API key present in the request but never
  logged; `RATE_LIMITED` (429); `PROVIDER_ERROR` (non-ok, and malformed
  JSON shape); `TIMEOUT` (AbortError); `NETWORK_ERROR` (generic failure,
  raw message never leaked); successful routing with rounded distance and
  `mode=drive` confirmed in the request; `NO_ROUTE` (empty
  features, non-finite distance); malformed routing response.
- `src/lib/__tests__/fulfillment-config.test.ts` (rewritten for the new
  discriminated-union signature): Store Pickup always free; free within
  3km; exact 3000m/2999m/3001m boundary; charged below the ₹1,500
  threshold; free at and above it; free far beyond 3km with a large
  subtotal.
- `src/lib/validation/__tests__/checkout.test.ts` (extended): Local
  Delivery requires an address line and a selected destination but **not**
  `deliveryArea`; requires `expectedDeliveryFeeInPaise`; rejects
  out-of-range lat/lon; WhatsApp field combinations; `
  whatsappSameAsPrimary` defaults to `true`.
- `src/server/commerce/__tests__/place-order.test.ts` (extended, Geoapify
  boundary mocked via `vi.mock("@/server/geoapify")`): successful Local
  Delivery order stores the full address + route snapshot
  (`deliveryLatitude`/`deliveryLongitude`/`deliveryFormattedAddress`/
  `deliveryRouteDistanceMeters`); fee waived at/under 3km regardless of
  subtotal; fee waived beyond 3km once the threshold is met; **provider
  failure never guesses** — `DELIVERY_UNAVAILABLE`, zero orders created;
  missing destination → `CUSTOMER_ERROR`, Geoapify never even called;
  **manipulated/stale client fee is rejected**, never silently charged —
  `DELIVERY_QUOTE_STALE`, zero orders created; two different destinations
  in sequence get two independently-recalculated distances (a previous
  location's distance is never reused for a new one).
- All pre-existing Phase 1–3.3-Part-1 tests pass **unmodified** except the
  four fixture helpers (`checkout-customer-identity.test.ts`,
  `counter-sale.test.ts`, `inventory.test.ts`, `place-order.test.ts`'s
  `pickupInput`/`deliveryInput`) that construct a typed `CheckoutInput`
  directly and needed `whatsappSameAsPrimary: true` added — a type-shape
  fixture update, not an assertion change, the same category of fixture
  fix Part 1 itself required when it added fields to the same type.

**Test infrastructure fix (unrelated to this phase's logic, found while
verifying)**: `vitest.setup.ts` now mocks the `server-only` package
(`vi.mock("server-only", () => ({}))`). Vitest doesn't understand Next.js's
`react-server` export condition that swaps `server-only` for a no-op in
real Server Component bundles, so importing any `server-only`-marked
module in a test — newly true for `place-order.ts`'s test files once it
started importing `src/server/geoapify.ts` — threw unconditionally. This
is a test-environment shim, not a behavior change to any shipped code.

**Test infrastructure fix #2**: `vitest.config.mts` now sets
`fileParallelism: false`. Several test files run real concurrent-write
integration tests against the same local Postgres instance; running many
files' own Prisma connection pools in parallel intermittently exhausted
the database's connection limit under this phase's larger test count, and
a pool timeout was silently absorbed into `placeOrderForBasket`'s existing
generic `UNKNOWN` error path — surfacing as a rare, hard-to-reproduce
`expect(result.success).toBe(true)` failure unrelated to the actual
scenario under test. Confirmed via repeated runs: flaky in roughly 1 of
5 runs before the fix, clean across 10+ consecutive runs after. Total
suite time went from ~2s to ~8s — an acceptable trade for a deterministic
result.

## Fresh-database verification

Created a separate, throwaway database (`shop_fresh_verify`) inside the
same local Postgres instance — chosen over touching the shared dev
database so the user's own manual/real records were never at risk. Ran
`prisma migrate deploy` (all **7** migrations, including this phase's new
one, applied cleanly to a genuinely empty schema), then `prisma/seed.ts`,
then `prisma/create-admin.ts`, then the full 325-test suite against that
database — all passing. The throwaway database was dropped immediately
after. Separately confirmed the shared dev database's own order count was
unchanged before and after this entire verification (7 orders, untouched).

## Manual verification

Same honest disclosure as Parts 1 and prior phases: **no browser-automation
tool is available in this environment.** What was actually done:

- The user's own dev server was already running (their independent,
  concurrent session) — confirmed `/checkout` and `/` both return `200`
  through it, with no server-side errors in its log, after this phase's
  changes were live. A second `npm run dev` invocation self-detected the
  port conflict and exited without starting a duplicate process, so the
  user's session was never disrupted or restarted.
- **Not verifiable here**: an actual interactive click-through (typing an
  address, seeing live Geoapify suggestions, selecting one, watching the
  fee preview update, submitting, viewing the confirmation page on a
  mobile viewport). This gap is disclosed honestly rather than claimed.
- **No live Geoapify key exists in this environment** — checked `.env`,
  `.env.example`, and the shell environment; all empty, despite the
  brief's statement that a key exists locally. This means the address
  autocomplete/routing integration itself has **not** been exercised
  against the real Geoapify API in this session — only against the
  mocked-`fetch` unit tests and the graceful `NOT_CONFIGURED` degradation
  path (which the checkout UI now surfaces as an explicit "Address lookup
  is temporarily unavailable" notice, disabling the address fields rather
  than letting the customer type into a search that can only ever fail —
  see "Code health" below). **A real key must be added to the local
  `.env` before a live smoke test of autocomplete/routing is possible.**

## Security review

- **API key**: never in source, git history, tests, or documentation;
  never logged; never returned from any server error; confined to one
  `server-only` module. Verified by a dedicated test and by `grep`ping
  this phase's diff for the literal string "GEOAPIFY_API_KEY=" outside
  `.env`/`.env.example`/code that reads it (none found).
- **No client-trusted distance/fee/subtotal/total**: `placeOrderForBasket`
  recalculates every one of these itself; the only client-submitted
  delivery-related values are the selected coordinates (used only as
  routing *input*, not as the distance itself) and the staleness-baseline
  fee (compared, never trusted).
- **No unrestricted proxy endpoint**: both new Server Actions are
  narrow-purpose (search text in, suggestions out; coordinates in, a
  server-computed fee out) — neither forwards arbitrary Geoapify
  parameters or exposes a general-purpose HTTP proxy.
- **No order-token regression**: `getOrderByNumberAndToken`'s query and
  access-control shape are untouched by this phase.
- **No Customer-ID-as-authentication mistake**: unchanged from Part 1 —
  nothing new accepts a `customerId` from an unauthenticated request.
- **No location leakage**: raw coordinates never appear in customer-facing
  UI, the public confirmation page, or logs (see "Location privacy").

## Performance review

- Autocomplete: 350ms debounce, 3-character minimum, driven from the input
  event handler (not a `useEffect` keyed on the query string) specifically
  so clearing a stale selection happens in the same render pass as the
  keystroke rather than triggering a second cascading render — this was a
  concrete lint finding (`react-hooks/set-state-in-effect`) during
  development, fixed by moving the debounce timer into a ref-held
  `setTimeout` scheduled from the event handler instead of an effect.
- Routing: exactly one call per address selection (preview) and exactly
  one call per submission (recalculation) — never per keystroke, never
  spinning speculatively while suggestions are still being narrowed down.
- No caching layer, deliberately, for a single-shop/low-volume deployment
  — see "Architecture debt".

## Known limitations

- No live Geoapify key was available to exercise the real API end-to-end
  in this environment (see "Manual verification") — the integration is
  built, unit-tested against a mocked boundary, and degrades gracefully,
  but a genuine live smoke test is still owed once a real key is added
  locally.
- `deliveryArea` remains a schema column and is still displayed for any
  historical order that has it, but is no longer collected by the
  checkout UI — a deliberate, low-risk redundancy rather than a
  destructive column removal.
- The stale-quote check compares only the delivery **fee**, not the
  subtotal or grand total independently — a subtotal-only change (e.g. a
  price change with no effect on the fee bracket) still goes through
  Phase 2's existing silent-recalculation behavior, unchanged. Only the
  delivery-fee-specific honesty guarantee is stricter, exactly as the
  brief asked for.

## Architecture debt

Per the brief's explicit request, evaluated honestly — **do not pretend
these exist**:

- **Geoapify vendor dependency**: the entire address/routing integration
  is one vendor. Swapping providers would mean rewriting
  `src/server/geoapify.ts`'s internals, but callers (`checkout-address.ts`,
  `place-order.ts`) depend only on its typed function signatures, not
  Geoapify's response shapes directly — a reasonable, if not fully
  provider-agnostic, isolation boundary.
- **Multi-store origin selection**: `FULFILLMENT_CONFIG.shopLatitude/
  shopLongitude` is a single hardcoded-by-config origin. A second store
  would require a per-order origin lookup (by school, by store id, etc.)
  — not designed for, not attempted, and explicitly out of scope.
- **No caching of routing/autocomplete results**: every new selection
  triggers a real Geoapify call. At current expected volume this is fine;
  a busier deployment might warrant caching frequent destinations (e.g.
  known school addresses), which was deliberately not built prematurely.
- **GST/tax engine**: genuinely does not exist. "Taxes included where
  applicable" is honest wording, not a real calculation.
- **Payment gateway**: still COD/pay-at-store only, unchanged.
- **Delivery ETA**: not calculated or shown anywhere — only distance and
  fee.
- **Address correction / manual override**: if Geoapify's suggestions
  don't include a customer's actual address, there is no manual
  "type it exactly and use it anyway" escape hatch — they can only choose
  Store Pickup or call the shop, per the brief's own suggested fallback
  wording.
- **Delivery-driver navigation**: nothing beyond the stored formatted
  address/route distance exists for whoever fulfills the delivery — no
  turn-by-turn, no driver app.

None of this was hidden — each item above is a genuine gap, not a
polished-over placeholder.

---

## Part 2 Live Geoapify Verification

Date: 2026-08-08

A real `GEOAPIFY_API_KEY` was added to the local `.env` after Part 2 was
implemented against mocks only. This section documents live, non-mocked
verification against the real Geoapify API and the real local database.
**The API key itself is never included anywhere below** (see "API-key
security verification").

No browser-automation tool is available in this environment (same
disclosure as every prior phase). Everything below was verified by
calling the actual application modules (`src/server/geoapify.ts`,
`src/server/commerce/place-order.ts`) directly from short-lived, fully
cleaned-up Node scripts — real HTTP calls to Geoapify, real Postgres
writes, zero mocking — rather than by driving the UI in a browser.

### Shop origin — corrected finding

Reverse-geocoding the configured coordinates (25.9579568, 83.2697821)
against the real Geoapify API resolves to **Azamgarh, Uttar Pradesh**
(`Shivam Hospital, SH67, Azamgarh - 276131, UP, India`) — not Varanasi.
This matters only as a note for future verification: an initial round of
ad hoc autocomplete testing using Varanasi-locality queries (Sigra, Assi
Ghat, Lanka) returned **zero** suggestions, which looked like a possible
bug at first. It wasn't — those localities are ~77km from the configured
shop coordinates, well outside the 50km autocomplete bias/filter radius,
so correctly excluding them is the bias filter working as designed, not
a defect. Retesting with Azamgarh-area queries (below) confirmed the real
integration works correctly. **No code change was made** — this was a
verification-script assumption error, not an application bug. The
configured coordinates themselves were not changed, per the checkpoint's
instruction not to alter them absent an implementation mistake (there
wasn't one).

### Real address autocomplete result

`searchDeliveryAddresses()` called directly (real API, no mock) with
queries near the real shop location:

| Query | Suggestions | Sample result |
|---|---|---|
| "Azamgarh" | 1 | "Azamgarh, UP, India" (postcode 276001) |
| "Civil Lines Azamgarh" | 0 | (no match for this specific sub-locality) |
| "Rani ki Sarai Azamgarh" | 1 | "NH28, Sarai Rani - 276207, UP, India" |
| "276001" | 1 | "Azamgarh - 276001, UP, India" |

Confirmed: results genuinely come from Geoapify (verified against a raw
unfiltered API call returning the same underlying data); results are
geographically relevant to the real shop location; the existing
debounce/minimum-length gating is unchanged code (already unit-tested,
see Part 2 above) and was not bypassed. Formatted addresses only —
no raw lat/lon rendered anywhere in the data shown to a customer.

### Real routing result — road distance, not straight-line

`calculateRouteDistanceMeters()` called directly (real API) at three
offsets from the shop:

| Point | Straight-line (approx.) | Real Geoapify road distance |
|---|---|---|
| ~0.008° lat offset | ~0.89km | **1.755km** (1755m) |
| ~0.03° lat offset | ~3.33km | **3.928km** (3928m) |
| ~0.15° lat offset | ~16.65km | **20.003km** (20003m) |

At every offset, the real routing result is meaningfully **larger** than
the straight-line distance — the expected signature of genuine road/
driving-route distance, and inconsistent with a Haversine or
manually-estimated fallback (which would return the straight-line figure,
not a longer road-route one). Confirms Part 2's routing implementation is
using Geoapify's actual `mode=drive` route distance, not an approximation.

### Real order placement — Cases A/B/C

All three placed as real `LOCAL_DELIVERY` orders through the actual
`placeOrderForBasket()` (real Geoapify calls, real Postgres transaction),
using isolated, clearly-labeled test products/baskets/customers created
and fully deleted by the verification script — never touching the user's
real dev data (7 pre-existing orders confirmed unchanged, before and
after).

| Case | Destination | Real distance | Subtotal | Delivery fee | Result |
|---|---|---|---|---|---|
| A — near (≤3km) | ~1km offset | 1755m | ₹800 | **₹0** | ✅ free within 3km, regardless of subtotal |
| B — far, low subtotal | ~3km offset | 3928m | ₹800 (<₹1,500) | **₹50** | ✅ charged beyond 3km, under threshold |
| C — far, high subtotal | ~3km offset | 3928m | ₹1,600 (≥₹1,500) | **₹0** | ✅ free beyond 3km, threshold met |

All three: **all pass.**

### Persisted delivery snapshot verification

For each order, the database record was read back directly and confirmed
to hold: the real, non-null `deliveryLatitude`/`deliveryLongitude`; the
real Geoapify-reverse-geocoded `deliveryFormattedAddress` (e.g. "Jahanaganj
PHC, SH67, Azamgarh - 276001, UP, India"); the real
`deliveryRouteDistanceMeters` (1755 / 3928 / 3928, matching the routing
calls above exactly); and the authoritative `subtotalInPaise`/
`deliveryFeeInPaise`/`totalInPaise`. No second Geoapify call was needed to
read this back — exactly the snapshot design's intent.

### Stale quote — real routing

A fourth real order attempt used the far destination (real distance
3928m, real authoritative fee ₹50) but submitted a client-side
`expectedDeliveryFeeInPaise` of `0` (a stale/tampered preview). Result:
rejected with `DELIVERY_QUOTE_STALE`, **zero orders created** for that
basket. The amount shown before Place Order must match the authoritative
result — here it deliberately didn't, and the system required review
rather than silently charging ₹50 (or accepting the customer's claimed
₹0). This is the real-provider confirmation of the mocked test already
covering this path.

### Server authority (tampering resistance)

`CheckoutInput`'s actual shape (re-inspected directly from
`src/lib/validation/checkout.ts`) has **no field the client can use to
assert a route distance, subtotal, or grand total** — only
`destinationLat`/`destinationLon` (routing *input*, recalculated
server-side every time) and `expectedDeliveryFeeInPaise` (a
staleness-comparison baseline only, never trusted — see "Stale quote"
above, which is itself the practical tampering test: a client claiming a
different fee than reality is rejected, not honored). No weakening of any
existing check was made or considered to simplify this verification.

### Provider-failure simulation

Simulated Geoapify unavailability **without touching the real key**:
`GEOAPIFY_API_KEY` was overridden to an empty string in the environment of
one single, separate subprocess invocation only (the local `.env` file
itself was never opened for writing). Result: `placeOrderForBasket`
returned `DELIVERY_UNAVAILABLE` with the exact message "We couldn't verify
delivery distance right now. Please try again or choose Store Pickup." —
**zero orders created**, no guessed distance, no guessed fee. Confirmed
immediately afterward that the real `.env` file was unmodified and the
real key still reads back as present/usable (`isGeoapifyConfigured()` →
`true` again with the normal environment). Store Pickup does not depend
on Geoapify at all and remains unaffected by this or any Geoapify outage
(unchanged code path, not re-tested here since nothing about it changed).

### Mobile verification status

**Not performed.** No browser-automation tool is available in this
environment, so no real or simulated mobile viewport interaction (tapping
suggestions, viewing the fee preview, submitting) was exercised. This gap
is disclosed honestly, exactly as the checkpoint's instructions require,
rather than claimed.

### API-call behavior observed

- Autocomplete: each distinct query in the verification script produced
  exactly one Geoapify autocomplete request; the existing 350ms
  debounce/3-character-minimum gating in `DeliveryAddressSearch` is
  unchanged code and was not bypassed by calling the underlying module
  directly.
- Routing: exactly one Geoapify routing call per `calculateRouteDistanceMeters`
  invocation and exactly one per `placeOrderForBasket` call (each of
  Cases A/B/C and the stale-quote case made exactly one real routing
  request, matching the "recalculate once, before the transaction" design
  documented in Part 2 above) — no redundant or repeated calls observed
  for an unchanged destination.
- No excessive or wasteful call pattern was found; no caching was added
  in response to this (none was needed at this volume — see "Architecture
  debt" in Part 2 above, unchanged).

### API-key security verification

- `GEOAPIFY_API_KEY` confirmed present and usable via the application's
  own `isGeoapifyConfigured()` — its value was never printed, echoed, or
  logged at any point in this verification.
- `.env` confirmed git-ignored (`git check-ignore -v .env`) and absent
  from `git status`/`git diff`/`git diff --cached`.
- The literal key value was checked (via a silent, non-printing `grep -q`
  comparison — the match result was reported as OK/LEAK only, the value
  itself never displayed) against: `git diff`, `git diff --cached`, all
  tracked source under `src/`, `docs/`, `prisma/`, and `.env.example`, and
  a **freshly-rebuilt** production bundle (`.next/`, including
  `.next/static/` specifically, where browser-delivered JS lives). **Not
  found anywhere outside `.env` itself.**
- No runtime log line from any verification script or the application
  itself printed the key — confirmed by reviewing script output directly
  (all of it is reproduced or summarized above; none of it contains the
  key).

### Bugs discovered

**None.** Every real-provider result matched the already-implemented,
already-mocked-tested behavior exactly: correct autocomplete biasing,
correct real road-route distances, correct 3km/₹1,500/₹50 rule
application, correct snapshot persistence, correct stale-quote rejection,
correct graceful degradation on simulated provider failure. The one
non-bug finding (shop coordinates resolve to Azamgarh, not Varanasi) was
a verification-script assumption, not an implementation defect, and
required no code change.

### Final regression results

Run after all live verification and cleanup:

- `npx tsc --noEmit` — **clean**.
- `npm run lint` — **clean**.
- `npm test` — **325 / 325 passing** (unchanged from Part 2's own
  verification; no test was modified as a result of live testing, since
  no discrepancy was found).
- `npm run build` — **succeeds**, and the resulting `.next/` output was
  itself re-checked for key leakage (see above) — none found.

### Cleanup confirmation

All data created by this checkpoint (products, variants, baskets, basket
items, customers, categories, orders — all labeled `LIVE_CHECK_P32` /
`LIVE_CHECK_FAIL`) was deleted by the verification scripts themselves
before they exited. Confirmed directly afterward: the shared dev
database's `orders` table count is **7**, identical to the count recorded
before this checkpoint began. No temporary script files remain in the
repository (`git status` confirmed clean of them). Nothing was committed.

Changes across Phase 3.1, Phase 3.2 (all parts), Phase 3.3 Part 1, and
this phase (Part 2, including this live verification) are left
uncommitted, per instruction. Phase 3.3 Part 3 has not been started —
awaiting review.

---

# Part 3 — Final Hardening & Acceptance

Date: 2026-08-08

Audit-first, as instructed: the current implementation (bag, checkout,
Server Actions, place-order, customer contact updates, Geoapify
integration, delivery-fee logic, fulfillment config, order core, Order/
OrderItem schema, confirmation page, admin order list/detail, order
lifecycle, payment lifecycle, inventory, Counter POS) was read in full
before any change, using two parallel research agents plus direct
inspection of the Prisma schema and `place-order.ts`. Only genuine gaps
found by that audit were fixed — nothing speculative was added.

## Gap audit — the 18 questions

1. **First-time parent checkout** — already worked correctly (Part 1/2).
2. **Returning parent checkout** — already worked correctly (Part 1).
3. **Customer linked correctly** — already worked correctly (Part 1).
4. **WhatsApp persisted correctly** — **gap found**: the Customer's
   profile was updated, but no record of what WhatsApp number was actually
   used *at this specific checkout* survived on the Order itself. Fixed
   (see "Customer contact snapshot").
5. **Store Pickup without irrelevant fields** — already worked correctly.
6. **Local Delivery with verified location** — already worked correctly
   (Part 2).
7. **Route distance authoritative** — already true (Part 2).
8. **Delivery fee authoritative** — already true (Part 2).
9. **Final amount clear before submission** — already true (Part 2).
10. **Final amount preserved after submission** — already true (Part 2,
    stale-quote rejection).
11. **Admin staff can see everything needed to fulfill an order** — **gap
    found**: no WhatsApp number visible anywhere in admin, no way to
    navigate to a delivery location without opening a database tool. Fixed
    (see "Admin order visibility").
12. **Historical orders still render** — confirmed correct (pre-existing
    null-safe rendering); added direct query-layer test coverage that was
    previously missing for the *detail* query specifically (the list query
    already had it).
13. **Counter orders still render** — confirmed correct; same new test
    coverage extended to a guest `COUNTER_HANDOVER` order shape.
14. **Lifecycle transitions still valid** — unchanged, unaffected by this
    phase; existing tests re-run and pass.
15. **Mobile checkout reasonably usable** — reviewed at the code level (see
    "Mobile & accessibility review"); no browser tooling available to
    verify visually (disclosed honestly below).
16. **Important state stored only in client memory that should be
    durable** — **gap found and fixed**: the WhatsApp number given at
    checkout (see #4/#11).
17. **Duplicated business logic** — one real instance found and removed:
    `DeliverySelection`/`DeliveryPreview` types were defined twice
    (`delivery-address-search.tsx` and, after this phase's refactor,
    `checkout-fulfillment-state.ts`) — consolidated to one canonical
    definition.
18. **Security/privacy regression** — none found; see "Security & privacy
    review".

**Real bug found that wasn't on the checklist**: switching fulfillment
type in the checkout form didn't clear a previously-selected delivery
location/quote — see "Fulfillment switching" below. This was the most
significant finding of the audit.

## Fulfillment switching — confirmed bug, fixed

Audited by tracing `checkout-form.tsx`'s state exactly: the Local
Delivery → Store Pickup tab click was a bare `setFulfillmentType(...)`
call with no side effects. `destination`/`deliveryPreview` — while
visually hidden once `DeliveryAddressSearch` unmounts — remained non-null
in the parent's React state. Switching back to Local Delivery re-mounted
`DeliveryAddressSearch` with blank internal state (so the visible address
box looked empty), but `canSubmit` (`destination !== null && deliveryPreview
!== null`) was **already true** from the stale values, and the "Place
Order" button showed a real, clickable total using the OLD
coordinates/fee — even though nothing was reselected in this session. This
is exactly the scenario the checkpoint explicitly asked to test, and it
was real.

**Fix**: `fulfillmentType`/`destination`/`deliveryPreview` were
consolidated from three independent `useState` calls into a single
`useReducer` (`src/lib/checkout-fulfillment-state.ts`,
`checkoutFulfillmentReducer`) whose `SET_FULFILLMENT_TYPE` action
atomically resets `destination`/`deliveryPreview` to `null` whenever the
fulfillment type actually changes (a same-type click is a no-op, so an
in-flight preview isn't interrupted by re-clicking the already-active
tab). This was chosen over a one-off `handleFulfillmentChange` helper
specifically because it makes the exact reset behavior a **pure,
directly unit-testable function** with zero DOM/rendering dependency —
see "Tests added" for the 6 tests proving Local Delivery → Store Pickup →
Local Delivery now correctly requires a fresh selection.

## Admin order visibility

Audited `/admin/orders` and the order-detail page directly. Confirmed
already sufficient: order number, source, date/time, customer
name/mobile, linked `customerId`, school, items with size/SKU/qty/price,
subtotal/delivery fee/total, fulfillment/order/payment status badges,
delivery address/area/landmark/formatted-address/route-distance for Local
Delivery. Source and fulfillment-type filters (ONLINE/COUNTER, Store
Pickup/Local Delivery/Counter Handover) already existed in the query,
validation schema, and UI — **no new filters were needed**, confirmed by
reading `admin-orders.ts`/`order-filters.tsx` directly rather than
assuming a gap.

**Two genuine gaps found and fixed:**

- **WhatsApp phone was never shown anywhere in admin** — not in the list,
  not in the detail page, and `getAdminOrderByNumber`'s `customer` select
  didn't even include `whatsappPhone`. Fixed by adding the new
  `order.customerWhatsapp` snapshot (see below) to the Customer section of
  the order-detail page, with a "(same as primary)" annotation when
  applicable — no query change was needed since it's a plain scalar
  column already returned by the existing `include`.
- **No way to navigate to a Local Delivery destination without a database
  tool** — `deliveryLatitude`/`deliveryLongitude` were persisted since
  Part 2 but never read anywhere in the admin UI. Added an "Open Location"
  link using the standard `https://www.google.com/maps/search/?api=1&query=lat,lon`
  URL scheme — no Google Maps SDK/API, no API key, no embedded map, just a
  plain anchor tag generated server-side from the order's own persisted
  coordinates, opening in a new tab. Rendered only for Local Delivery
  orders with non-null coordinates.

Raw lat/lon are still never rendered as visible numbers anywhere in
admin — only used to build the map link's URL.

## Customer contact snapshot

Audited whether an order remains understandable after the linked
Customer's profile changes later. `customerName`/`customerMobile` were
already point-in-time snapshots on `Order` (independent of the `customer`
relation) since Phase 3.1 — confirmed by reading the schema's own doc
comments. **`customerWhatsapp` was not** — the WhatsApp number given at
checkout was only ever written to `Customer.whatsappPhone` (best-effort,
and only when "same as primary" was unchecked), meaning:

1. An order's own historical record couldn't say what WhatsApp number was
   actually associated with it at the time — only the customer's
   *current* profile could be checked, which drifts.
2. When "same as primary" was checked, `Customer.whatsappPhone` was never
   touched at all, so it could stay stale from an entirely different,
   much earlier checkout.

**Fix (additive, one nullable column)**: `Order.customerWhatsapp String?`
— the exact same snapshot pattern as `customerName`/`customerMobile`,
populated inside the same transaction as order creation (not a
best-effort afterthought) as `customerMobile` when "same as primary" was
checked, or the distinct number otherwise. `Customer.whatsappPhone` is
still updated best-effort, post-commit, non-blocking — but now in
**both** branches (previously only the "distinct number" branch), so a
customer who always checks "same as primary" no longer has a permanently
stale `whatsappPhone` on their profile. No redundant duplication: this is
one new column, following an established pattern exactly, closing a real
gap rather than speculative schema growth.

## WhatsApp state

Audited the checkbox/field interaction end to end. Two real gaps found:

- **Validation gap**: unchecking "same as primary" didn't require a
  distinct number — a customer could uncheck the box, leave the field
  blank, and submit, an ambiguous half-filled state. Fixed: `checkoutInputSchema`'s
  `superRefine` now requires a non-empty `whatsappPhone` whenever
  `whatsappSameAsPrimary` is `false`. One pre-existing test's premise
  (asserting the old, now-intentionally-wrong behavior) was updated to
  assert the new, correct rejection — documented inline in the test file
  as a deliberate tightening, not a silent weakening.
- **Staleness gap**: `Customer.whatsappPhone` was never re-synced to the
  current primary phone when "same as primary" was (re-)checked. Fixed as
  part of the "Customer contact snapshot" change above.

Confirmed already correct: the client never needs to "sync" the WhatsApp
field to primary-phone edits in the browser, since the field is hidden
entirely while checked and the server always derives the value from
`customerMobile` in that case — there's no client-side value to keep in
sync at all.

## Address state correctness

Aggressively audited the "select A, then edit to B" edge case per the
checkpoint's explicit instruction. `DeliveryAddressSearch`'s
`handleQueryChange` already invalidated a stale selection on any material
edit, confirmed correct by direct trace. The exact invalidation predicate
was extracted into a pure, exported function
(`src/lib/delivery-address-selection.ts`, `shouldInvalidateSelection`) so
this specific rule is now directly unit-tested (5 new tests: no selection
yet, exact match, one-character edit, cleared entirely, replaced with a
different address) rather than only provable by reading the component's
source.

## Financial snapshot correctness

Audited whether a Product's price change or a delivery-config change
after an order exists could ever alter its historical display. Confirmed
already correct and untouched by this phase: `OrderItem.unitPriceInPaise`/
`lineTotalInPaise` are point-in-time snapshots (Phase 1), `Order.subtotalInPaise`/
`deliveryFeeInPaise`/`totalInPaise` are stored authoritative values (Phase
2/3.3 Part 2) — nothing in the display path re-reads current
`ProductVariant.priceInPaise` or current `FULFILLMENT_CONFIG` values for
a historical order. No changes were needed; existing tests (`"snapshots
product name/size/SKU/price..."`, `"uses the current authoritative
price..."`) already prove this and continue to pass.

## Historical & Counter order compatibility

Confirmed (and, where missing, added direct test coverage for) graceful
degradation: a hand-constructed pre-Phase-3.3 order (`customerId: null`,
no delivery geo/WhatsApp fields) and a guest `COUNTER_HANDOVER` order both
load cleanly through `getAdminOrderByNumber` with every new field reading
back `null` rather than throwing. The admin detail page's own rendering
was already fully null-safe for every Part 2/3 field (`?.`/conditional
JSX throughout, verified by direct reading) — the new tests close the gap
at the query layer, which is what's provable without a
browser-rendering harness (see "Manual verification").

## Bag & checkout summary

Confirmed already correct: `/bag` shows product/size/qty/unit
price/line total/subtotal only, with the honest "Delivery/pickup and
payment are chosen at checkout" wording — no guessed delivery fee.
Checkout's summary already shows "Free"/₹-amount (not a bare "₹0"),
"Taxes: Included where applicable", and disables Place Order (showing
"Select a delivery location to continue") whenever the delivery fee isn't
yet known. No changes needed to either.

## Mobile & accessibility review

**Accessibility gap found and fixed**: `DeliveryAddressSearch`'s
suggestion list had no combobox/listbox ARIA semantics and no live-region
status announcements — a screen-reader user typing an address would get
no non-visual signal that suggestions appeared, that a search was in
progress, or that an error occurred. Added: `role="combobox"` +
`aria-expanded`/`aria-autocomplete="list"`/`aria-controls` on the input,
`role="listbox"`/`role="option"` on the suggestion list, and an
`aria-live="polite"` region wrapping the searching/notice status text.
Scoped deliberately to what the checkpoint asked for (semantic
roles + live announcements) — a full roving-tabindex arrow-key-navigable
combobox was judged out of scope for this hardening pass; native Tab-key
navigation to each suggestion button already works.

**Mobile**: reviewed at the code level — touch-sized inputs/buttons,
full-width stacked suggestion rows (no horizontal scroll), inline
loading/error states, sticky visual hierarchy toward the total and Place
Order button. **Not verified in an actual mobile viewport or browser** —
no browser-automation tool is available in this environment, disclosed
honestly rather than claimed (same limitation as every prior phase/part).

## Performance review

No changes needed. Confirmed unchanged from Part 2: autocomplete
debounced 350ms/3-character minimum; routing called once per selection
(preview) and once per submission (authoritative recalculation); no
Geoapify call fires on every keystroke; no N+1 query pattern was
introduced by any Part 3 change (the new `customerWhatsapp` field is a
plain scalar column, no new joins; the admin detail page's new map link
and WhatsApp line use fields already being fetched).

## Privacy & security review

- Public order confirmation still requires `orderNumber` + secret
  `accessToken`; unchanged, not touched by this phase.
- No public customer/phone search exists; no new public endpoint was
  added.
- Admin access remains authenticated (`getAdminSession()`), unchanged.
- The new "Open Location" link is generated entirely server-side from
  server-owned, already-persisted coordinates — it never reads from a
  client request, requires no API key, and adds no new client-server data
  flow.
- Raw coordinates still never render as visible text in any customer or
  admin UI — only ever used to build the map link's `href`.
- No client-trusted price/subtotal/delivery-fee/route-distance was
  introduced; the new WhatsApp validation runs entirely server-side
  (`checkoutInputSchema`); the reducer refactor changes only *when*
  client state resets, never what the server trusts from it (destination/
  fee were already, and remain, always recalculated server-side).
- No new Customer-ID-as-authentication surface; no order-token
  regression.

## Geoapify autocomplete bias / location assumption cleanup

Re-checked all documentation and code for lingering "Varanasi" references
per the checkpoint's explicit instruction (the live verification
established the real shop coordinates resolve to Azamgarh, UP). Found
only: (1) the Part 2 Live Verification section's own narrative correctly
*explaining* the earlier mistaken assumption and its correction — accurate
history, left as-is; (2) an arbitrary placeholder city name
("Varanasi") inside `geoapify.test.ts`'s mocked API response fixture,
which asserts nothing about the real shop's location (it's fabricated
test data, structurally identical to using "Sector 5" or "Test City"
elsewhere) — not a location assumption bug, left unchanged as
inconsequential. The configured shop coordinates and the autocomplete
bias/filter radius were **not** changed, per instruction.

## Tests added

**344 tests passing** (325 from Part 2 + 19 new/changed for Part 3):

- `src/lib/__tests__/checkout-fulfillment-state.test.ts` (new, 6 tests):
  proves the fulfillment-switching bug is fixed — Local Delivery → Store
  Pickup clears destination/preview; switching back does not resurrect a
  stale selection; switching to the same type is a no-op; each reducer
  action updates only its own slice of state.
- `src/lib/__tests__/delivery-address-selection.test.ts` (new, 5 tests):
  the address-invalidation predicate — no selection yet, exact match,
  one-character edit, cleared entirely, replaced address.
- `src/lib/validation/__tests__/checkout.test.ts` (extended): WhatsApp
  required once unchecked (empty string and fully omitted both rejected,
  each asserting the specific field error); allowed empty while checked.
  One pre-existing test's assertion was deliberately flipped (documented
  inline) to match the new, intentional validation tightening.
- `src/server/commerce/__tests__/place-order.test.ts` (extended, 3 new
  tests, isolated fresh phone numbers to avoid cross-test coupling on the
  file's shared fixed-phone customers): `customerWhatsapp` snapshot
  equals `customerMobile` when checked (and `Customer.whatsappPhone`
  syncs); snapshot equals the distinct number when unchecked (and syncs);
  a later "same as primary" checkout re-syncs the Customer's WhatsApp back
  to the current primary phone after an earlier checkout had set a
  different one.
- `src/server/queries/admin/__tests__/orders.test.ts` (extended, 3 new
  tests): `getAdminOrderByNumber` returns a pre-Phase-3.3-shaped historical
  order and a guest Counter order cleanly (all new fields `null`, no
  throw); returns a fully-populated Local Delivery order with every Part
  2/3 field intact (`customerWhatsapp`, formatted address, route
  distance, coordinates).

No test was weakened or deleted to make this pass; the one flipped
assertion is a deliberate, documented behavior tightening, not a
regression cover-up.

## Integration / concurrency regression

Re-ran (unmodified) the existing real-Postgres concurrency suite as part
of the full test run: final-unit online race, online-vs-counter stock
race, customer-creation race, same-idempotency-key race (both sequential
and true concurrent), the combined customer+idempotency interaction test.
All pass exactly as before — nothing in this phase touched
`resolveAndDecrementOrderLines`, the order-number/idempotency retry
logic, or the customer-phone race handling. The reducer refactor and new
`customerWhatsapp` field only affect client-side state timing and one
additional scalar write inside the same existing transaction — neither
changes transaction boundaries or lock windows.

## Manual verification

Same honest disclosure as every prior phase/part: no browser-automation
tool is available in this environment. What was actually done, and one
important finding:

- Confirmed via the user's own live dev server that `/`, `/checkout`, and
  `/admin/login` all return `200` after this phase's changes were
  hot-reloaded, with no new compile errors.
- **A genuine, currently-relevant issue was found while checking the live
  dev server's own log** (not caused by this phase's code): the
  long-running dev server process (alive since before this session) has
  a **stale, in-memory Prisma Client** relative to schema changes applied
  via `prisma generate` at various points across this multi-day session.
  The log shows repeated real failures from the user's own Local Delivery
  checkout attempts: `"Unknown argument \`schoolId\`. Did you mean
  \`school\`?"` — `schoolId` has been a valid direct scalar write on
  `Order` since Phase 3, so this is not a code defect in any phase's
  logic; it's a symptom of a Node process that loaded an older generated
  `@prisma/client` build and was never restarted after a later `prisma
  generate`. **This means Local Delivery checkout may currently be
  failing on the user's live server** until it's restarted (`npm run
  dev`) to load the freshly-generated client. This phase did not restart
  the user's server (consistent with every prior phase's stated policy
  of never disrupting their in-progress session) — flagging it here, and
  in the final response, is the correct action instead.
- No interactive click-through of the checkout form (typing, selecting a
  suggestion, watching state reset on fulfillment-switch, submitting) was
  performed — not possible without browser automation. The reducer
  refactor's correctness is proven at the unit level (6 passing tests)
  instead, which is the strongest verification available in this
  environment.

## Fresh-database verification

Created a second throwaway database (`shop_fresh_verify_p3`), separate
from the shared dev database. Ran `prisma migrate deploy` — **all 8
migrations**, including this phase's new
`20260808100000_phase3_3_part3_customer_whatsapp_snapshot`, applied
cleanly to a genuinely empty schema — then `prisma/seed.ts`, then
`prisma/create-admin.ts`, then the full 344-test suite: all passing.
Database dropped immediately after. The shared dev database's own order
count was confirmed unchanged (7) before and after this verification.

## Code health

Checked the full Part 3 diff for: duplicated logic (found and removed —
see "Gap audit" #17); magic numbers (none introduced); unnecessary schema
fields (the one new field, `customerWhatsapp`, closes a real,
demonstrated gap — not speculative); dead code, temporary verification
scripts, debug `console.log`, `TODO`/`FIXME`, `.only`/`.skip`/`.todo` in
tests, secrets, unnecessary dependencies — **none found**. No new
dependency was added; the client-state-testability need (fulfillment
switching, address invalidation) was met by extracting pure functions
into `src/lib/`, not by adding a component-testing framework
(`@testing-library/react`/`jsdom`) that this codebase has never used.

## Schema review

One new column this phase: `Order.customerWhatsapp String?` — nullable
(existing orders correctly have none), additive (pure `ALTER TABLE ...
ADD COLUMN`, no backfill), order-specific (not added to `Customer`,
preserving Part 2's explicit decision that delivery/contact-at-order-time
data belongs on the order, not the customer). No index was added for it —
it's never filtered or searched on, only displayed. **No further
migration is needed** — every other Part 1/2 schema decision was
re-confirmed still correct and sufficient for Part 3's requirements.

## Known limitations

Explicitly not provided by Phase 3.3, consistent with the brief (these
are not failures — they belong to later phases): customer OTP, customer
portal, all-order tracking/purchase history UI, returns/exchanges,
refunds, WhatsApp messaging/notifications, payment gateway, GST invoice
engine, live driver tracking. Additionally, specific to this phase:

- The stale delivery quote check compares only the delivery fee, not
  subtotal/total independently — a subtotal-only price change still goes
  through Phase 2's existing silent-recalculation behavior (unchanged;
  only the delivery-fee-specific honesty guarantee is stricter, exactly
  as designed).
- No live browser/mobile-viewport verification was possible in this
  environment for any part of this phase.
- The user's live dev server's stale Prisma Client (see "Manual
  verification") requires a restart on their end — this phase surfaced
  it but could not and should not fix it by force-restarting their
  process.

## Architecture debt

Unchanged from Part 2, re-evaluated honestly, nothing new introduced:
Geoapify vendor dependency; single-store location assumption; no
multi-store fulfillment; no real GST/tax engine; no online payment
gateway; no delivery ETA; no delivery-driver workflow/navigation beyond
the plain "Open Location" link; no customer authentication/OTP. No schema
compromise was discovered during this phase's review — every existing
decision (nullable delivery snapshot fields, order-not-customer contact
snapshot, no speculative indexes) was re-confirmed sound.

## Final Phase 3.3 verdict

> A Klasiq parent can shop without login/signup, complete a
> customer-aware Store Pickup or Local Delivery checkout, provide
> appropriate contact/WhatsApp information, select a real
> Geoapify-resolved delivery location when needed, receive
> server-authoritative route-based delivery pricing, review an honest
> itemized total, place exactly one concurrency-safe order linked to
> their permanent Customer identity, and access that individual order
> through the secure confirmation URL — while Klasiq staff can see all
> information necessary to fulfill that order from the authenticated
> Admin panel without database access.

Demonstrated true, with evidence cited above: new and returning customers
work (Part 1); Counter and Online share Customer identities (Part 1,
re-verified); Store Pickup works without delivery data; Local Delivery
uses real road-route distance (Part 2, live-verified); ≤3km is free,
>3km+<₹1,500 charges ₹50, ≥₹1,500 is free (Part 2, live-verified);
delivery/address state cannot go stale (Part 2's text-edit invalidation,
now unit-tested; Part 3's fulfillment-switch fix closes the one real gap
found); WhatsApp state behaves correctly (Part 3 fix); historical and
Counter orders remain compatible (re-verified with new tests); historical
financial values remain immutable (re-confirmed); Geoapify failure never
creates guessed pricing (Part 2, live-verified); the client cannot
manipulate commerce totals (re-confirmed); privacy remains intact; admin
operational visibility is now sufficient (Part 3 fix — WhatsApp + map
link); inventory concurrency and idempotency remain intact (regression
suite re-passed); the full test suite passes (344/344); the production
build passes; fresh-database verification passes (8 migrations); this
documentation is complete; no secrets or debug leftovers exist.

**PHASE 3.3 — COMPLETE**

Changes across Phase 3.1, Phase 3.2 (all parts), and Phase 3.3 (Parts 1,
2, Part 2 Live Verification, and Part 3) are left uncommitted together in
the working tree, per instruction. Phase 3.4 has not been started —
awaiting review.
