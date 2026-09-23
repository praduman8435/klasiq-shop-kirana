# Phase 3.1 — Customer Identity Foundation

Date: 2026-08-04

Builds on the committed Phase 3 baseline (`e5f9bcaac69d4556cacfc0b394d74dd530d41135`).
Read [`docs/PHASE_0_AUDIT.md`](./PHASE_0_AUDIT.md),
[`docs/PHASE_1_REPORT.md`](./PHASE_1_REPORT.md),
[`docs/PHASE_2_REPORT.md`](./PHASE_2_REPORT.md), and
[`docs/PHASE_3_REPORT.md`](./PHASE_3_REPORT.md) first — this document only
covers what changed.

**Scope note**: this phase is deliberately data/query-layer only, per the
brief. No checkout integration, no admin UI, no OTP, no login, no purchase
history/returns/exchange/WhatsApp/counter-POS/analytics/loyalty. Everything
below exists so the *next* phase can wire checkout to a Customer without
inventing anything under pressure — the same "build the rule ahead of the
flow that uses it" pattern as Phase 2's `order-lifecycle.ts` (written before
Phase 3's admin UI called it).

## What was built

- **`Customer` model** (`prisma/schema.prisma`) — a permanent internal
  identity, intentionally small.
- **Permanent Customer ID** (`src/lib/customer-id.ts`) — `KLQ-XXXXXX`,
  generated server-side, never trusted from a client, never claiming
  uniqueness itself (the DB unique constraint + a retry loop is what
  actually guarantees it — same contract as `order-number.ts`).
- **Phone normalization** (`src/lib/phone.ts`) — collapses every documented
  input format to one canonical E.164 value.
- **Customer uniqueness / lookup-or-create** (`src/server/commerce/customer.ts`)
  — `findOrCreateCustomerByPrimaryPhone`, proven safe under real concurrency,
  and `updateCustomerContactInfo` for future edits. **Not called from
  checkout yet** — see "What remains" below.
- **Customer search foundation** (`src/server/queries/admin/customers.ts`)
  — query functions only, no admin page.
- **Additive migration** (`prisma/migrations/20260804120000_phase3_1_customer_identity/`)
  — new `customers` table + nullable `orders.customerId`, nothing dropped or
  altered destructively.
- Two small, low-risk extractions to avoid duplicating patterns Phase 3.1
  needed a second copy of: `src/lib/unambiguous-code.ts` (the alphabet/code
  generator `order-number.ts` and `customer-id.ts` both now share) and
  `src/lib/prisma-errors.ts` (the P2002-on-field check `place-order.ts` and
  `customer.ts` both now share). Both existing files' public API and
  behavior are unchanged — confirmed by the pre-existing test suites still
  passing unmodified.

## Customer model

```prisma
model Customer {
  id                      String    @id @default(cuid())
  customerId              String    @unique
  displayName             String?
  primaryPhone            String?
  primaryPhoneNormalized  String?   @unique
  whatsappPhone           String?
  whatsappPhoneNormalized String?
  active                  Boolean   @default(true)
  lastOrderAt             DateTime?
  createdAt               DateTime  @default(now())
  updatedAt               DateTime  @updatedAt
  orders                  Order[]
}
```

Fields deliberately **not** included: phone-verification status, purchase
history, loyalty points, CRM notes, session/auth fields. All of those belong
to a specific future module (OTP, analytics, loyalty) and adding any of them
later is an additive migration on this table, not a redesign — exactly what
the brief asks the model to support.

`lastOrderAt` exists now (unset by anything yet, since nothing writes it —
no checkout integration this phase) purely so the next phase's checkout
integration has a place to record it without another migration, and so
`searchCustomers`' `orderBy: lastOrderAt desc` already has a real column to
sort on.

### Why every phone field is nullable

`primaryPhone`/`primaryPhoneNormalized` are nullable at the schema level
even though every current creation path (`findOrCreateCustomerByPrimaryPhone`)
always sets them — this mirrors `Order.idempotencyKey`'s existing precedent
(a `NOT NULL UNIQUE` column can't tolerate a future code path that
legitimately has no phone yet, e.g. a hypothetical future counter-sale
started with just a name). Keeping the column nullable now avoids forcing a
migration later if such a path appears; the actual non-null guarantee for
today's flows lives in application code (`findOrCreateCustomerByPrimaryPhone`
never creates a phoneless customer), not the schema.

## Permanent Customer ID

`src/lib/customer-id.ts` mirrors `src/lib/order-number.ts` exactly: `KLQ-`
plus a 6-character suffix drawn from the same 30-character unambiguous
alphabet (`23456789ABCDEFGHJKMNPQRSTVWXYZ` — no `0`/`O`/`1`/`I`/`L`, so a
digit can never be confused with a letter when read aloud). Both generators
now share the alphabet and the random-code loop
(`src/lib/unambiguous-code.ts`) instead of duplicating it.

**Uniqueness is not claimed by the generator** — same contract as order
numbers. `Customer.customerId` is a DB unique constraint; the only current
writer (`findOrCreateCustomerByPrimaryPhone`) retries with a fresh id (up to
5 attempts) on an actual collision. With a 30-character alphabet and 6
random characters (~729 million combinations), a collision is not
realistically expected — the retry loop exists to make even that safe, not
because it's expected to fire.

**Never changes, never recycled**: nothing in this codebase updates
`customerId` after creation (`updateCustomerContactInfo` only ever touches
`displayName`/phone fields), and nothing deletes a `Customer` row, so no
recycling path exists.

## Phone normalization strategy

`src/lib/phone.ts`, `normalizePhoneNumber(rawInput): { valid: true;
normalized: string } | { valid: false }`.

**Canonical form chosen: E.164** (`+919876543210`), not a bare 10-digit
form. Two reasons:

1. It's the format WhatsApp's Business API requires for a phone number —
   choosing it now means the future WhatsApp verification/notification
   module can consume `primaryPhoneNormalized`/`whatsappPhoneNormalized`
   directly, with no reformatting step and no redesign.
2. It's unambiguous on its own (a bare 10-digit string doesn't self-declare
   its country), which matters the moment this ever needs to support a
   non-Indian number — not needed today, but the format doesn't foreclose it.

**Algorithm**:

1. Strip whitespace, hyphens, and parentheses.
2. Strip a single leading `+`.
3. **Only if** what remains is exactly 12 digits and starts with `91`, strip
   that `91` prefix. The length check matters: it's what prevents a genuine
   10-digit local number that happens to start with `91` as its own first
   two digits (e.g. `9187654321` — first digit `9`, second digit `1`, both
   valid) from being misread as "country code 91 + 8 remaining digits". A
   10-digit input never reaches this branch at all.
4. What's left must match `^[6-9]\d{9}$` (the same "10 digits, first digit
   6-9" rule `checkout.ts`'s existing mobile validation already encodes) —
   otherwise the whole input is rejected.
5. Return `+91` + the 10 digits.

This collapses every documented equivalent format to the identical value:
`9876543210`, `+91 9876543210`, `+919876543210`, `98765 43210`,
`98765-43210` → `+919876543210` in every case (asserted directly in
`src/lib/__tests__/phone.test.ts`).

**Deliberately independent of `src/lib/validation/checkout.ts`**: that
file's own `MOBILE_PATTERN` check validates checkout *form* input today and
is unrelated to Customer in this phase (checkout integration is explicitly
deferred). Rather than touch a proven, tested Phase 2 file for a
not-yet-connected concern, `phone.ts` stands alone now; the next phase's
checkout integration is the natural point to have `placeOrderForBasket` call
`normalizePhoneNumber` itself (or have the checkout schema's `transform`
delegate to it) so there's exactly one normalization implementation in the
codebase once they're actually wired together.

## Customer uniqueness / lookup-or-create

`src/server/commerce/customer.ts` — `findOrCreateCustomerByPrimaryPhone({
rawPhone, displayName? })`:

1. Normalize the phone. Invalid → `INVALID_PHONE`, nothing touched.
2. Look up `Customer` by `primaryPhoneNormalized`. Found → return it
   (`wasCreated: false`), **without** overwriting its existing
   `displayName` — reuse must never silently clobber what's already on
   file from an update.
3. Not found → create, retrying on a `customerId` collision (same shape as
   `place-order.ts`'s `orderNumber` retry) and, on a
   `primaryPhoneNormalized` collision, re-reading and returning the winner
   instead of erroring.

Step 3's collision recovery is what makes this safe under **genuine
concurrency**, not just sequential calls: two truly simultaneous checkouts
for a phone number that has never ordered before can both pass step 2
before either commits. Proven with a real `Promise.all` race in
`src/server/commerce/__tests__/customer.test.ts` — exactly one `Customer`
row exists afterward, both calls return the same row. This mirrors Phase
2's proven concurrent-idempotency-key test and Phase 3's proven concurrent
stock/cancellation tests — the same "argue it, then prove it with a real
race" standard applied to this new code path.

**Be conservative, per the brief**: reuse is keyed on *exact* normalized
phone match only. No fuzzy matching, no matching by name, no matching by
partial phone. A wrong dedup here is much harder to undo later (merging
histories) than temporarily under-deduping, so the function only ever
merges identities when the phone match is unambiguous.

`updateCustomerContactInfo({ id, displayName?, primaryPhone?,
whatsappPhone? })` — the "names/phones change, `customerId` doesn't" path:

- Only supplied fields are touched; `customerId` is never in the update
  payload at all (not merely "not being changed" — the function has no code
  path that could write it).
- Moving `primaryPhone` onto a number already claimed by a *different*
  `Customer` row is refused (`PHONE_IN_USE`) rather than silently
  reassigning it — deciding two identities should merge is a real,
  deliberate operational decision (with implications for order history)
  that a future module should make explicitly, not something this function
  should do as a side effect of an edit.

## Customer search foundation

`src/server/queries/admin/customers.ts` — `searchCustomers(query, limit?)`,
`getCustomerByCustomerId`, `getCustomerByNormalizedPrimaryPhone`. Query
functions only; **no admin page or component exists for this yet**, per the
brief's explicit "lay the foundation, don't build the UI."

`searchCustomers` OR-matches: exact `customerId` (case-insensitive), partial
`displayName` (case-insensitive `contains`), and — only when the query
string itself parses as a phone number — an exact match against either
`primaryPhoneNormalized` or `whatsappPhoneNormalized`.

## Indexing decisions (performance)

The brief's actual performance requirement is phone/customer lookup, which
must stay fast after years of growth:

- `customerId`: unique constraint → B-tree, O(log n) lookup regardless of
  table size. This is the same performance class `orderNumber` already gets.
- `primaryPhoneNormalized`: unique constraint → same guarantee, and it's
  also the field the uniqueness/dedup logic queries on every checkout in
  the future, so it needing to be fast is not hypothetical.
- `whatsappPhoneNormalized`: plain (non-unique) `@@index` — supports fast
  exact-match search without the uniqueness constraint (see "Customer
  uniqueness" below for why it's *not* unique).
- `lastOrderAt`: plain `@@index`, for the `searchCustomers` sort and any
  future "most recently active customers" admin view.

**Known, honestly-documented limitation**: `displayName`'s `contains`
(substring) search is **not** backed by an index — Postgres can't use a
plain B-tree for arbitrary `%x%` matching, so it degrades toward a
sequential scan as the table grows. This isn't silently glossed over: a
`pg_trgm` GIN index is the correct fix, deferred until an actual admin
customer-search UI exists to need it (building that index now, with no UI
consuming it yet, would be exactly the kind of premature scope the brief
asks to avoid).

## Customer uniqueness — why `whatsappPhoneNormalized` is NOT unique

`primaryPhoneNormalized` is unique: it's the actual identity/dedup key, and
two different `Customer` rows must never claim the same verified primary
phone.

`whatsappPhoneNormalized` is deliberately **not** unique. A WhatsApp number
is a *contact channel*, not necessarily a *personal identity* — a real
scenario the brief's own "grandparent orders for a grandchild, notifications
go to a parent's WhatsApp" future use case implies: two different people
(two different `Customer` rows, each with their own distinct `primaryPhone`)
could legitimately share one WhatsApp number for delivery notifications.
Enforcing uniqueness there would incorrectly block that real case. This is
a considered decision, not an oversight — flagged explicitly here since it's
the one place this model treats its two phone fields asymmetrically.

## Existing-orders migration strategy

`orders.customerId` is added **nullable**, with `onDelete: SetNull`. No
backfill of any kind:

- Every order from Phases 1–3 predates `Customer` and keeps `customerId =
  NULL` permanently — they remain fully valid orders (nothing about their
  correctness, history, or the storefront's ability to display them depends
  on having a `Customer` link).
- **New** orders also get `customerId = NULL` for now, because this phase
  explicitly does not wire `findOrCreateCustomerByPrimaryPhone` into
  `placeOrderForBasket` — that integration is the next phase's job per the
  brief's explicit stop instruction.
- **No synthetic backfill was attempted**, per the brief's explicit
  instruction not to invent fake customer data. Retroactively matching
  historical orders to a `Customer` by normalizing their snapshot
  `customerMobile` was considered and rejected for this phase: those phone
  numbers were never verified, and reusing Phase 3.1's exact-match dedup
  logic against unverified historical data would silently create the same
  kind of permanent identity a future OTP-verified checkout is supposed to
  establish more carefully. If a later phase decides historical linking is
  worth doing, it should be its own explicit, reviewed migration — matching
  normalized `customerMobile` against `Customer.primaryPhoneNormalized` — not
  something folded silently into this one.
- `customerName`/`customerMobile` on `Order` are **unchanged** and remain
  the point-in-time snapshot of who placed that specific order — the same
  role `OrderItem.productName`/`skuSnapshot` already play for catalog data.
  They are not replaced by the `Customer` relation; both will coexist once
  checkout is wired up, exactly as `OrderItem` snapshots coexist with live
  `Product` data today.

## Security

- **`customerId` is an identifier, not a credential.** Nothing in this
  phase (or planned for a future one) treats "supplying a valid `KLQ-`
  code" as proof of ownership — the same separation Phase 2 already
  established between `Order.orderNumber` (public, readable-aloud) and
  `Order.accessToken` (private, unguessable, the actual access-control
  mechanism). Any future customer-facing feature (portal, order history)
  must authenticate via the planned OTP module, not by accepting a
  `customerId` at face value.
- **Never client-generated.** `generateCustomerId()` only runs server-side,
  inside `findOrCreateCustomerByPrimaryPhone` — there is no code path that
  accepts a client-supplied `customerId` for a new row.
- **No new data exposure surface**: no admin UI, no route, no Server Action
  reads or returns `Customer` data yet — the query functions exist but
  nothing in the app calls them, so this phase does not introduce any new
  way to leak customer data.

## Tests added

`npm test` → **197 tests passing** (197 = 161 from Phase 1–3 + 36 new),
verified fresh against a completely empty database migrated from scratch
(see "Verification gate" below).

- `src/lib/__tests__/customer-id.test.ts` — format validation, `KLQ-`
  prefix, no confusable characters, statistical uniqueness sanity check,
  rejects malformed/lowercase/wrong-length ids.
- `src/lib/__tests__/phone.test.ts` — all five documented equivalent
  formats normalize identically; the `9187654321`
  starts-with-91-but-is-actually-a-local-number case does **not**
  misnormalize; rejects invalid first digit, wrong length, non-numeric,
  and empty input.
- `src/server/commerce/__tests__/customer.test.ts` (real Postgres,
  11 tests) — creates a new customer; reuses the same customer for the same
  phone typed in a different format without overwriting its display name;
  **true concurrent race for a brand-new phone creates exactly one
  customer** (`Promise.all`); rejects an invalid phone with nothing created;
  updates `displayName` without touching `customerId`/phone; updates
  `primaryPhone` to a new unclaimed number; **refuses to move a phone onto
  one already claimed by a different customer**; `NOT_FOUND` for an unknown
  id; rejects an invalid new phone without mutating the existing one.
- `src/server/queries/admin/__tests__/customers.test.ts` (real Postgres,
  9 tests) — exact `customerId` match (case-insensitive), partial
  `displayName` match, phone match in a non-canonical input format, a phone
  that is one customer's `whatsappPhone` correctly also surfaces that
  customer in search, blank/no-match queries return `[]`,
  `getCustomerByCustomerId`/`getCustomerByNormalizedPrimaryPhone` found/
  not-found cases.
- Existing `order-number.test.ts` and the full `place-order.test.ts`
  integration suite re-run unmodified and still pass, confirming the
  `unambiguous-code.ts`/`prisma-errors.ts` extractions didn't change either
  file's behavior.

## Verification gate

```
$ npm run typecheck   → clean
$ npm run lint        → clean
$ npm test            → 197/197 passed
$ npm run build       → succeeds, 22 routes (unchanged — no new routes/UI)
```

Migration reproducibility: created a brand-new empty Postgres database
(`shop_migration_verify`), ran `prisma migrate deploy` (all four
migrations — Phase 1 `init`, Phase 2 `phase2_checkout_orders`, Phase 3
`phase3_admin_operations`, Phase 3.1
`phase3_1_customer_identity` — applied cleanly in order), ran
`prisma/seed.ts` and `prisma/create-admin.ts` successfully against it, then
ran the full 197-test suite against that fresh database — all passing.
That verification database was then dropped. The dev database was left with
zero leftover `Customer` rows or `Order.customerId` values from this
phase's test runs (every integration test cleans up its own fixtures).

## What remains (explicitly out of scope this phase)

Per the brief, none of the following were implemented — the model is
shaped to support all of them without another redesign:

1. **Checkout integration** — `placeOrderForBasket` calling
   `findOrCreateCustomerByPrimaryPhone` and setting `Order.customerId`.
   Waiting for the next specification, as instructed.
2. OTP verification / customer login / sessions / customer portal.
3. Purchase history UI, returns, exchange.
4. WhatsApp notifications, counter POS, analytics, CRM, loyalty, coupons.
5. Admin customer search UI (the query foundation above is ready for it).
6. A deliberate, reviewed historical-order backfill migration, if a future
   phase decides linking Phase 1–3 orders to a `Customer` by matching
   snapshot `customerMobile` is worth the identity risk discussed above.

Changes in this phase are left uncommitted, per instruction.
