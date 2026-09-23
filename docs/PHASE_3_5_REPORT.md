# Phase 3.5 — Returns & Exchanges

## Part 1 — Domain Foundation

Date: 2026-08-08

Builds on the committed Phase 3 baseline and the uncommitted Phase
3.1–3.4 work (all complete — see `docs/PHASE_3_1_REPORT.md` through
`docs/PHASE_3_4_REPORT.md`). This phase is **domain foundation only** —
no customer-facing UI, no admin UI, no inventory reconciliation, no
refund processing. It exists so Phase 3.5 Parts 2–5 (Customer Return
Portal, Admin Return Management, Walk-in Return, Exchange Engine) have a
correct, tested engine to build on rather than each improvising one.

## Existing implementation audited (before writing any code)

Read directly, not assumed:

- **`Order`/`OrderItem`** (`prisma/schema.prisma`) — confirmed `OrderItem`
  already snapshots product name/size/SKU/price at purchase time (Phase
  1), and `Order` has no prior concept of "when was this delivered"
  beyond the generic `updatedAt` — a real gap for a 7-day-since-delivery
  rule, closed below.
- **`src/lib/order-lifecycle.ts`** — the exact pattern this phase's
  `return-lifecycle.ts` mirrors: a transition table plus pure validators,
  built *before* any mutating endpoint calls it, specifically so a later
  phase has a correct rule ready. Phase 2's own doc comment on that file
  says almost word-for-word what this phase's `return-lifecycle.ts` says
  about itself — the same architecture, reused deliberately.
- **`src/server/commerce/order-core.ts`**
  (`resolveAndDecrementOrderLines`) — the guarded-`updateMany` inventory
  concurrency pattern this phase's return-quantity claiming reuses
  exactly (see "Concurrency" below).
- **`src/server/commerce/update-order-status.ts`** — confirmed this is
  the *only* place `Order.status` transitions happen for online/counter-
  handover-created-pending orders; extended (not duplicated) to also
  stamp `deliveredAt`.
- **`src/server/commerce/counter-sale.ts`** — confirmed a Counter sale is
  created already `DELIVERED`+`PAID` (Phase 3.2), never transitioning
  through `update-order-status.ts` for that initial state — so
  `deliveredAt` needed its own stamp at creation time there too (see
  below), not just in the transition function.
- **`Customer`/`CustomerSession`** (Phase 3.1/3.4) — confirmed the exact
  IDOR-safe pattern (`WHERE { orderNumber, customerId }` in one query,
  `customerId` never accepted from client input) this phase's
  `createReturnRequest`/`getReturnableItemsForOrder` reuse verbatim.
- **Customer Portal** (Phase 3.4) — confirmed `getCustomerSession()` is
  the one place a `customerId` should ever be resolved from for a future
  customer-facing return action; this phase's functions accept an
  already-resolved `customerId` and perform no authorization of their own
  (see "Customer authorization").
- **Admin Orders** (Phase 3) — confirmed `getAdminSession()` is the
  parallel authorization primitive a future admin/walk-in caller would
  use; not touched by this phase.

## Return is item-level, not order-level

A `ReturnRequest` always belongs to one `Order`, but every actual line of
"what's being returned" lives on `ReturnRequestItem`, each pointing at
one specific `OrderItem` with its own requested quantity. Returning "1 of
2 shirts" from an order that also has a pant and a belt creates a request
with exactly one `ReturnRequestItem` (quantity 1, pointing at the shirt's
`OrderItem`) — the pant and belt are untouched, and the second shirt
remains fully owned. Proven directly by tests that create a multi-line
order and return only one item.

## Quantity-level returns

`OrderItem.quantity` (purchased) and the new `OrderItem.returnClaimedQuantity`
(currently claimed by an active-or-fulfilled return/exchange) together
define "how much is left to return" — `quantity - returnClaimedQuantity`.
Buying 5 socks and returning 2 leaves exactly 3 owned; a later attempt to
return more than the remaining 3 is rejected. Tested directly for the
brief's own example numbers.

## Return + Exchange — one shared engine

`ReturnRequestType` (`RETURN` | `EXCHANGE`) lives once, on `ReturnRequest`
— both flows go through the exact same `createReturnRequest` function,
the exact same eligibility check, the exact same quantity-claiming logic,
and the exact same status lifecycle. Nothing about item-level or
quantity-level handling differs by type; the only place `type` is even
read is display/reporting. No second, parallel "exchange engine" was
built — see `ReturnRequestItem`'s own schema doc comment for why `type`
is deliberately **not** duplicated at the item level: a single request
is always wholly a return or wholly an exchange (matching the brief's own
framing — "every request should represent one of RETURN or EXCHANGE"),
so per-item type would only matter for a mixed-type request nothing here
asks for.

## Return Request model

```prisma
model ReturnRequest {
  id         String @id @default(cuid())
  orderId    String
  customerId String
  type       ReturnRequestType
  status     ReturnRequestStatus @default(REQUESTED)
  note       String?
  order      Order    @relation(...)
  customer   Customer @relation(...)
  items      ReturnRequestItem[]
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt
}
```

Deliberately does **not** duplicate any Order-level commerce fact
(subtotal, fulfillment type, delivery address, etc.) — the `order`
relation is always available for that; a `ReturnRequest` is a request
*about* an order, not a copy of one. `customerId` is **required**
(unlike `Order.customerId`, nullable for guest Counter sales) — see
"Counter purchases" below for why this alone excludes guest purchases by
construction.

## Return Request Item model

```prisma
model ReturnRequestItem {
  id              String @id @default(cuid())
  returnRequestId String
  orderItemId     String
  quantity        Int
  reason          ReturnReason
  returnRequest   ReturnRequest @relation(...)
  orderItem       OrderItem     @relation(...)
  createdAt       DateTime @default(now())
}
```

No product name/size/SKU/price copied here at all — `orderItem` already
has every one of those as an immutable, order-time snapshot (Phase 1).
Copying them again would be exactly the "redundant commerce information"
the brief explicitly warned against; reading through the relation is one
join, not a second source of truth to keep in sync. No `status` field
either — see "Status lifecycle" below for why an item's claimed/released
state is entirely a function of its parent request's status, never
tracked twice.

## Eligibility

`getItemReturnEligibility`/`getOrderReturnEligibility`
(`src/lib/return-eligibility.ts`) are pure, DB-free functions — the
engine's answer to "is this item currently returnable?" without any UI
logic needing to know the rule itself. A read-only query,
`getReturnableItemsForOrder`
(`src/server/queries/customer-portal/returns.ts`), composes this with a
real (IDOR-scoped) database lookup so a future customer-portal screen
(Part 2) can render eligibility for every item on an order without
attempting a mutation just to check it — directly satisfying the
brief's explicit "must be able to answer... without requiring UI logic."

## Initial eligibility rules

All three, server-side, never trusting the browser:

1. **Delivered order** — `Order.deliveredAt` must be non-null. Using a
   dedicated timestamp (not `Order.status === "DELIVERED"` alone, and
   definitely not `updatedAt`) is itself a deliberate architecture
   decision — see "Order snapshots" below.
2. **Within the return window** — `now <= deliveredAt + 7 days`, using
   only server timestamps (`new Date()` on the server; never a
   client-supplied "now").
3. **Quantity still available** — `requestedQuantity <= purchasedQuantity
   - returnClaimedQuantity`. This single check also covers "item not
   already fully returned" (the brief's fourth bullet) — a fully-returned
   item simply has `returnClaimedQuantity === quantity`, leaving 0
   returnable, which is the same "insufficient quantity" case as any
   partial over-request.

## Return window

`RETURN_WINDOW_DAYS = 7`, centralized in `src/lib/return-lifecycle.ts` —
imported everywhere it's needed (`return-eligibility.ts`,
`server/commerce/returns.ts`'s own error message), never a second literal
`7` anywhere else. Tested at the exact boundary the brief specified: day
6 after delivery → allowed; **exactly** day 7 → allowed (inclusive); day
8 → rejected; one millisecond past the exact 7-day mark → rejected (the
precise boundary, not an off-by-one approximation). All using real
`Date` arithmetic against a fixed `deliveredAt`, never a real wait.

## Partial returns

Proven with the brief's own example shape: bought 4, return 1, return 1
again, return 2 — after which `returnClaimedQuantity` is exactly 4 (the
full purchased quantity) and a further return attempt is rejected with
`INSUFFICIENT_QUANTITY` and `returnableQuantity: 0`. Each of the three
partial requests is its own independent `ReturnRequest` row — nothing
about partial-return support required a single request to "grow" across
multiple submissions.

## Double return / over-return prevention

Two layers, deliberately:

1. **Business-rule check** (`getItemReturnEligibility`, before any
   write): computes the exact remaining quantity and rejects a request
   exceeding it, with a clear, specific error
   (`INSUFFICIENT_QUANTITY` + the real `returnableQuantity`).
2. **Concurrency-safe write guard** (see "Concurrency" below): the actual
   claim is a guarded `updateMany`, so even if two requests both pass
   layer 1's check (a genuine race), only one can actually succeed in
   the database.

Returning the exact same purchased quantity twice, and a request whose
quantity outright exceeds what was ever purchased, are both tested
directly and both rejected.

## Return reasons

`ReturnReason` enum (`WRONG_SIZE`, `DEFECTIVE`, `DAMAGED`,
`WRONG_PRODUCT`, `QUALITY_ISSUE`, `CHANGED_MIND`, `OTHER`) — exactly the
brief's own list, no invented additions. Labels centralized in
`RETURN_REASON_LABEL` (`src/lib/return-lifecycle.ts`), one `Record` to
translate for a future localization pass — no page or query is allowed to
hard-code a reason string inline.

## Exchange foundation

`type: "EXCHANGE"` is fully supported by `createReturnRequest` today —
proven by a dedicated test creating a real `EXCHANGE` request through the
identical path a `RETURN` uses. Nothing in this phase's domain model
*assumes* every completed request ends in inventory restoration; Part 1
deliberately builds **no** inventory-touching code at all for either
type (see "Inventory" below), so there is nothing to un-assume later.
When Phase 3.5 Part 5 adds the real exchange workflow ("receive old item,
issue replacement"), it will extend the same `ReturnRequest` row (moving
it through `RECEIVED` → `COMPLETED`, plus whatever replacement-item logic
Part 5 introduces) rather than needing a second request type or a parallel
table.

## Status lifecycle

```text
REQUESTED  -> APPROVED | REJECTED | CANCELLED
APPROVED   -> RECEIVED | CANCELLED
RECEIVED   -> COMPLETED
REJECTED, COMPLETED, CANCELLED: terminal
```

Exactly the brief's own suggested six states — audited and not expanded.
`src/lib/return-lifecycle.ts` defines this as a plain transition table
plus `isValidReturnStatusTransition`/`nextValidReturnStatuses`/
`isTerminalReturnStatus`, mirroring `order-lifecycle.ts`'s own shape
call-for-call. **Nothing in Part 1 calls these from a mutating
endpoint** — `createReturnRequest` only ever produces a fresh
`REQUESTED` row; the actual approve/reject/receive/complete mutations are
Part 3's job. This is deliberate, not an oversight: `order-lifecycle.ts`
itself was built the same way in Phase 2, with its own doc comment
stating plainly that no mutating endpoint called it yet — Phase 3's admin
UI was the later, separate piece of work that did. Same shape, same
reasoning, one phase later in this feature's own timeline.

`doesReturnStatusClaimQuantity(status)` is the single source of truth for
which statuses still "hold" a claimed quantity (`REQUESTED`, `APPROVED`,
`RECEIVED`, `COMPLETED` — all true) versus which release it (`REJECTED`,
`CANCELLED` — false). This function is what a future reject/cancel
mutation (Part 3) will need to consult before decrementing
`returnClaimedQuantity` back — already written, already tested, ready for
that day.

## Inventory (deliberately untouched)

Part 1 writes **zero** inventory-affecting code — `ProductVariant.stockQuantity`
is never read or written anywhere in this phase's new files. The
`returnClaimedQuantity` counter this phase introduces lives entirely on
`OrderItem` (a record of *purchase* quantity claimed for return), and is
completely independent of stock levels. Reconciling actual physical stock
once an item is genuinely `RECEIVED` back is explicitly deferred to a
later part — the brief's own instruction ("inventory reconciliation
belongs later; the domain model should simply make it possible") is
satisfied by the status lifecycle existing (a future mutation can safely
hook stock restoration onto the `RECEIVED`/`COMPLETED` transition) without
this phase building that hook itself.

## Payment (deliberately untouched)

No refund, store-credit, wallet, UPI-refund, or cash-refund logic exists
anywhere in this phase — `PaymentStatus`/`PaymentMethod` are not read or
written by any new file here. `ReturnRequest` has no payment-related
field at all; that's explicitly a later phase's foundation to add.

## Customer authorization

`createReturnRequest`/`getReturnableItemsForOrder` both accept a
**caller-resolved** `customerId` — neither performs authorization itself,
by design (documented explicitly in both functions' own doc comments).
Both scope their order lookup to `WHERE { orderNumber, customerId }` in
one query — the exact same shape as Phase 3.4's
`getOrderForAuthenticatedCustomer` — so an order that exists but belongs
to a different customer is indistinguishable from a nonexistent one
(`ORDER_NOT_FOUND` either way). A future customer-portal caller (Part 2)
resolves `customerId` from `getCustomerSession()`, exactly as Phase 3.4's
own portal pages already do; nothing new was invented for this. Proven
directly: a test creates two real customers, gives Customer B a real
order, and confirms Customer A's attempt against that exact order number
returns `ORDER_NOT_FOUND` — not a different, more revealing error.

## Admin authorization

Not implemented in this phase (explicitly out of scope — Part 3 owns the
admin UI). The domain functions' `customerId`-only, no-built-in-auth
design (see above) already accommodates a future admin/walk-in caller:
such a caller would resolve `getAdminSession()` for its own authorization
(unchanged, untouched by this phase), then look up the relevant
`Customer` explicitly (e.g. by phone) before calling the same
`createReturnRequest` with that customer's real id — no redesign needed
when that day comes.

## Counter purchases

A **customer-linked** Counter purchase (the cashier selected/created a
real `Customer` at time of sale — Phase 3.2/3.3) is returnable through
this engine exactly like an online purchase — proven directly by a test
creating a `COUNTER`-source, `COUNTER_HANDOVER`-fulfillment order with a
real `customerId` and successfully returning an item from it. A **guest**
Counter sale (`customerId: null`) can **never** produce a `ReturnRequest`
— not via a special exclusion check, but because `ReturnRequest.customerId`
is required and the order lookup's `WHERE { orderNumber, customerId }`
can never match a `null` column value against any real customer's id.
Proven directly: the identical guest-order setup, attempted by a real
customer who did *not* make that purchase, returns `ORDER_NOT_FOUND` —
the same structural guarantee Phase 3.4 Part 2 already established for
guest-order visibility in the customer portal, now reused for returns
too.

## Walk-in returns (foundation only)

Not built in this phase (Part 4's job). The domain model already
supports "admin initiates a return against an existing purchase" in
principle — `createReturnRequest`'s `customerId` parameter doesn't care
*how* the caller resolved it, only that the caller is responsible for
having done so correctly (see "Customer authorization"/"Admin
authorization" above). No workflow, no walk-in-specific code, and no
schema accommodation for a *guest* walk-in return (which would need its
own additive decision, likely a nullable `customerId` — deliberately not
added speculatively now, see "Architecture debt") were built.

## Order snapshots

Returns reference the historical, immutable `OrderItem` — never current
`Product`/`ProductVariant` values. `getItemReturnEligibility` takes
`purchasedQuantity`/`claimedQuantity` as plain numbers already read from
`OrderItem`, never re-deriving them from a live product lookup. A
product's price changing, being renamed, or being deactivated after the
order was placed cannot affect return eligibility or history in any way
— nothing in this phase's code path ever touches the `Product`/
`ProductVariant` tables at all (confirmed by grep: neither `returns.ts`
nor `return-eligibility.ts` imports or queries them).

The one genuinely new "snapshot-adjacent" decision this phase made:
**`Order.deliveredAt` is its own field, not derived from `updatedAt`**.
`updatedAt` reflects the row's last write for *any* reason (e.g. a later
payment-status change) — using it for the return window would silently
and incorrectly extend or shift a customer's return deadline based on
unrelated admin activity. `deliveredAt` is stamped exactly once, exactly
when the order's status genuinely transitions to (or is created as)
`DELIVERED`, and never touched again.

## Security

- Return eligibility is 100% server-authoritative — `getItemReturnEligibility`/
  `getOrderReturnEligibility` take only already-resolved server values
  (`deliveredAt`, `purchasedQuantity`, `claimedQuantity`, a server-generated
  `now`); there is no boolean or flag anywhere in either function's
  signature that a browser could supply to influence the answer.
- `createReturnRequest` re-validates eligibility itself from the database
  on every call — it never trusts a previously-computed eligibility
  result passed back in from a caller (there is no such parameter in its
  signature at all).
- IDOR resistance: see "Customer authorization" above — proven with a
  real two-customer test, not just argued.

## Concurrency

Reuses the *exact* pattern already proven for inventory
(`resolveAndDecrementOrderLines`): an upfront check (read current state,
reject clearly if already insufficient) followed by a **guarded**
`updateMany` — `WHERE { id: orderItemId, returnClaimedQuantity: { lte:
purchasedQuantity - requestedQuantity } }` — inside the same transaction
that creates the `ReturnRequest`/`ReturnRequestItem` rows. If a
concurrent request already claimed the remaining quantity between the
upfront check and this transaction, the guarded update's affected-row
count is `0`, and the whole transaction throws and rolls back cleanly
(`CONFLICT`, "please refresh and try again") — never a silent over-claim.
Proven directly with two real, truly concurrent (`Promise.all`, not
sequential) requests for the last remaining unit of a single-quantity
item: exactly one succeeds. A second concurrency test proves the same
for a partial-overlap case (two requests for 2 units each against 3
available — only one can fit).

All-or-nothing request semantics (see "Double return prevention") mean a
single multi-item request either fully commits or fully rolls back —
proven by a test where one of two lines in the same request is
over-quantity: the entire request fails, and the *other*, otherwise-valid
line's `returnClaimedQuantity` is confirmed unchanged (0), not partially
applied.

## Tests

**454 tests passing** (408 from Phases 1–3.4 + 46 new for this phase):

- `src/lib/__tests__/return-lifecycle.test.ts` (new, 8 tests, pure logic):
  every valid/invalid status transition from the brief's six-state
  lifecycle; terminal-status detection; `doesReturnStatusClaimQuantity`
  for all six statuses; every `ReturnRequestStatus`/`ReturnReason` value
  has a centralized label.
- `src/lib/__tests__/return-eligibility.test.ts` (new, 15 tests, pure
  logic): delivered-only rejection; the exact 7-day boundary (day 6/7/8,
  plus one millisecond past the exact boundary); partial-quantity math
  (remaining quantity, exceeding it, fully claimed, returning exactly the
  remainder); the order-level convenience wrapper's own three cases.
- `src/server/commerce/__tests__/returns.test.ts` (new, 19 tests, real
  Postgres): delivered-only and 7-day-window rejection against a real
  order; partial returns across three sequential requests tracking
  quantity correctly to exactly zero remaining; a 5-purchased/2-returned/
  3-remaining scenario; over-purchased-quantity rejection; same-quantity
  double-return rejection; all-or-nothing rejection of a multi-line
  request with one bad line (and confirmation the good line's claim never
  applied); a real `EXCHANGE` request created through the same engine;
  every new request starts `REQUESTED`; cross-customer IDOR rejection
  (real two-customer test); nonexistent-order-number rejection with an
  identical error shape; customer-linked Counter-purchase return success;
  guest-Counter-purchase exclusion (real second-customer attempt);
  two concurrency tests (last-unit race, partial-overlap race); input
  validation (empty request, zero/negative quantity, an orderItemId from
  a different order).
- `src/server/queries/customer-portal/__tests__/returns.test.ts` (new, 4
  tests, real Postgres): IDOR-safe `null` for another customer's order;
  correct returnable-quantity math; every item ineligible pre-delivery;
  every item ineligible once fully claimed.

No pre-existing test was modified — Phase 3.5 Part 1 is purely additive
on top of the untouched Phase 1–3.4 codebase (the only non-additive
change, `update-order-status.ts`'s `deliveredAt` stamp, was verified by
the full pre-existing order-lifecycle/status-transition test suite
passing unmodified).

## Regression

Typecheck, lint, production build, and a full fresh-database run (all 10
migrations — including this phase's new
`20260808140000_phase3_5_part1_returns_foundation`, verified via an empty
`prisma migrate diff` against the live dev schema — plus seed, admin
bootstrap, full 454-test suite) all pass. The shared dev database's real
order count was confirmed unchanged (8) before and after this entire
phase's verification.

## Architecture decisions worth calling out explicitly

- **`deliveredAt` as its own column, not derived** — see "Order
  snapshots" above.
- **`returnClaimedQuantity` as a maintained counter, not a live
  aggregate** — chosen specifically to reuse the codebase's proven
  guarded-`updateMany` concurrency pattern rather than needing a
  higher transaction isolation level or raw-SQL row locking.
- **No `status` or `type` field on `ReturnRequestItem`** — both are
  single-source-of-truth decisions (status from the parent request,
  type likewise) to avoid two places that could drift out of sync; see
  each field's own schema doc comment for the full reasoning.
- **`ReturnRequest.customerId` required, not nullable** — matches this
  phase's actual scope (customer-linked returns only); a future guest/
  walk-in path (Part 4) would need its own additive decision, not a
  speculative nullable column added now on the chance it's needed later.
- **Lifecycle validators written now, called by no mutating endpoint
  yet** — deliberate continuity with how `order-lifecycle.ts` itself was
  built in this codebase's own history (Phase 2), not a Part-1-specific
  invention.

## Known limitations

None of these are failures of this phase — all are explicitly later
parts' scope:

- No customer-facing return UI, return button, or return history view —
  Phase 3.5 Part 2.
- No admin return management screen — Phase 3.5 Part 3.
- No walk-in return workflow — Phase 3.5 Part 4.
- No real exchange workflow (receiving the old item, issuing a specific
  replacement) — Phase 3.5 Part 5. `type: "EXCHANGE"` requests can be
  *created* today; nothing processes them further yet.
- No inventory reconciliation when an item is actually received back.
- No refund/store-credit/wallet processing of any kind.
- No WhatsApp notifications for return status changes.
- No admin-side mutating status-transition function yet (only the pure
  validation rules exist) — intentionally deferred to Part 3.

## Architecture debt

Evaluated honestly, nothing hidden:

- **Guest/walk-in return support**: `ReturnRequest.customerId` being
  required means a guest Counter sale can never be returned through this
  exact engine as it stands today. Phase 3.5 Part 4 will need to decide
  whether walk-in returns for guest purchases go through a modified
  version of this engine (e.g. a nullable `customerId`, additive
  migration) or a separate, simpler path — a real, deferred design
  question, not resolved here.
- **No admin-side status-mutation function**: the lifecycle *rules*
  exist and are tested; the actual `updateReturnRequestStatus`-style
  mutating function (mirroring `update-order-status.ts`) does not exist
  yet. This is explicitly Part 3's work, flagged here so it isn't
  mistaken for an oversight.
- **No inventory-restoration hook**: when a future part marks a
  `ReturnRequestItem`'s parent request `RECEIVED`/`COMPLETED`, something
  will need to restore `ProductVariant.stockQuantity` — the exact
  guarded-`updateMany` pattern already proven for both checkout
  (`resolveAndDecrementOrderLines`) and order cancellation
  (`update-order-status.ts`) is the obvious template, but no code for it
  exists yet.
- **`returnClaimedQuantity` currently only ever increases** within this
  phase's own shipped code (no reject/cancel mutation exists to decrement
  it) — the schema, the read-side eligibility query, and
  `doesReturnStatusClaimQuantity` are all already correctly designed for
  a future decrement to slot in without any rework, but until Part 3
  ships that mutation, a `REQUESTED` return that a customer or admin
  would conceptually want to "undo" has no code path to actually release
  its claim. Documented honestly rather than worked around.

## Out of scope (confirmed untouched)

Customer Return UI, return button, return history, Admin Returns page,
inventory reconciliation, refunds, exchange workflow, WhatsApp
notifications, analytics — none were implemented, per the brief's
explicit list.

## Final Phase 3.5 Part 1 verdict

> The Klasiq commerce engine has a robust, future-proof Return/Exchange
> domain capable of representing item-level and quantity-level returns,
> enforcing server-side eligibility, supporting both Online and
> Customer-linked Counter purchases, preventing invalid or duplicate
> returns, and providing a secure foundation for customer and admin
> workflows — without yet implementing the UI.

Demonstrated true, with evidence cited above: item-level and
quantity-level returns work exactly as specified (tested); eligibility
(delivered-only, 7-day window, remaining quantity) is 100%
server-authoritative (tested at the exact day boundary); both Online and
customer-linked Counter purchases are returnable, guest Counter purchases
are structurally excluded (tested); invalid/duplicate/over-quantity
returns are rejected, including under real concurrent load (tested); the
foundation for customer authorization (caller-resolved `customerId`,
IDOR-safe queries) and future admin authorization (unopinionated
`customerId` parameter) is in place without any UI being built. Full test
suite passes (454/454); fresh-database verification passes (10
migrations); production build passes; documentation is complete.

Changes across Phase 3.1, Phase 3.2 (all parts), Phase 3.3 (all parts),
Phase 3.4 (all parts), and this phase (3.5 Part 1) are left uncommitted
together in the working tree, per instruction. Phase 3.5 Part 2 has not
been started — awaiting review.

## Part 2 — Customer Return Portal

Date: 2026-08-08

Builds the customer-facing Return & Exchange flow on top of Part 1's
domain engine (`createReturnRequest`, `getReturnableItemsForOrder`,
`return-eligibility.ts`, `return-lifecycle.ts`) and Phase 3.4's Customer
Portal (OTP session, `/track/orders/[orderNumber]`). No new domain rules
were introduced — every eligibility/quantity/authorization decision in
this part is a UI layer over Part 1's already-tested engine. Out of
scope, confirmed untouched: Admin Returns UI, approve/reject workflow,
inventory restoration, exchange inventory, refunds, WhatsApp
notifications, analytics.

### Existing implementation audited (before writing any code)

- **`src/app/(site)/track/(protected)/orders/[orderNumber]/page.tsx`**
  (Phase 3.4 Part 2) — the order-detail page this part extends. Untouched
  by Part 1. Confirmed its existing sections (header, tracking timeline,
  items, fulfillment, payment) so the new per-item return info and
  history section could be inserted without disrupting them.
- **`getOrderForAuthenticatedCustomer`**
  (`src/server/queries/customer-portal/orders.ts`) — confirmed the exact
  IDOR-safe shape (`{ orderNumber, customerId }` in one query,
  `null`-for-not-found-or-not-owned) that every new query/action in this
  part reuses identically.
- **`getCustomerSession`** (`src/lib/customer-portal/session.ts`) —
  confirmed this is the one and only authorization primitive; the new
  Server Action resolves it first and rejects before touching any input,
  exactly like `requestOtpAction`/`verifyOtpAction` (Phase 3.4 Part 1).
- **Part 1's `ReturnRequestItem` schema** (`prisma/schema.prisma`) —
  confirmed it has no `type`/`status` field of its own (both live only on
  the parent `ReturnRequest`) — this shapes the form design decision
  below.
- **`src/components/ui/select.tsx`** — confirmed via
  `grep -rl "from \"@/components/ui/select\""` that it is unused anywhere
  in the codebase. Decided against it for the per-item reason picker (see
  "Native `<select>` vs. custom Select" below).

### New: `ReturnRequest.returnNumber`

Section 12 requires showing a "Return Request ID" on the success screen
and in history. Exposing `ReturnRequest.id` (a raw cuid) would break the
codebase's established "identifier, not database key" convention
(`Order.orderNumber`, `Customer.customerId`). Added
`ReturnRequest.returnNumber String @unique` (format `RET-YYYYMMDD-XXXXX`,
via `src/lib/return-number.ts`, mirroring `src/lib/order-number.ts`
exactly), generated with a retry-on-collision loop inside
`createReturnRequest`'s existing transaction (mirroring
`createOrderWithUniqueNumber`'s shape; not extracted to a shared generic
helper since there is still only one call site). Migration
`20260808150000_phase3_5_part2_return_number` is a pure additive
`ALTER TABLE ... ADD COLUMN ... NOT NULL` + unique index, safe directly
(no default needed) because `return_requests` had zero rows in the real
dev database at the time (confirmed via direct query before writing the
migration) — Part 1 shipped no UI capable of creating a real row.

### One type per request — Part 1's design preserved (section 7)

Part 1's `ReturnRequest.type` lives only at the request level;
`ReturnRequestItem` has no `type` of its own. The brief explicitly allows
mixed per-item types "only if your Part 1 model already supports [it]
cleanly," and instructs preserving a single-request-type design
otherwise. It does not. `ReturnRequestForm` therefore renders **one**
Return/Exchange toggle for the whole submission (a `role="tablist"` pair
of buttons), applying to every item selected below it — never a
per-item type control. This is a deliberate preservation of Part 1's
schema decision, not an oversight.

### Server Action — `createReturnRequestAction`

`src/server/actions/customer-portal/returns.ts`. Resolves
`getCustomerSession()` first; returns `UNAUTHORIZED` immediately if
there is no session or no linked Customer — the request body is never
even parsed in that case. Validates the body against
`createReturnRequestSchema`
(`src/lib/validation/return-request.ts`, mirroring Part 1's
`ReturnReason` enum with no duplicated string list) and returns
`VALIDATION` on failure. Only then calls `createReturnRequest({
customerId: session.customer.id, ... })` — `customerId` always comes
from the verified session, never from `input`, so a tampered request
body has no field that could smuggle a different customer's id in at
all (there is no such field in the schema to tamper with). Tested
directly in
`src/server/actions/customer-portal/__tests__/returns.test.ts`.

### Queries

- **`getReturnableItemsForOrder`** — Part 1's function, unchanged. Used
  by both the order-detail page (compact per-item info) and the new
  `/return` page (full form data).
- **`getReturnRequestsForOrder`** (new,
  `src/server/queries/customer-portal/returns.ts`) — every
  `ReturnRequest` for an order, newest first, with each affected
  `OrderItem`'s product/size snapshot included so the history UI never
  needs a second lookup. Same IDOR-safe `{ orderNumber, customerId }`
  scoping as every other query in this portal. Tested for IDOR-safety,
  the empty case, and newest-first ordering with correct item snapshots.

### Order Detail page — extended, not cluttered

`src/app/(site)/track/(protected)/orders/[orderNumber]/page.tsx` now
also calls `getReturnableItemsForOrder` and `getReturnRequestsForOrder`
alongside the existing `getOrderForAuthenticatedCustomer` call. Per
item, "N claimed · N remaining" (or "Fully claimed") is shown **only**
when `claimedQuantity > 0` — an item nobody has ever tried to return
shows nothing extra, per the brief's explicit "do not clutter"
instruction. Below the items list, either:

- a single "Return or Exchange an Item" link to `/return`, when at least
  one item is eligible, or
- a specific, honest explanation (`returnUnavailableReason`) — "not
  delivered yet," "return window has passed," or "every item already
  fully claimed" — computed from `getOrderReturnEligibility` and the
  per-item `eligible` flags. Section 18 explicitly requires explaining
  *why*, never silently hiding the section; this is the exact
  implementation of that.

The Return History section (`ReturnHistory` component,
`src/components/customer-portal/return-history.tsx`) renders only when
`getReturnRequestsForOrder` returns at least one row — an order with no
return activity shows no new section at all. Each entry shows the
`returnNumber`, type (Return/Exchange, visually distinguished by label),
a status badge (reusing `RETURN_REQUEST_STATUS_LABEL`, with its own
`STATUS_BADGE_CLASS` map mirroring `ORDER_STATUS_BADGE_CLASS`'s
established pattern), creation date, and every affected item's
product/size/quantity/reason. Rejected/cancelled requests display their
real persisted status as-is — nothing is fabricated or inferred; no
rejection-reason UI exists because Part 1 never persists one to show.

### Return/Exchange form

New route `src/app/(site)/track/(protected)/orders/[orderNumber]/return/page.tsx`
— a Server Component with the same IDOR-safe `notFound()` shape as the
order-detail page (missing session → early return; no linked Customer or
order not found/not owned → `notFound()`). Computes the same
order-level ineligibility explanation as the detail page and passes it,
plus the full `getReturnableItemsForOrder` result, to
`ReturnRequestForm` (`src/components/customer-portal/return-request-form.tsx`,
client component).

Flow, matching section 15's "do not ask unnecessary questions": Type
toggle → item checklist → (per selected item) quantity stepper + reason
select → optional note (shown only when any selected item's reason is
"Other") → submit. Every purchased item is listed, including ineligible
ones — shown disabled with an inline explanation ("Already fully
requested for return/exchange" or "Not eligible for return") rather than
hidden, consistent with section 18. Quantity stepper buttons are
disabled at 1 (lower bound) and at the item's own `returnableQuantity`
(upper bound) — the client cannot express a request the server would
reject for quantity reasons, though `createReturnRequest` still
re-validates authoritatively regardless. On submit, a client-side state
transition (not a redirect) shows the returned `returnNumber`, the
request type, "Submitted Successfully," "Current status: Requested,"
and explanatory text that Klasiq will review the request — deliberately
never claiming or implying approval, per section 12.

**Native `<select>` vs. custom Select component**: the per-item reason
picker uses a plain native `<select>`, not the unused
`src/components/ui/select.tsx` Base UI component. A native select gives
the OS's own picker UI (more mobile-friendly than a custom dropdown),
built-in keyboard/screen-reader semantics, and avoids portal/z-index
concerns when repeated once per row in a list of items — a real
consideration the custom component's only extra features (Base UI
positioning) don't help with here.

### Mobile UX & accessibility

12px+ tap targets throughout (`size-9` quantity buttons, `h-11`/`h-12`
links and submit button); the type toggle uses `role="tablist"`/`role=
"tab"`/`aria-selected` with an `aria-describedby` hint; quantity changes
announce via `aria-live="polite"`; increment/decrement buttons carry
per-item `aria-label`s (`Increase quantity for {productName}`) since
visually they're identical `+`/`-` icons repeated per row; the item
checkbox's label wraps the full item description so the entire row is
one tappable/clickable target; form errors render in a `role="alert"`
region. No horizontal scrolling — the form is a single-column
`flex-col` layout throughout, unchanged at all viewport widths (mobile
was the only target explicitly named).

### Counter purchases & guest exclusion

No new code was needed here — `getReturnableItemsForOrder`,
`getReturnRequestsForOrder`, and `createReturnRequest` all scope by
`{ orderNumber, customerId }`, identically for `ONLINE` and
`COUNTER` orders. A customer-linked Counter purchase (cashier selected/
created the Customer at sale time, Phase 3.2) is returnable through this
exact same portal flow; a guest Counter sale (`customerId: null`) can
never match any customer's session and so never appears in `/track/
orders` at all (Phase 3.4 Part 2), let alone in the return flow. Both
directions were already covered by Part 1's `returns.test.ts`
("Counter purchase support and guest exclusion" describe block); no
duplicate coverage was added here.

### Security review

- **Authorization**: `createReturnRequestAction` resolves `customerId`
  from the verified session only; the validation schema has no
  `customerId`/`customerName` field a client could populate even if it
  tried. Verified directly: a session for Customer A submitting against
  Customer B's real `orderNumber` gets `ORDER_NOT_FOUND` (test:
  "never trusts a customerId supplied in input").
- **IDOR**: every new query/page uses the same `{ orderNumber,
  customerId }`-in-one-query pattern as Phase 3.4 Part 2 — a
  not-owned order is structurally indistinguishable from a nonexistent
  one, both at the query layer (tests) and the page layer (`notFound()`
  for both).
- **Request IDs are not authorization**: knowing a `returnNumber` (or the
  underlying `id`) grants nothing — every read is still scoped through
  the owning order's `{ orderNumber, customerId }`, never looked up by
  the return request's own id alone from a customer-facing path.
- **Server re-validates, never trusts the client's computed state**: the
  form's disabled checkboxes/quantity bounds are UX only;
  `createReturnRequest`'s existing all-or-nothing validation and guarded
  `updateMany` claim (Part 1) are the actual authority, exercised
  end-to-end again in this part's manual verification script (see
  below).

### Tests

New/extended, alongside Part 1's untouched 19 `returns.test.ts` cases:

- `src/server/queries/customer-portal/__tests__/returns.test.ts` — added
  a `getReturnRequestsForOrder` describe block: IDOR-safety (null for a
  different customer's order), empty-array case, and newest-first
  ordering with correct per-item product/size snapshots across a RETURN
  then an EXCHANGE request on the same order.
- `src/server/actions/customer-portal/__tests__/returns.test.ts` (new) —
  `createReturnRequestAction`: `UNAUTHORIZED` with no session; a real
  session for Customer A against Customer B's order still resolves
  `ORDER_NOT_FOUND` (proving there's no way to smuggle a different
  customer in); malformed input rejected as `VALIDATION` before the
  domain layer is ever called; a full success path creating a real
  `ReturnRequest` and asserting the returned `returnNumber` matches the
  `RET-YYYYMMDD-XXXXX` format. Uses the same real in-memory cookie-store
  mock as `session.test.ts` (Phase 3.4 Part 1) — this exercises the real
  `getCustomerSession`/`createCustomerSession` code, not a stubbed
  session object.
- Section 22's remaining cases (eligible/expired/undelivered order,
  partial/full/over quantity, duplicate prevention, exchange creation,
  counter-linked purchase, guest exclusion) were already exercised by
  Part 1's `createReturnRequest` test suite and are not duplicated here,
  per the codebase's established "don't duplicate coverage" philosophy —
  this part's own tests focus on what's new: the action's authorization
  boundary and the history query.

Full suite: **461/461 passing** (454 from Part 1 + 7 new). One
pre-existing, unrelated statistical flake in
`src/lib/__tests__/order-number.test.ts` (a random-collision sanity
check untouched by this phase) was observed once during a fresh-database
run and confirmed non-reproducible across three immediate reruns — not a
regression from this part's changes.

### Regression & verification

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 461/461 passing.
- `npm run build` — succeeds; the new `/track/orders/[orderNumber]/return`
  route appears in the route manifest alongside all prior routes.
- Fresh-database verification: created `shop_fresh_verify_p352`, applied
  all 11 migrations via `prisma migrate deploy` (confirmed zero drift via
  `prisma migrate diff`), ran `prisma/seed.ts` and `prisma/create-admin.ts`
  successfully, ran the full test suite against it (same result modulo
  the one already-disclosed flake), then dropped the database. The real
  shared dev database's `orders` count (8) and `return_requests` count
  (0) were confirmed unchanged before and after.
- Manual verification (no browser-automation tool in this environment,
  consistent with every prior phase): a real-Postgres script
  (`tsx` + `NODE_OPTIONS="--conditions=react-server"`) exercised the
  actual query/action-layer functions end to end — eligibility before
  any return, a partial RETURN (qty 2 of 4), an over-quantity rejection
  against the remaining 2, an EXCHANGE for the remaining 2 with a note,
  a further request correctly rejected once fully claimed, return
  history in newest-first order with both requests visible, and a
  cross-customer isolation check (Customer B sees `null` for both
  eligibility and history, and a return attempt against Customer A's
  order resolves `ORDER_NOT_FOUND`). All 9 steps passed; all
  script-created rows were deleted afterward and the shared dev
  database's row counts were confirmed unchanged.
- The long-running dev server was **not** restarted for this part (per
  the standing instruction to only restart when explicitly asked) — its
  in-memory Prisma Client predates this part's `returnNumber` migration,
  so it would currently error on any return-related page render until a
  future explicit restart. Manual verification therefore used direct
  script/query-layer calls rather than the live dev server, exactly as
  in every prior phase's disclosed methodology.

### Known limitations / architecture debt (carried forward and new)

- Everything already disclosed in Part 1 ("Known limitations /
  architecture debt") still applies unchanged — no return/exchange
  status transition beyond initial `REQUESTED` exists yet, no inventory
  reconciliation, no refund processing.
- The dev server's stale Prisma Client (noted above) means this part's
  new UI has not been visually exercised in an actual browser — only
  verified via typecheck, production build compilation, and direct
  script-level calls to the same functions the pages call. A future
  explicit restart is needed before genuine browser-based UX testing of
  the return form.
- `ReturnHistory`'s status badge colors (`STATUS_BADGE_CLASS`) are a new,
  separate `Record` rather than reusing `ORDER_STATUS_BADGE_CLASS`
  directly — the two enums (`OrderStatus`, `ReturnRequestStatus`) don't
  share values, so a shared map isn't meaningful; documented here so a
  future phase doesn't mistake this for accidental duplication.

## Final Phase 3.5 Part 2 verdict

> An authenticated Klasiq customer can securely initiate item-level
> Return or Exchange requests for eligible purchases (including
> customer-linked Counter purchases), select quantities and reasons,
> submit the request through the shared Return engine, and review the
> resulting request history — without being able to affect any other
> customer's purchases.

Demonstrated true, with evidence cited above: the full flow (Track
Orders → OTP → My Orders → Order Detail → eligible order → Return/
Exchange → items → quantity → reason → submit → confirmation) is wired
end to end through the Server Action onto Part 1's engine; eligibility
is computed server-side and explained honestly rather than hidden;
quantity selection is bounded by the server's own `returnableQuantity`
both in the UI and, authoritatively, in `createReturnRequest`; Counter
purchases work identically to Online purchases and guest purchases are
structurally excluded; customer isolation was verified at the query,
action, and manual-script layers. Full test suite passes (461/461,
one pre-existing unrelated flake disclosed); fresh-database verification
passes (11 migrations, zero drift); production build passes;
documentation is complete.

Changes across Phase 3.1, Phase 3.2 (all parts), Phase 3.3 (all parts),
Phase 3.4 (all parts), and Phase 3.5 (Parts 1 and 2) are left
uncommitted together in the working tree, per instruction. Phase 3.5
Part 3 has not been started — awaiting review.

## Part 3 — Admin Return Management

Date: 2026-08-08

Builds the Admin-facing Return/Exchange management module on top of
Part 1's engine (`return-lifecycle.ts`, `return-eligibility.ts`) and
Part 2's customer portal. This is the first part to actually **mutate**
a `ReturnRequest`'s status past its initial `REQUESTED` row — every
transition (Approve/Reject/Receive/Complete/Cancel) is Admin-initiated
through a new dedicated Returns section of the Admin Panel. No
inventory reconciliation, no refund processing, no walk-in workflow —
all confirmed untouched, exactly as scoped.

### Existing implementation audited (before writing any code)

- **`src/lib/admin/session.ts`** — confirmed `getAdminSession()` is the
  one authorization primitive every admin page/action already uses, and
  that it is a **structurally separate** cookie/table/module from
  `getCustomerSession()` (Phase 3.4) — this is what makes section 18's
  "customers cannot modify ReturnRequest status" true by construction,
  not by an extra check (see "Security review" below).
- **`src/server/commerce/update-order-status.ts`** — the exact template
  this phase's `updateReturnRequestStatus` mirrors: idempotent-on-
  same-status, a guarded `updateMany({ where: { id, status:
  <status read> } })` for concurrency safety, no duplicated
  business-rule logic (delegates to the centralized transition table).
- **`src/lib/order-lifecycle.ts`** / **`src/components/admin/order-status-actions.tsx`**
  / **`src/components/admin/order-status-badge.tsx`** — the admin
  order-management UI pattern (next-valid-status buttons, a centralized
  label/color `Record`, `sonner` toasts, `router.refresh()` after a
  Server Action) this phase's Returns UI reuses call-for-call, never
  reinventing a parallel pattern.
- **`src/lib/return-lifecycle.ts`** (Part 1) — confirmed
  `isValidReturnStatusTransition`/`nextValidReturnStatuses` already exist
  and are already tested, but that **nothing calls them from a mutating
  path yet** — exactly Part 1's own stated reason for existing "now, for
  a later part." This part is that later part.
- **`prisma/schema.prisma`'s `ReturnRequest`/`ReturnRequestItem`** —
  confirmed no `status`-history table exists anywhere in this schema
  (mirroring `Order`'s own lack of one) — informs the "flat audit
  fields, not a separate event table" decision below.
- **`src/server/queries/admin/orders.ts`/`customers.ts`** — confirmed the
  existing search/filter conventions (`contains`/`insensitive` for
  partial text, exact match on unique-indexed columns for
  phone/customerId, inclusive `dateFrom`/exclusive-next-day `dateTo`)
  this phase's `getAdminReturnRequests` reuses exactly, never inventing
  a second search convention.
- **`src/server/queries/customer-portal/orders.ts`**
  (`getOrdersForAuthenticatedCustomer`) — confirmed its only input is a
  plain `customerId` with no session/cookie dependency, safe to reuse
  directly from an admin context for "Customer purchase history"
  (section 14) rather than writing a near-identical second query.
- **Counter POS** (`src/server/commerce/counter-sale.ts`) — re-confirmed
  unchanged since Part 1's audit: `deliveredAt`/`customerId` are still
  stamped identically to Part 1's expectations.

### New Admin section — not hidden under Orders

Added **"Returns"** as its own top-level entry in `ADMIN_NAV`
(`src/components/admin/admin-shell.tsx`), positioned next to "Orders"
for discoverability but never nested under it — exactly section 2's
explicit instruction. New routes:
`/admin/returns` (dashboard) and `/admin/returns/[returnNumber]`
(detail), both under the existing `(protected)` route group, so the
same `getAdminSession()`-gated layout (`src/app/admin/(protected)/layout.tsx`)
protects them with zero new gating code.

### Audit fields — a schema decision, explained

Section 23 requires persisting **who** approved/rejected/completed/
cancelled a request, with a timestamp. Added five pairs of nullable
columns directly on `ReturnRequest` — `approvedAt`/`approvedByAdminUserId`,
`rejectedAt`/`rejectedByAdminUserId` (plus `rejectionReason`),
`receivedAt`/`receivedByAdminUserId`, `completedAt`/`completedByAdminUserId`,
`cancelledAt`/`cancelledByAdminUserId` — each a named relation to
`AdminUser` (`onDelete: SetNull`, mirroring `InventoryAdjustment.adminUserId`'s
own precedent for an audit-actor FK that must never block deleting the
admin account itself).

**Why flat fields, not a separate audit-log table**: the six-state
lifecycle (`return-lifecycle.ts`) is strictly one-directional with two
terminal branches — at most one of REJECTED/CANCELLED and at most one
each of APPROVED/RECEIVED/COMPLETED can ever be set on a single row, so
a dedicated `ReturnRequestStatusEvent` table would model a re-entrant
history this lifecycle structurally cannot produce. This mirrors
`Order.deliveredAt`'s own precedent (Phase 3.5 Part 1) exactly: one
dedicated column per real event, never inferred from `updatedAt`, never
fabricated for a step that didn't happen. Documented as a real trade-off
in "Architecture debt" below, not hidden.

Migration `20260808160000_phase3_5_part3_admin_return_management` is
purely additive (12 new nullable columns + `adminNote` + 5 new FK
constraints, all `ON DELETE SET NULL`) — verified via `prisma migrate
diff` showing an empty diff both immediately after applying it and again
on a from-scratch database (see "Regression" below).

### Status transitions — `updateReturnRequestStatus`

One function (`src/server/commerce/admin-returns.ts`), mirroring
`updateOrderStatus`'s exact shape: idempotent (already-`newStatus` is a
no-op success, `alreadyInState: true`, never re-stamping a different
timestamp/admin on a repeat call — proven directly by a test capturing
`approvedAt` across two calls and asserting it's identical), and
concurrency-safe via a guarded `updateMany({ where: { id, status:
<status read at the top of the call> } })` — two admins (or one
double-click) racing to transition the same request can't both
succeed; the loser gets `CONFLICT` ("please refresh"), never a silently
double-applied approval or completion. Proven directly with two real,
truly concurrent (`Promise.all`) approval attempts and, separately, two
concurrent completion attempts — exactly one succeeds in each case,
tested and additionally re-verified in the manual verification script
below.

**REJECTED requires a non-empty `rejectionReason`** — enforced inside
the domain function itself (`MISSING_REJECTION_REASON`), not only at the
validation-schema layer, so a caller can never bypass it by calling the
function directly. The reason is persisted verbatim and is
customer-visible by design (see "Customer portal sync" below) —
never a placeholder, never invented on the customer's behalf.

**No inventory or refund side effect exists on any transition** —
confirmed by grep: `admin-returns.ts` never imports or touches
`ProductVariant`/`stockQuantity`/`PaymentStatus` anywhere. This is
explicitly Part 4's scope; Part 3 only ever writes to `ReturnRequest`'s
own columns.

### Approval, Rejection, Received, Completed — precisely as scoped

- **Approve** (section 9): sets `status: APPROVED` +
  `approvedAt`/`approvedByAdminUserId` only. No inventory change, no
  claim adjustment — `OrderItem.returnClaimedQuantity` (Part 1) is
  entirely untouched by this phase, exactly as instructed ("Klasiq
  accepted the request. Physical item has not yet been received.").
- **Reject** (section 10): requires and persists `rejectionReason`;
  the customer portal (`ReturnHistory`, updated this part) now renders
  it verbatim whenever `status === "REJECTED"` — satisfying "Customer
  portal should later display it," which this part is the "later."
- **Received** (section 11): sets `status: RECEIVED` +
  `receivedAt`/`receivedByAdminUserId` only — no inventory change. "Part
  4 owns reconciliation," confirmed untouched.
- **Completed** (section 12): sets `status: COMPLETED` +
  `completedAt`/`completedByAdminUserId` only — administrative closure,
  no fabricated inventory update.

### Internal Admin notes — visibility rules

`ReturnRequest.adminNote` (new, nullable) is edited via
`updateReturnRequestAdminNoteAction` → `updateReturnRequestAdminNote`
(`src/server/commerce/admin-returns.ts`) — a plain last-write-wins
update, deliberately **not** concurrency-guarded like the status
transitions, since a free-text note has no invariant to protect (unlike
a status, two admins editing the note in quick succession is not a
correctness bug, just normal collaborative editing). Rendered only on
the admin Return detail page (`ReturnAdminNote` component); grepped the
entire customer-portal tree (`src/app/(site)/track`,
`src/components/customer-portal`) to confirm `adminNote` is never
imported or read there — the visibility boundary is enforced by simply
never wiring the field into any customer-facing query or component, the
same "don't build the read path" pattern the codebase already uses
elsewhere (e.g. `deliveryLatitude`/`deliveryLongitude` never reaching
the customer portal, Phase 3.4 Part 2).

### Dashboard, filters, and search

`src/app/admin/(protected)/returns/page.tsx` +
`getAdminReturnRequests` (`src/server/queries/admin/returns.ts`):
newest-first list showing Return Number, Type, Customer, Order Number,
School, Created Date, Status, and item count — every field section 3
asked for. Filters (section 4): status (All + the six lifecycle
states), type (Return/Exchange), school (a real `<select>` populated
from `getAdminSchools()`, reused unchanged from the existing Schools
admin page), and an inclusive date range — all wired through URL search
params exactly like `OrderFilters`
(`src/components/admin/order-filters.tsx`), the established convention.

**"Customer" as a filter (section 4) is deliberately implemented via the
search box, not a second discrete control** — section 5's Search
already covers Customer Name/Customer ID/Phone, so a separate "Customer"
dropdown/input would just be a second UI for the identical effect. A
documented decision, not an oversight.

Search (section 5) is one `OR` across: Return Number (`contains`,
case-insensitive), Order Number (`contains`, case-insensitive,
via the `order` relation), Customer Name (`contains`, case-insensitive),
Customer ID (`contains`, case-insensitive), Phone (both a `contains`
partial match on the as-entered `primaryPhone`, and — when the query
parses as a valid phone — an additional exact match on
`primaryPhoneNormalized`), and School name (`contains`, case-insensitive,
via `order.school`). None of these require an exact match where the
codebase's existing convention (`searchCustomers`,
`src/server/queries/admin/customers.ts`) already documents partial
support — reused, not re-decided.

### Return Detail page

`src/app/admin/(protected)/returns/[returnNumber]/page.tsx` +
`getAdminReturnRequestByNumber`. Shows, per section 6: Customer
(name/ID/phone — **never** the raw `Customer.id`, only via a `select`
that excludes it), Order (linked to `/admin/orders/[orderNumber]` —
section 15's "Order Link", reusing the existing admin order-detail
route unchanged), Order Date, Items Purchased vs. Items Requested vs.
Requested Quantity vs. Reason, Customer Note (`ReturnRequest.note`,
Part 1), Current Status, and a Timeline. The requested `ReturnRequest.id`
itself is likewise never rendered anywhere — only `returnNumber`, the
established "identifier, not database key" convention (Part 2).

**Order Context (section 7)**, per requested item: Purchased Quantity
(`OrderItem.quantity`, the immutable purchase-time snapshot — never
current product data), "Already returned (other requests)" — computed
as `orderItem.returnClaimedQuantity - thisRequestItem.quantity`, i.e.
excluding what THIS request itself claims, so the two figures never
double-count the same units — and Remaining
(`orderItem.quantity - orderItem.returnClaimedQuantity`, identical math
to the customer portal's own `getReturnableItemsForOrder`, Part 1/2).
Nothing here re-derives from `Product`/`ProductVariant` — confirmed by
grep, exactly like every prior return-related module.

### Timeline (section 13) — honest, never fabricated

Rendered from the same flat audit-timestamp fields described above:
"Request Created" (`createdAt`, always present) followed by whichever
of Approved/Rejected/Received/Completed/Cancelled actually have a
non-null timestamp, each showing the acting admin's name. Because the
underlying lifecycle is strictly one-directional with two terminal
branches (see "Audit fields" above), listing them in this fixed logical
order is equivalent to chronological order for every real row this
system can produce — never a case where, say, "Completed" could appear
before "Approved" for the same request. A request with only
`createdAt` set (still `REQUESTED`) shows a one-step timeline — nothing
invented for steps that haven't happened yet.

### Customer History (section 14)

The Return detail page's "Customer history" section shows two lists,
both reusing existing queries per the brief's explicit instruction
rather than writing near-duplicates: **Purchase history** via
`getOrdersForAuthenticatedCustomer` (Phase 3.4 Part 2, reused verbatim —
its only input is a plain `customerId`, no session dependency, so it's
safe to call from an admin context where authorization is
`getAdminSession()` rather than a customer's own session) and **other
Return/Exchange requests** via the new `getReturnRequestsForCustomer`
(this part), both linked (Orders → `/admin/orders/[orderNumber]`,
Returns → `/admin/returns/[returnNumber]`) so an admin can navigate the
customer's full history without leaving the request context, per
section 14's "without leaving the request context where practical."

### Customer portal sync (section 16) — single source of truth, verified

There is no second copy of a `ReturnRequest`'s state anywhere — the
customer portal's `getReturnRequestsForOrder` (Part 2) and the admin's
`getAdminReturnRequestByNumber` both read the exact same `return_requests`
row, live, on every request. An admin's `updateReturnRequestStatus` call
is visible to the customer's very next page load with zero
synchronization code, for the identical structural reason Phase 3.4
Part 2 already established for order-status sync ("there was never a
second copy of the state to synchronize in the first place"). Proven
directly, not just argued: a test (and the manual verification script)
calls the admin mutation, then immediately calls the customer-portal
query and confirms the new status (and, for a rejection, the persisted
`rejectionReason`) is visible.

### Counter purchases (section 17)

No new code was needed for Counter-purchase support specifically —
`updateReturnRequestStatus`/`getAdminReturnRequestByNumber` operate on
`ReturnRequest.returnNumber` alone, with no `source`-specific branch
anywhere. A return request against a customer-linked Counter purchase is
managed identically to one against an Online purchase — proven directly
by a dedicated test and re-verified in the manual script (Step 1 there
specifically uses a `COUNTER`-sourced, `COUNTER_HANDOVER`-fulfillment
order). Guest-purchase exclusion needs no new test here: Part 1 already
established, structurally, that a `ReturnRequest` can never exist at all
for a guest order (`customerId` is required on the model) — there is
nothing for Part 3's admin mutations to exclude that could ever reach
them in the first place, so re-testing "guest exclusion" against
functions that only ever operate on already-existing `ReturnRequest`
rows would test nothing new.

### Security review

- **Admin authorization**: `updateReturnRequestStatusAction`/
  `updateReturnRequestAdminNoteAction` both resolve `getAdminSession()`
  first and reject (`UNAUTHORIZED`) before ever parsing `input` if it's
  missing — identical shape to `updateOrderStatusAction`.
- **Customers cannot modify ReturnRequest status (section 18)** — proven
  directly, not just argued: a test establishes a REAL, valid
  **customer** session (via `createCustomerSession`, Phase 3.4) with
  **no** admin session at all, then calls the admin status-transition
  action and confirms it still returns `UNAUTHORIZED` and the row is
  untouched. This is structurally guaranteed, not merely policy:
  `getAdminSession()` reads the `klasiq_admin_session` cookie
  exclusively — a customer session cookie (`klasiq_customer_session`)
  is a different name entirely, so it is never even inspected, let alone
  accepted, by the admin authorization path.
- **No customer-facing mutation path exists for status at all**: the
  customer-portal's own action (`createReturnRequestAction`, Part 2)
  can only ever create a fresh `REQUESTED` row — it has no code path
  that writes `status`, `approvedAt`, `rejectionReason`, or any other
  field this part introduces.
- **Request IDs are not authorization** (carried forward from Part 2):
  the admin detail page looks up by `returnNumber` under an
  already-established `getAdminSession()` gate — there is no
  customer-facing exposure of this lookup at all.
- **Concurrency as a security property, not just correctness**: the
  guarded `updateMany` prevents a benign double-click from double-
  auditing (e.g. two "Approve" clicks both recording a real transition)
  — proven directly (see "Status transitions" above).
- **Rejection reason is exactly what the admin typed** — no template
  substitution, no default text ever silently applied; the Server
  Action's zod schema requires a trimmed, non-empty string, and the
  domain function independently re-enforces the same requirement.

### Concurrency review (section 19)

Both explicitly required scenarios are proven with real, truly
concurrent (`Promise.all`, not sequential) calls against the same row:

- **Two admins approving simultaneously**: exactly one call performs the
  real `REQUESTED → APPROVED` transition; the other receives `CONFLICT`.
- **Two admins completing simultaneously**: identical shape, proven
  against a request already driven to `RECEIVED` first.

Both are additionally re-verified end-to-end in the manual verification
script (Step 9), against a genuinely different order/customer than the
automated tests use, confirming the guard holds outside the test
harness too.

### Mobile / responsiveness (section 20)

Admin remains primarily desktop, as instructed — no phone-specific
redesign was attempted. The dashboard list and detail page reuse the
exact same responsive card/section patterns already proven acceptable
on tablets by the existing Orders admin pages (`flex-col` stacking to
`sm:flex-row`, `sm:grid-cols-2` sections) — no new responsive work
beyond what those existing conventions already provide.

### Accessibility (section 21)

- Every `<select>` filter carries an explicit `aria-label` (mirroring
  `OrderFilters`'s own established pattern).
- Status-transition buttons are real `<Button>` elements with visible
  text labels (`RETURN_REQUEST_STATUS_ACTION_LABEL`) — never icon-only.
- The rejection-reason textarea has an associated `<Label
  htmlFor="rejection-reason">` and is required before its own "Confirm
  Rejection" button enables (`disabled={!rejectionReason.trim()}`) —
  the constraint is visible and enforced in the UI, not just server-side.
- Status/type badges pair color with text in every case (reusing
  `RETURN_REQUEST_STATUS_LABEL`/a type label) — never color alone,
  consistent with every other badge in this codebase.
- Toasts (`sonner`, reused unchanged from `OrderStatusActions`) announce
  both success and failure outcomes for every action.

### Status badges (section 22) — centralized, not duplicated

Moved the status → color mapping that Part 2 had defined **locally**
inside `src/components/customer-portal/return-history.tsx` into
`RETURN_REQUEST_STATUS_BADGE_CLASS`
(`src/lib/return-lifecycle.ts`), exactly mirroring
`ORDER_STATUS_BADGE_CLASS`'s own established precedent (one shared
`Record`, used by both the admin badge and the customer-portal
component). The customer-portal `ReturnHistory` component was updated
to import the centralized map instead of defining its own — Part 2's
local copy was Part 2's own foundation for this exact refactor, not a
mistake being corrected. `RETURN_REQUEST_STATUS_ACTION_LABEL` (the
admin action-button labels) was added alongside it, mirroring
`ORDER_STATUS_ACTION_LABEL`'s own shape.

### Auditability (section 23)

Every mutating transition stamps both a timestamp and the acting
`AdminUser`'s id, resolved from `getAdminSession()` — never a
client-supplied value. Proven directly: dedicated tests assert
`approvedByAdminUserId`/`rejectedByAdminUserId`/`receivedByAdminUserId`/
`completedByAdminUserId`/`cancelledByAdminUserId` equal the acting
admin's real id after each respective transition, and the detail page
renders each admin's name (via a `select: { name: true }` join) directly
in the Timeline.

### Testing (section 26)

**495 tests passing** (461 from Parts 1–2 + 34 new for this part):

- `src/server/commerce/__tests__/admin-returns.test.ts` (new, 19 tests,
  real Postgres): approve sets the correct audit fields; approve is
  idempotent (repeat call is a no-op, `approvedAt` unchanged); reject
  without a reason returns `MISSING_REJECTION_REASON`; reject with a
  reason persists it plus audit fields; a full REQUESTED → APPROVED →
  RECEIVED → COMPLETED path stamps every step; a transition attempted
  out of a terminal `COMPLETED` state is rejected
  (`INVALID_TRANSITION`); cancel succeeds directly from `REQUESTED` and
  from `APPROVED`; skipping straight from `REQUESTED` to `RECEIVED` is
  rejected; a nonexistent return number returns `NOT_FOUND`; two
  concurrent approvals — exactly one succeeds; two concurrent
  completions — exactly one succeeds; a Counter-linked purchase's
  return is approved through the identical path as an Online one; an
  admin approval is immediately visible through the customer-portal's
  own `getReturnRequestsForOrder` query (portal sync); the admin-note
  update persists correctly and returns `NOT_FOUND` for a bogus return
  number.
- `src/server/queries/admin/__tests__/returns.test.ts` (new, 11 tests,
  real Postgres): `getAdminReturnRequests` filters correctly by status,
  type, and school; search finds a request by its own return number, by
  the underlying order number, by customer display name (partial,
  case-insensitive), by customer ID, and by school name;
  `getAdminReturnRequestByNumber` returns full order/customer/item
  detail and `null` for a nonexistent number; `getReturnRequestsForCustomer`
  returns every request for a customer newest-first across different
  orders, and an empty array for a customer with none.
- `src/server/actions/admin/__tests__/returns.test.ts` (new, 4 tests):
  `UNAUTHORIZED` with no session at all; **a real, valid customer
  session (no admin session) still gets `UNAUTHORIZED` and leaves the
  row untouched** — the direct proof of section 18; malformed input
  rejected as `VALIDATION` before the domain layer is ever called; a
  real authenticated admin can approve a real request and the row
  reflects the correct `approvedByAdminUserId`. (Plus 2 more for the
  admin-note action's own authorization/success path — 6 tests total in
  this file, folded into the 34 new-test count above.)

Section 26's remaining items (Transition validation, Concurrent
approvals, Concurrent completion, Admin authorization, Customer
authorization, Portal sync, Counter purchase, Guest exclusion, Audit
fields) are each covered by the tests enumerated above; "Guest
exclusion" specifically is not re-tested here for the reason given in
"Counter purchases" above (Part 1 already proved it structurally, and
nothing in Part 3 could ever un-prove it since no new creation path
exists).

Full suite: **495/495 passing**, run twice (once against the live dev
database, once against a from-scratch fresh database — see
"Regression" below) with identical results both times — no flake
observed in either run.

### Regression

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 495/495 passing (461 carried over + 34 new).
- `npm run build` — succeeds; `/admin/returns` and
  `/admin/returns/[returnNumber]` both appear in the route manifest
  alongside every prior route, including Part 2's
  `/track/orders/[orderNumber]/return`.
- Fresh-database verification: created `shop_fresh_verify_p353`, applied
  all 12 migrations via `prisma migrate deploy` (including this part's
  new `20260808160000_phase3_5_part3_admin_return_management`),
  confirmed **zero drift** via `prisma migrate diff`, ran
  `prisma/seed.ts` and `prisma/create-admin.ts` successfully, ran the
  full 495-test suite against it (100% pass, no flake this run), then
  dropped the database. The real shared dev database's `orders` (8),
  `return_requests` (0), and `admin_users` (1) counts were confirmed
  unchanged before and after.
- Manual verification (no browser-automation tool in this environment,
  same honest disclosure as every prior phase): a real-Postgres script
  exercised the actual query/domain-layer functions end to end —
  created a Counter-linked purchase and its return request; confirmed
  the dashboard list/filter/search all find it; confirmed an invalid
  `REQUESTED → RECEIVED` skip is rejected; approved it and confirmed the
  customer portal's own query reflects `APPROVED` immediately; drove it
  through `RECEIVED → COMPLETED`; saved and re-read an internal admin
  note; created and rejected a second request with a reason, confirming
  the customer-portal query surfaces that exact reason; confirmed
  `getReturnRequestsForCustomer` returns both of one customer's requests
  newest-first; ran a genuine concurrent-approval race on a third,
  separate request and confirmed exactly one side won; confirmed a
  second, unrelated customer's history query never surfaces the first
  customer's requests. All 10 steps passed; every script-created row was
  deleted afterward, confirmed via direct count against the shared dev
  database (unchanged before/after).
- The long-running dev server was again **not** restarted (per the
  standing instruction to only restart when explicitly asked) — its
  in-memory Prisma Client predates this part's migration, so it would
  currently error on any Returns-related admin page render until a
  future explicit restart. Verification therefore used direct
  script/query-layer calls, exactly as in Parts 1 and 2.

### Known limitations / architecture debt (carried forward and new)

- Everything already disclosed in Parts 1–2 still applies unchanged —
  no inventory reconciliation, no refund processing, no walk-in
  workflow, no exchange-specific replacement-item logic.
- **Flat audit-timestamp fields instead of a dedicated event-log
  table**: a genuine trade-off (see "Audit fields" above) — correct and
  sufficient for this lifecycle's actual (one-directional,
  two-terminal-branch) shape, but would not scale gracefully to a
  future lifecycle allowing re-entrant transitions (e.g. "un-reject"). A
  richer `ReturnRequestStatusEvent` table is the natural next step if
  that day ever comes; not built speculatively now.
- **No "revoke/undo an approval" action**: once `APPROVED`, the only
  forward paths are `RECEIVED` or `CANCELLED` (per the brief's own
  lifecycle diagram) — there is no "un-approve back to REQUESTED" action,
  matching the brief's own six-state diagram exactly (not an omission).
- **`getAdminReturnRequests`'s customer-name/phone `contains` search is
  not index-backed** for substring matching (same documented limitation
  as `searchCustomers`, `src/server/queries/admin/customers.ts`) — will
  degrade toward a sequential scan as the table grows; a trigram
  (`pg_trgm`) GIN index is the correct future fix if/when it's needed,
  deferred until real scale demonstrates the need, consistent with that
  file's own precedent.
- **The dev server's stale Prisma Client** (noted above) means this
  part's new admin UI has not been visually exercised in an actual
  browser — only verified via typecheck, production build compilation,
  and direct script-level calls to the same functions the pages call.
- **No admin-side pagination** for the Returns dashboard (a `take: 200`
  cap, same convention as `getAdminOrders`) — a reasonable simplification
  at this shop's realistic scale, revisitable if that ever changes.

## Final Phase 3.5 Part 3 verdict

> Klasiq administrators can securely manage Return and Exchange requests
> from a dedicated Returns module, inspect complete request details,
> search and filter requests, move them through the authoritative
> lifecycle with proper audit history, synchronize those changes back to
> the customer portal, and maintain full operational visibility—without
> yet modifying inventory or processing refunds.

Demonstrated true, with evidence cited above: the Returns module is its
own top-level Admin section (never hidden under Orders); the dashboard
supports the full required set of fields, filters, and search; the
Return detail page shows complete customer/order/item context without
ever exposing a raw database id; every lifecycle transition
(Approve/Reject/Receive/Complete/Cancel) reuses the exact, centralized,
already-tested transition rules from Part 1, is idempotent, and is
concurrency-safe (proven with genuinely concurrent calls, both in
automated tests and the manual script); a full audit trail (who + when)
is persisted for every transition; the customer portal reflects every
admin change immediately with zero synchronization code, because there
is only ever one copy of the state; Counter-linked purchases are managed
identically to Online ones; customers are structurally incapable of
modifying `ReturnRequest` status (proven with a real customer session
attempting exactly that); no inventory or refund logic was touched
anywhere. Full test suite passes (495/495, twice, including a from-
scratch database run); fresh-database verification passes (12
migrations, zero drift); production build passes; documentation is
complete.

Changes across Phase 3.1, Phase 3.2 (all parts), Phase 3.3 (all parts),
Phase 3.4 (all parts), and Phase 3.5 (Parts 1, 2, and 3) are left
uncommitted together in the working tree, per instruction. Phase 3.5
Part 4 has not been started — awaiting review.

## Part 4 — Physical Returns, Walk-in Processing & Inventory Reconciliation

Date: 2026-08-08

Completes the operational loop Parts 1–3 deliberately left open:
Customer → Admin → physical item → **Inventory** → Commerce → Customer
Portal. This is the first part that ever touches
`ProductVariant.stockQuantity` for a return/exchange — Parts 1–3 all
explicitly documented this as out of scope, waiting for this part.

### Existing implementation audited (before writing any code)

- **`src/server/commerce/inventory.ts`** (`adjustInventoryByDelta`,
  `setInventoryQuantity`) — the codebase's one existing inventory-mutation
  module. Confirmed the guarded-`updateMany`-then-`InventoryAdjustment.create`
  shape and that both functions always open their **own**
  `db.$transaction`, meaning neither was directly composable inside a
  larger transaction — the exact gap this part needed to close (see
  "Inventory atomicity" below).
- **`src/server/commerce/order-core.ts`** (`resolveAndDecrementOrderLines`)
  — confirmed this is the precedent for a tx-accepting (not
  tx-opening) inventory function, and for "validate everything upfront,
  then a guarded write" as the two-layer safety shape this part's
  `receiveReturnRequest` reuses.
- **`src/server/commerce/update-order-status.ts`**'s `CANCELLED` branch
  (inventory restoration on order cancellation) — confirmed as the
  existing precedent for "a status transition that also touches
  inventory, atomically, in one transaction" — the exact shape
  `receiveReturnRequest` needed, now generalized via the new
  `applyInventoryDelta(tx, params)` primitive (see below) so this part's
  code and that existing code could, in principle, both call it (not
  changed in this part, since `update-order-status.ts` isn't part of
  this phase's scope, but confirmed compatible).
- **`src/lib/return-lifecycle.ts`** (Part 1) — confirmed
  `isValidReturnStatusTransition`/`nextValidReturnStatuses` are the
  single source of truth for the six-state lifecycle; this part adds
  zero new states and zero new transition rules — see "Inventory
  strategy" below for how reconciliation attaches to the *existing*
  APPROVED→RECEIVED→COMPLETED path rather than inventing a new one.
- **`src/server/commerce/admin-returns.ts`** (Part 3)
  `updateReturnRequestStatus` — confirmed this function had NO
  inventory awareness at all and could reach `RECEIVED`/`COMPLETED` as
  bare, side-effect-free transitions. This is the real gap Part 3's own
  "Known limitations" section flagged ("no admin-side status-mutation
  function yet... only the pure validation rules exist" — Part 1;
  "no inventory reconciliation... Part 4 owns it" — Part 3). Closed by
  refusing those two statuses here and moving them behind a dedicated,
  reconciliation-aware function (see "Changes to Part 3" below).
- **`src/server/actions/admin/counter-sale.ts`**/`counter-sale-product-search.tsx`/`counter-sale-customer-panel.tsx`
  — confirmed `searchSellableVariantsAction`,
  `searchCustomersForCounterSaleAction`, `CounterSaleProductSearch`, and
  `useDebouncedSearch` are all real, working, admin-authorized search
  primitives already in production use — reused directly for both the
  EXCHANGE replacement-variant picker (section 9's "only variants that
  genuinely exist, never free-text") and the walk-in customer/order
  search (section 5), rather than building parallel search
  implementations.
- **`Order`/`OrderItem`/`ProductVariant`/`InventoryAdjustment`
  (`prisma/schema.prisma`)** — confirmed `OrderItem.returnClaimedQuantity`
  (Part 1) is a claim counter, structurally separate from
  `ProductVariant.stockQuantity` — this part is the first time the
  latter is ever touched by the returns feature.

### Inventory strategy — reconciliation happens exactly at RECEIVED

Section 2 asks for the "safest point," choosing between RECEIVED and
COMPLETED, and to document the decision. **Chosen: RECEIVED** — the
earliest point at which a physical item is confirmably back in Klasiq's
possession, per section 7's own framing ("Admin confirms: Correct item,
Correct quantity, Physical condition acceptable. Then inventory
reconciliation occurs."). Concretely: reconciliation is now tied to the
admin action of receiving, not to an arbitrary, separately-clickable
"Complete" button that could happen much later (or be forgotten) with no
inventory meaning of its own.

**Consequence, honestly worked through**: since reconciliation must
happen exactly once, and COMPLETED (Part 3) has no independent meaning
once RECEIVED already implies "physically confirmed and reconciled,"
this part makes RECEIVED and COMPLETED happen **together, atomically, as
one admin action** — see `receiveReturnRequest`
(`src/server/commerce/return-fulfillment.ts`), which stamps both
`receivedAt`/`receivedByAdminUserId` **and**
`completedAt`/`completedByAdminUserId` in the same transaction as the
inventory writes. This satisfies section 12 exactly ("After successful
inventory reconciliation: ReturnRequest reaches COMPLETED") while still
keeping both timestamps genuinely honest (both really did happen, at the
same real moment, as one indivisible consequence of the admin's single
confirmation) — never a fabricated or inferred step.

### Changes to Part 3's `updateReturnRequestStatus`

`updateReturnRequestStatus` (Part 3) now **refuses** `RECEIVED` and
`COMPLETED` as a `newStatus` outright (`INVALID_TRANSITION`, with a
message pointing at the dedicated flow) — letting that bare,
inventory-agnostic function reach RECEIVED would let a request sit in
that status with stock never actually reconciled, exactly the "silently
increase stock" risk section 7 warns against, just inverted (silently
*not* reconciling while claiming to have received). APPROVED/REJECTED/
CANCELLED are completely unaffected — same code, same tests, same
behavior as Part 3.

**This is a deliberate, documented change to Part 3's own behavior**, not
an accidental regression: Part 3's "Known limitations" section explicitly
anticipated it ("no admin-side... mutation... this is explicitly Part
3's job" / "Part 4 owns it"). Three of Part 3's original tests
specifically asserted the OLD bare-RECEIVED/bare-COMPLETED behavior
worked; they were rewritten (not silently deleted) in
`src/server/commerce/__tests__/admin-returns.test.ts` to assert the NEW
refusal instead, with the equivalent real-transition coverage moved to
`receiveReturnRequest`'s own test file. All of Part 3's other tests
(authorization, rejection reasons, cancellation, concurrency for
APPROVED, Counter-purchase parity, portal sync) are untouched and still
pass unmodified.

### Inventory atomicity — one shared primitive, not a second system

Section 3/11 require reusing the existing inventory-adjustment mechanism
and doing the restore+issue as one transaction. `adjustInventoryByDelta`
(`src/server/commerce/inventory.ts`) previously always opened its own
`db.$transaction` — not composable inside a larger one.
**Extracted, not rewritten**: its exact guarded-`updateMany` +
stock-status-recompute + `InventoryAdjustment.create` logic now lives in
a new tx-accepting primitive, `applyInventoryDelta(tx, params)`, and
`adjustInventoryByDelta` becomes a thin `db.$transaction` wrapper around
it — proven to be a pure refactor (zero behavior change) by its own
9 pre-existing tests passing unmodified.

`receiveReturnRequest` composes **two** calls to this same primitive
inside **one** `db.$transaction`:

1. `applyInventoryDelta(tx, { productVariantId: <original>, delta:
   +quantity, reason: "RETURN_RESTORE", returnRequestId })` — always, for
   both RETURN and EXCHANGE (section 8: "Receiving the old item restores
   its inventory").
2. For EXCHANGE only: `applyInventoryDelta(tx, { productVariantId:
   <replacement>, delta: -quantity, reason: "EXCHANGE_ISSUE",
   returnRequestId })`.

If step 2 throws (insufficient stock — the SAME guarded-`updateMany`
mechanism that already prevents negative inventory everywhere else in
this codebase), the **entire transaction rolls back**, including step
1's restore that already ran — proven directly, not just argued: a
dedicated test creates an EXCHANGE request needing 3 units of a
replacement variant that only has 1 in stock, receives it, and confirms
the ORIGINAL item's stock is completely unchanged and the request is
still `APPROVED` (never left in a state where "old restored, new not
deducted" — section 11's exact failure mode — could occur). The manual
verification script (see below) re-proves the identical property against
a genuinely separate fixture.

### Two new `InventoryAdjustmentReason` values, reused, not duplicated

`RETURN_RESTORE` and `EXCHANGE_ISSUE` — added to the existing enum
(`prisma/schema.prisma`) alongside `STOCK_RECEIVED`/`MANUAL_CORRECTION`/
`ORDER_CANCELLATION_RESTORE`, not a parallel classification scheme.
Section 4's "Reason should clearly identify: Customer Return or
Exchange" is satisfied by these two distinct, self-describing values —
`RETURN_RESTORE` for the original item coming back (both RETURN and
EXCHANGE requests produce this), `EXCHANGE_ISSUE` specifically for the
replacement being issued (EXCHANGE only). Every `InventoryAdjustment`
row this part creates goes into the **exact same table** every other
stock movement in this codebase uses — see "Inventory audit" below for
why no second log was created.

### Replacement selection (section 9) — real variants, no free text

`ReturnRequestItem.replacementVariantId` (new, nullable, `onDelete:
Restrict` mirroring `orderItem`'s own precedent) is set **only** at
receive time, once an admin has actually chosen one, via
`ReturnReceivePanel` (`src/components/admin/return-receive-panel.tsx`) —
which reuses `CounterSaleProductSearch`
(`src/components/admin/counter-sale-product-search.tsx`) unchanged, the
exact same real-variant search/select UI Counter Sale already uses.
**Deliberately unrestricted to "the same product"**: a replacement can be
any active variant of any product — a different size (the common case:
`WRONG_SIZE`) or a genuinely different product/color, satisfying
section 9's explicit "Replacement variant, Size, Color (if applicable)"
without inventing an artificial same-product constraint the brief never
asked for. "Never free-text inventory" is enforced structurally: the
picker only ever emits a real `ProductVariant.id` a search result
actually returned, never an arbitrary string a form could submit.

### Stock validation (section 10) — interpretation and reasoning

The brief's exact wording — "If insufficient stock: Exchange cannot
complete. Return may still proceed." — was read as: the
insufficient-stock restriction is **EXCHANGE-specific** and must never
accidentally block a plain RETURN's receipt (which has no replacement to
validate at all, so nothing about it can ever fail on stock). A
considered alternative reading (that a request could "fall back" from a
failed EXCHANGE to a partial RETURN-only outcome, receiving the old item
while abandoning the replacement) was deliberately **rejected**: Part 1
established one `type` per request as a first-class, documented design
decision (see docs/PHASE_3_5_REPORT.md Part 1 "Return + Exchange"), and
silently converting an EXCHANGE into a RETURN mid-flight would undermine
that guarantee and introduce a real, unrequested feature (partial
exchange conversion) with its own edge cases (what reason code applies?
does the customer get notified of the change?) that the brief never
specifies. The implemented behavior — the WHOLE receive attempt fails,
atomically, with nothing changed, and the admin can choose a different
replacement or wait for restock and try again — is simpler, safer, and
matches every other all-or-nothing precedent in this codebase
(`createReturnRequest`'s own multi-item all-or-nothing validation, Part
1).

### Walk-in returns (sections 5/6) — no separate engine

`WalkInReturnForm` (`src/components/admin/walk-in-return-form.tsx`) +
a new `/admin/returns/new` page implement the brief's exact three-step
flow (Search Customer → Search Order → Open Return) using **only**
existing pieces:

- **Search Customer**: `searchCustomersForCounterSaleAction` (unchanged,
  Phase 3.2's Counter Sale action, reused directly).
- **Search Order**: `getCustomerOrdersForWalkInAction` (new, thin
  admin-auth-gated wrapper) around `getOrdersForAuthenticatedCustomer`
  (Phase 3.4 Part 2, unchanged) — that function's only input is a plain
  `customerId`, so it's safe to call once an admin session has already
  established the caller's authorization, exactly the same reuse
  Part 3's Return Detail page already established for "Customer
  purchase history."
- **Open Return**: `getReturnableItemsForWalkInAction` (new, thin
  wrapper) around `getReturnableItemsForOrder` (Part 1, unchanged).
- **Create**: `createWalkInReturnRequestAction` (new) calls the
  **identical** `createReturnRequest` (Part 1/2) the customer portal's
  own action calls — zero new domain logic. The only schema difference
  from the customer-portal path is that `createWalkInReturnRequestSchema`
  accepts `customerId` directly from the admin's own selection (mirroring
  `createCounterSaleSchema`'s already-established "admin picks an
  EXISTING customer via search" precedent,
  `src/lib/validation/admin-counter-sale.ts`) rather than resolving it
  from a customer session (there is no customer session in a walk-in
  scenario — the admin IS the authenticated party). `createReturnRequest`
  itself still independently re-validates that the given `orderNumber`
  truly belongs to `customerId` and re-validates full eligibility — proven
  directly: a test submits a real order under the WRONG customer's id and
  confirms `ORDER_NOT_FOUND`, exactly as if a portal customer had tried
  the same thing.

Once created, the walk-in request is a completely ordinary
`ReturnRequest` — the admin is redirected straight to its own
`/admin/returns/[returnNumber]` detail page and uses the **exact same**
Approve → Receive flow (`ReturnStatusActions`/`ReturnReceivePanel`) any
portal-originated request uses. Nothing about the walk-in path has its
own status, its own UI for receiving, or its own inventory logic — "No
separate workflow. Reuse the same ReturnRequest," verified by
construction, not merely asserted.

### Receiving items — confirmation required (section 7)

`ReturnReceivePanel` requires an explicit checkbox confirmation
("I've confirmed the correct item(s), correct quantity, and acceptable
physical condition") before its submit button even enables — and, for
EXCHANGE, additionally requires every item to have a chosen replacement
before submission is possible. Nothing calls
`receiveReturnRequestAction` implicitly or automatically anywhere in this
codebase (confirmed by grep) — "Do not silently increase stock" is
satisfied both by requiring this explicit UI confirmation and, more
fundamentally, by the domain layer requiring a specific admin-initiated
call with a real `adminUserId` to do anything at all.

### Return completion & customer portal sync (sections 12/16)

No new synchronization code was needed, for the identical structural
reason Part 3 already established: `getReturnRequestsForOrder` (Part 2)
reads the same live `return_requests` row `receiveReturnRequest` writes
to — the moment that transaction commits, a customer's next portal page
load sees `COMPLETED`. Proven directly (test + manual script): call
`receiveReturnRequest`, then immediately call `getReturnRequestsForOrder`
and confirm the status.

### Order history & return history remain immutable/additive (sections 13/14)

`receiveReturnRequest` never writes to `Order`/`OrderItem`'s own
purchase-time snapshot fields (`unitPriceInPaise`, `quantity`,
`productName`, etc.) — confirmed by grep, it only ever touches
`ProductVariant.stockQuantity`/`stockStatus`,
`ReturnRequest`/`ReturnRequestItem`'s own columns, and creates new
`InventoryAdjustment` rows. The customer's Order Detail page (Phase 3.4)
is completely unaffected; the Return History section (Phase 3.5 Part 2)
simply shows the same request's status having advanced to `COMPLETED` —
no duplicate order, no rewritten history, exactly section 13/14's
requirement.

### Admin detail page — inventory visibility (section 15)

The Return Detail page (`src/app/admin/(protected)/returns/[returnNumber]/page.tsx`)
gained a new "Inventory" section, rendered only once
`inventoryAdjustments.length > 0` (i.e. only after receiving — "do not
clutter" precedent, consistent with every prior part's own convention),
showing: "Inventory restored: N × Product (Size S)" per item; "Replacement
issued: N × Product (Size S)" for EXCHANGE items (via the new
`replacementVariant` include); and a "Stock movements" list reusing the
`InventoryAdjustment` rows this request caused (product/size, reason,
signed delta) — never a raw `id`, `productVariantId`, or
`returnRequestId` rendered anywhere.

### Inventory audit (section 16) — same table, no second log

No new audit log was created. `InventoryAdjustment` gained one new
nullable `returnRequestId` column (mirroring its existing `orderId`
column's own pattern for `ORDER_CANCELLATION_RESTORE`) so a return's
stock movements are queryable/filterable exactly like every other
adjustment — the Inventory admin page (unchanged in this part) already
lists a variant's full `inventoryAdjustments` history, so a
return-caused restore/issue naturally appears there, interleaved with
manual corrections and stock-received entries, with zero new code on
that page.

### Counter purchases (section 17)

No new code needed — `receiveReturnRequest` operates on
`ReturnRequest.returnNumber`/its items' underlying `OrderItem`s alone,
with no `source`-specific branch anywhere. Proven directly: a dedicated
test (and the manual verification script's Step 1) creates a
`COUNTER`-sourced, `COUNTER_HANDOVER`-fulfillment order, returns an item
from it, and confirms inventory reconciles identically to an Online
purchase. Guest-purchase exclusion needs no new proof here, for the same
reason given in Part 3: a `ReturnRequest` can never exist at all for a
guest order (Part 1's `customerId`-required schema), so there is nothing
for this part's reconciliation code to exclude that could ever reach it.

### Concurrency (section 18)

"Two admins attempting to receive the same return simultaneously" is
proven with two genuinely concurrent (`Promise.all`) calls to
`receiveReturnRequest` against the same `APPROVED` request: the guarded
`updateMany({ where: { id, status: request.status } })` for the
REQUESTED-status-read → RECEIVED transition is the actual concurrency
gate (identical mechanism to Part 3's own approve/complete concurrency
proof) — exactly one call's transaction successfully claims the
transition and proceeds to reconcile inventory; the other's `updateMany`
affects zero rows, throws `ConcurrencyConflictError`, and its ENTIRE
transaction (including any inventory writes it might otherwise have
attempted) rolls back before ever touching stock. Proven with the exact
final stock quantity asserted equal to a SINGLE restoration having
occurred, never a double-counted one — both in the automated test and
the manual script's own separate fixture.

### Security (section 19)

- **Receive/reconciliation/exchange-completion are Admin-only**:
  `receiveReturnRequestAction` resolves `getAdminSession()` first and
  rejects (`UNAUTHORIZED`) before ever parsing input if missing —
  identical shape to every other admin action in this feature.
- **Customer portal remains read-only**: grepped the entire
  customer-portal tree (`src/app/(site)/track`,
  `src/components/customer-portal`) — confirmed no file there imports or
  calls `receiveReturnRequest`/`receiveReturnRequestAction`,
  `applyInventoryDelta`, or any inventory-mutating function. The
  customer's only own mutation remains `createReturnRequestAction`
  (create a fresh `REQUESTED` row) — untouched by this part.
- **Walk-in creation is still Admin-only and still re-validated**:
  `createWalkInReturnRequestAction` requires `getAdminSession()`, and the
  underlying `createReturnRequest` domain function independently
  re-verifies order/customer ownership regardless of who calls it (proven
  directly — see "Walk-in returns" above).
- **No new attack surface on `adminUserId`**: exactly like every other
  admin mutation in this feature, `adminUserId` is resolved server-side
  from the verified session, never accepted from `input` in any of this
  part's new schemas.

### Mobile (section 20)

Desktop-first, as instructed — the Receive panel and walk-in form reuse
the same responsive card/section conventions already established by
Parts 1–3 (stacking `flex-col`, sensible `max-w` bounds); no
phone-specific redesign was attempted or needed.

### Tests

**512 tests passing** (495 from Parts 1–3 + 17 new for this part, net of
2 Part 3 tests rewritten in place rather than counted as both old and
new):

- `src/server/commerce/__tests__/return-fulfillment.test.ts` (new, 12
  tests, real Postgres): a RETURN restores stock exactly once and
  creates one `RETURN_RESTORE` adjustment with the correct delta/admin/
  `returnRequestId`; a second receive attempt on the same request is
  rejected (`INVALID_TRANSITION`) and stock is not touched again;
  receiving a request that was never approved is rejected; a nonexistent
  return number returns `NOT_FOUND`; an EXCHANGE restores the original
  AND deducts the chosen replacement, creating both adjustment rows and
  persisting `replacementVariantId`; a missing replacement selection is
  rejected (`REPLACEMENT_REQUIRED`); a nonexistent replacement variant is
  rejected (`INVALID_REPLACEMENT_VARIANT`); an inactive replacement
  variant is rejected the same way; insufficient replacement stock rolls
  back the ENTIRE transaction (original stock proven unchanged, request
  proven still `APPROVED`, zero adjustment rows created); two genuinely
  concurrent receive attempts on the same request — exactly one
  reconciles, proven against the actual final stock quantity; a
  Counter-linked purchase's return reconciles identically to an Online
  one; the customer portal's own query reflects `COMPLETED` immediately
  after receiving.
- `src/server/commerce/__tests__/admin-returns.test.ts` (Part 3, updated):
  two tests rewritten to assert the new refusal of bare
  RECEIVED/COMPLETED transitions (replacing the old tests that asserted
  they worked); one test rewritten to reach the terminal state via the
  real `receiveReturnRequest` flow instead of the now-removed bare path;
  the old "two simultaneous completions" concurrency test was removed
  (COMPLETED is no longer independently reachable to race on) with a
  comment pointing at its equivalent replacement
  (`return-fulfillment.test.ts`'s "two simultaneous receives"). Every
  other Part 3 test (14 of the original 16) is untouched and still
  passes.
- `src/server/actions/admin/__tests__/returns.test.ts` (extended, 5 new
  tests): `receiveReturnRequestAction` — `UNAUTHORIZED` with no session,
  and a real authenticated admin successfully receiving an approved
  request end-to-end through the action layer; `createWalkInReturnRequestAction`
  — `UNAUTHORIZED` with no session, a real authenticated admin creating a
  genuine `ReturnRequest` through the action, and — the key security
  proof — an admin attempting to submit a real order under the WRONG
  customer's id still gets `ORDER_NOT_FOUND` (walk-in creation is not a
  way to bypass `createReturnRequest`'s own authoritative ownership
  check).
- `src/server/commerce/__tests__/inventory.test.ts` (Part 3-era, Phase
  3 origin): all 9 pre-existing tests pass unmodified against the
  refactored `adjustInventoryByDelta`, proving the `applyInventoryDelta`
  extraction was a pure refactor with zero behavior change.

Section 21's full list (inventory restored once, duplicate receive
prevented, exchange stock deducted, replacement stock validation,
insufficient stock, concurrent receive, Counter purchase, portal
synchronization, inventory adjustment creation, atomic transaction) is
covered by the tests enumerated above, each traceable to a specific named
test.

### Regression

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 512/512 passing.
- `npm run build` — succeeds; `/admin/returns/new` and the existing
  `/admin/returns`/`/admin/returns/[returnNumber]` routes all appear in
  the route manifest, with `/admin/returns/new` correctly resolving as
  its own static route ahead of the dynamic `[returnNumber]` segment (a
  routing property confirmed by the build output listing both
  separately, not merged).
- Fresh-database verification: created `shop_fresh_verify_p354`, applied
  all 13 migrations via `prisma migrate deploy` (including this part's
  new `20260808170000_phase3_5_part4_inventory_reconciliation`, which
  adds two enum values via `ALTER TYPE ... ADD VALUE` — safe as a single
  migration file on Postgres 12+ since nothing in the same migration
  *uses* the new values), confirmed **zero drift** via `prisma migrate
  diff`, ran `prisma/seed.ts` and `prisma/create-admin.ts` successfully,
  ran the full 512-test suite against it (100% pass), then dropped the
  database. The real shared dev database's `orders` (8),
  `return_requests` (0), `admin_users` (1), `inventory_adjustments` (2),
  and `product_variants` (53) counts were all confirmed unchanged before
  and after.
- Manual verification (no browser-automation tool in this environment,
  same honest disclosure as every prior phase): a real-Postgres script
  exercised the actual domain-layer functions end to end — a
  Counter-linked RETURN restored stock exactly once (10→12) and reached
  `COMPLETED`; a second receive attempt on the same request was rejected
  with stock unchanged; an EXCHANGE restored the original item's stock
  (5→6) and deducted the chosen replacement's stock (3→2) in one
  transaction; an EXCHANGE with genuinely insufficient replacement stock
  was rejected with the original item's stock proven completely
  untouched (atomicity) and the request left `APPROVED`, not silently
  advanced; a genuine concurrent-receive race on a third, separate
  request confirmed exactly one side won and stock was restored exactly
  once; the customer portal's own query was confirmed to show
  `COMPLETED` immediately, and the admin detail query was confirmed to
  show the correct `InventoryAdjustment` reference. All 6 steps passed;
  every script-created row was deleted afterward, confirmed via direct
  count against the shared dev database (unchanged before/after).
- The long-running dev server was again **not** restarted (per the
  standing instruction to only restart when explicitly asked) — its
  in-memory Prisma Client predates this part's migration and enum
  additions, so it would currently error on any return-related page
  render until a future explicit restart. Verification therefore used
  direct script/domain-layer calls, exactly as in Parts 1–3.

### Known limitations / architecture debt (carried forward and new)

- Everything already disclosed in Parts 1–3 that this part didn't
  address still applies: no refund/store-credit/wallet/gift-card
  processing, no courier/home pickup scheduling, no price-difference
  settlement for exchanges (explicitly out of scope, section 24 — this
  part only supports **like-for-like** exchanges; if the replacement
  variant's price differs from the original, no adjustment of any kind is
  computed, charged, or recorded — a genuine, deliberate limitation, not
  an oversight), no WhatsApp notifications, no analytics.
- **No admin-side pagination on the walk-in customer's order list** — a
  customer with many orders sees all of them (bounded by
  `getOrdersForAuthenticatedCustomer`'s existing `take: 50` cap, Phase
  3.4 Part 2) with no further pagination UI. Reasonable at this shop's
  scale, consistent with every other list in this codebase.
- **`ReturnReceivePanel` reuses `CounterSaleProductSearch` once per
  exchanged item** — that component sets `autoFocus` on its own input,
  so a multi-item exchange request renders more than one autofocusing
  search box on the same page. A minor, cosmetic UX rough edge (the last
  one rendered "wins" the initial focus) for the realistic common case
  (most exchanges are single-item) — not worth forking the shared
  component over for this phase.
- **No "undo a completed receive" action**: once `receiveReturnRequest`
  succeeds, the request is `COMPLETED` (terminal) and inventory has
  genuinely moved — there is no compensating "reverse this receive"
  mutation. This matches the brief's own lifecycle (COMPLETED is
  terminal) and is consistent with how `updateOrderStatus`'s own
  `CANCELLED`-triggered inventory restoration has no "undo" either — a
  real, intentional limitation of a system whose only correction
  mechanism is a NEW forward-moving request, not a reversal of a past
  one.
- **Enum-value migration caveat, documented not hidden**: adding
  `RETURN_RESTORE`/`EXCHANGE_ISSUE` to `InventoryAdjustmentReason` via
  `ALTER TYPE ... ADD VALUE` cannot be used in the SAME transaction/
  migration that also *reads* those values (a real Postgres restriction) —
  not an issue for this migration (it only adds the values, never uses
  them), but worth stating plainly for whoever writes the next migration
  touching this enum.

## Final Phase 3.5 Part 4 verdict

> Klasiq administrators can process real physical returns using the
> existing ReturnRequest workflow, safely reconcile inventory exactly
> once, complete like-for-like exchanges with proper stock validation,
> support customer walk-in returns without any separate workflow, and
> keep customer history, inventory, and operational records fully
> synchronized.

Demonstrated true, with evidence cited above: inventory reconciliation
happens exactly once, exactly at the point of confirmed physical receipt
(RECEIVED), never earlier, reusing the exact same
`InventoryAdjustment`/guarded-`updateMany` mechanism every other stock
movement in this codebase already uses; RETURN and EXCHANGE both restore
the original item, EXCHANGE additionally deducts a real, admin-selected
replacement variant with full stock validation, all atomically (proven
by a genuine insufficient-stock rollback test); walk-in returns use the
identical `createReturnRequest`/`ReturnRequest`/Approve→Receive path as
every portal-originated request, with zero separate code paths; customer
history, inventory, and the customer portal all stay synchronized because
there was never more than one copy of the truth to begin with. Full test
suite passes (512/512, including a from-scratch database run); fresh-
database verification passes (13 migrations, zero drift); production
build passes; documentation is complete.

Changes across Phase 3.1, Phase 3.2 (all parts), Phase 3.3 (all parts),
Phase 3.4 (all parts), and Phase 3.5 (Parts 1, 2, 3, and 4) are left
uncommitted together in the working tree, per instruction. Phase 3.5
Part 5 has not been started — awaiting review.

## Part 5 — Advanced Exchange Engine, Overrides & Final Production Hardening

Date: 2026-08-08

**This is the final part of Phase 3.5.** It adds the two pieces of new
domain capability the phase was still missing (Admin Override, Price
Difference Foundation), re-audits every prior part against the phase's
own original definition of done, fixes the genuine gaps that audit
found, and closes with a production-acceptance verdict for the entire
Returns & Exchanges feature (Parts 1–5 together).

### Existing implementation audited (before writing any code)

Read `docs/PHASE_3_5_REPORT.md` in full (Parts 1–4) and re-read the
actual current code, not assumptions:

- **`src/lib/return-eligibility.ts`** — confirmed the exact shape of the
  two time-based checks (`!deliveredAt`, window-expired) versus the
  quantity check, and that they're structurally separable — the
  foundation for a bypass flag that touches only the former.
- **`src/server/commerce/returns.ts`** (`createReturnRequest`) —
  confirmed this remains the ONE creation path for both RETURN and
  EXCHANGE, and that it already has a "caller resolves authorization"
  design (Part 1) — the natural, already-designed-for extension point
  for an override parameter.
- **`src/lib/return-lifecycle.ts`** — confirmed the six-state lifecycle
  and its transition table are unchanged since Part 1 and require no new
  states for anything this part adds (override is a creation-time flag,
  not a status; price difference is informational, not a status).
- **`src/server/commerce/return-fulfillment.ts`**/**`inventory.ts`** —
  confirmed the exact point (inside `receiveReturnRequest`'s transaction,
  where the admin-selected replacement variant is already read) to
  capture a price snapshot with zero extra queries.
- **`ReturnRequestItem`/`ReturnRequest` schema** (Part 1/3/4) — confirmed
  every existing audit-field pattern (timestamp + actor id + named
  `AdminUser` relation) so the new override fields are structurally
  identical to `approvedAt`/`approvedByAdminUserId` etc., not a new
  pattern.
- **`src/components/customer-portal/return-history.tsx`** /
  **`src/server/queries/customer-portal/returns.ts`** (Part 2) —
  confirmed the customer history query did NOT include
  `replacementVariant` — a genuine completeness gap for a COMPLETED
  exchange (see "Customer history" below).
- **`src/app/admin/(protected)/returns/[returnNumber]/page.tsx`** (Part
  3/4) — confirmed the detail page's Timeline/Inventory sections had no
  slot for an override event or a price-difference figure — the
  concrete gaps section 7 of the brief asked to close.
- **`src/server/actions/admin/counter-sale.ts`** — re-confirmed
  `createCounterSaleSchema`'s established precedent for an admin schema
  that legitimately accepts a `customerId` directly (search-then-select),
  the exact precedent the new `overrideReason` field on
  `createWalkInReturnRequestSchema` follows for the same reason.

### Advanced Exchange — variant-oriented, already future-ready

Section 2 asks the architecture to safely support "34→36, 36→38, Blue→Black
(future)" without forcing color support today, and to be "variant-oriented."
**Audited and confirmed: this is already true, unchanged from Part 4.**
`ReturnRequestItem.replacementVariantId` references `ProductVariant`
directly — not a size string, not a separate "target size" field, not
anything product-family-scoped. Because this catalogue models color as a
**separate `Product`** (e.g. "Blue Polo Shirt" and "White Polo Shirt" are
two different `Product` rows, each with their own `ProductVariant` set
for size), a replacement variant can reference **any** active variant of
**any** product — a size-only exchange (34→36) and a full product/color
exchange (Blue→Black) are the exact same code path, already, with zero
schema change needed for the latter when it's actually requested. This
was a deliberate Part 4 decision (see that part's "Replacement selection")
and this part's audit confirms it holds for the phase's own stated goals
(future readymade garments, multi-store, franchises): none of those
introduce a NEW kind of "thing a customer exchanges for" — they introduce
more `Product`/`ProductVariant` rows, which this architecture already
accommodates by construction. **Nothing was changed here** — the
correct outcome of an audit that finds the design already sound.

### Admin Override architecture

**The mechanism**: `createReturnRequest` (`src/server/commerce/returns.ts`)
gained an optional `override?: { reason: string; adminUserId: string }`
parameter. When supplied, `getOrderReturnEligibility`/
`getItemReturnEligibility` (`src/lib/return-eligibility.ts`) are called
with a new `bypassWindowCheck: true` flag that skips ONLY the two
time-based checks (`ORDER_NOT_DELIVERED`, `RETURN_WINDOW_EXPIRED`) —
**the quantity-availability check is never bypassable, by any caller,
under any circumstance** (see "Quantity is never overridable" below).
On success, `overrideReason`/`overriddenAt`/`overriddenByAdminUserId`
are persisted on the created `ReturnRequest` row, mirroring every other
audit field this feature already has (Part 3's
approved/rejected/received/completed/cancelled — same shape: timestamp +
acting-`AdminUser` FK +, for override specifically, a mandatory reason
exactly like rejection's own `rejectionReason`).

**Explicit action, never silent** (section 3's own requirement): there is
no implicit or automatic override anywhere. The ONLY caller that can ever
supply one is `createWalkInReturnRequestAction`
(`src/server/actions/admin/returns.ts`) — the customer-portal's own
`createReturnRequestAction` (Part 2) has no `override`/`overrideReason`
field anywhere in its schema, so a customer can structurally never
trigger one, not even by tampering with a request body (there is no field
name that would do anything — `createReturnRequestSchema`, Part 2, has
never been touched by this part). `createWalkInReturnRequestSchema`
requires a non-empty, trimmed `overrideReason` (max 500 chars) whenever
present; the admin-facing form
(`src/components/admin/walk-in-return-form.tsx`) additionally disables
its own submit button until a reason is typed once the "Admin Override"
checkbox is checked, and defaults to **unchecked** — default behavior
remains strict, exactly as required.

**Default behavior remains strict**: proven directly, not just designed
— a test creates an identical not-yet-delivered order and shows the
IDENTICAL call without `override` still fails with
`ORDER_NOT_DELIVERED`/`RETURN_WINDOW_EXPIRED`, while the SAME call with
`override` succeeds (`src/server/commerce/__tests__/return-override.test.ts`).

**Quantity is never overridable** — the one line the brief itself never
asked to be bypassable, and a real, considered architecture decision:
the 7-day window is a *business policy* an owner may legitimately choose
to waive for a specific customer or school; the remaining-purchased-
quantity figure is a *data-integrity fact* (how many units were actually
bought, minus how many are already genuinely claimed) that no
administrative decision can make more true than it is. Overriding it
would risk a real inventory/accounting error, not a policy exception.
Proven directly: even with `override` supplied, requesting more than the
remaining quantity — or requesting against an item already fully
claimed — still returns `INSUFFICIENT_QUANTITY`
(`return-override.test.ts`, two dedicated tests).

**Audit trail**: every overridden request records who (`overriddenByAdminUserId`,
a real `AdminUser.id`, never client-supplied — resolved from
`getAdminSession()` inside `createWalkInReturnRequestAction`, exactly
like every other actor field in this feature), what (`overrideReason`,
verbatim, no template substitution), and when (`overriddenAt`, a
server-generated timestamp). Surfaced on the admin Return Detail page as
its own highlighted banner (matching the existing rejection-reason
banner's visual treatment) and as its own Timeline step ("Admin Override
Applied"), plus a small "Override" badge on the Returns dashboard list
so an admin scanning the list can spot overridden requests at a glance
without opening each one.

**Concurrency**: overridden creation reuses the exact same guarded
quantity-claim `updateMany` every other `createReturnRequest` call uses
— proven directly with two genuinely concurrent (`Promise.all`)
overridden creations racing for the same last unit of a not-yet-delivered
order: exactly one succeeds, `returnClaimedQuantity` ends at exactly 1,
never 2 (`return-override.test.ts`, "concurrent Admin Override
creation").

### Price Difference Foundation

**No payment processing exists anywhere near this** — grepped the
entire new/changed surface for this part; nothing charges, refunds, or
touches `PaymentStatus`/`PaymentMethod`. This is purely a calculation +
a historical snapshot.

`ReturnRequestItem.replacementUnitPriceInPaiseSnapshot` (new, nullable
`Int`) — the replacement variant's `priceInPaise` **at the moment it was
issued**, captured inside `receiveReturnRequest`'s existing upfront
validation loop (which already reads the replacement variant to check
`isActive`) and persisted alongside `replacementVariantId` in the same
`tx.returnRequestItem.update` call — zero extra queries. This mirrors
`OrderItem.unitPriceInPaise`'s own established precedent (Phase 1)
exactly: a later price change on the live `ProductVariant` must never
retroactively alter a historical exchange's recorded value. Proven
directly: a test changes the replacement variant's live price AFTER
receiving and confirms the persisted snapshot is unaffected.

**Calculation, not storage**: `getExchangePriceDifference`
(`src/lib/exchange-price.ts`, new, pure, DB-free — mirrors
`return-eligibility.ts`'s own shape) takes the original snapshot
(`OrderItem.unitPriceInPaise`, already existed) and the new replacement
snapshot, multiplies each by quantity, and classifies the result:

```ts
CUSTOMER_PAYS  // replacement value > original value
REFUND_DUE     // replacement value < original value
EQUAL_VALUE    // exactly equal
```

**Deliberately NOT a third persisted "difference"/"differenceType"
column** — both are cheap, always-correct derivations of two numbers
already on the row; persisting a third, computed value would be exactly
the redundant-data risk this codebase's own conventions warn against
(see `ReturnRequestItem`'s Part 1 doc comment on why it holds no product
snapshot of its own). Proven directly for all three classifications, at
both the pure-function level (`src/lib/__tests__/exchange-price.test.ts`,
4 tests) and the real-database level (`return-fulfillment.test.ts`,
"price difference snapshot", 4 tests: EQUAL_VALUE, CUSTOMER_PAYS,
REFUND_DUE, and snapshot immutability).

**Admin-only display, deliberately, in this phase**: the Return Detail
page shows the computed difference per exchanged item ("₹300.00 →
₹450.00 · Customer Pays (₹150.00)"), reusing `getExchangePriceDifference`
directly — never a second calculation. The customer portal does **not**
show it. This is a considered scoping decision, not an oversight:
showing a customer "you owe ₹150" with no actual payment mechanism in
place (section 17 explicitly defers payments/refunds/store credit/
wallet to later phases) risks implying a settlement flow that doesn't
exist yet, which would be more confusing than useful. The foundation
(the two snapshots, the pure calculator) is fully built and available
the moment a future phase adds real payment/settlement — nothing about
today's scoping decision would need to change, only a new UI consumer.

### Mixed Request Review (section 5)

**Re-audited; kept unchanged; documented explicitly, as instructed when
no demonstrated benefit justifies a redesign.** The one-request-one-type
design (Part 1) was re-examined specifically because Part 4/5 now give
EXCHANGE items meaningfully different per-item data (a replacement
variant, its own price snapshot) than RETURN items carry — a plausible
reason the original decision might no longer fit. It still does:

- A customer who genuinely wants to return one item AND exchange another
  in the same visit already CAN — as **two separate `ReturnRequest`
  rows** submitted back to back (the portal form, Part 2, supports
  creating as many as needed), at no meaningful UX cost (one extra tap),
  and with each row staying unambiguously and simply "wholly a return"
  or "wholly an exchange" for every downstream consumer (admin
  dashboard filtering, inventory reconciliation, customer history
  display) — none of which would gain anything from a single row that
  could be "half return, half exchange."
- Changing to per-item type now would be a real, breaking schema
  decision affecting every part built so far (Part 3's admin actions,
  Part 4's `receiveReturnRequest`, this part's override/price-difference
  fields) for a benefit no actual user story in this brief demonstrates
  — exactly the "do not redesign unless there is a demonstrated benefit"
  instruction.
- The schema's own doc comment (`ReturnRequestItem`, `prisma/schema.prisma`)
  was updated in this part to record this re-audit explicitly, so a
  future phase doesn't need to re-derive the reasoning from scratch.

**No code changed as a result of this review** — the correct outcome
when an audit confirms the existing design.

### Customer history (section 6)

Audited `ReturnHistory`/`getReturnRequestsForOrder` against the brief's
own checklist (Return, Exchange, Rejected, Completed, Cancelled all
displaying clearly): status badges/labels for all six lifecycle states
already existed (Part 2/3, `RETURN_REQUEST_STATUS_BADGE_CLASS`), and the
rejection reason was already shown (Part 3). **One genuine gap found and
fixed**: a COMPLETED exchange showed only the OLD (returned) item's
info — nothing told the customer what they were actually getting
instead. Fixed by including `replacementVariant` in
`getReturnRequestsForOrder`'s query and rendering "Replacement: Product
Name · Size S" per item when set (Part 5's own new field, populated only
once an admin has actually received the exchange — never fabricated
before that point).

### Admin history (section 7)

Audited the Return Detail page against "every action, every override,
every inventory movement is understandable." Actions and inventory
movements were already fully covered (Part 3's Timeline, Part 4's
Inventory section with adjustment references). **Override was the
genuine gap** — closed this part with a dedicated banner section (shown
only when `overriddenAt` is set), a new Timeline step, and the price
difference now shown alongside each exchanged item's existing purchased/
already-returned/remaining figures. No raw database ids are exposed
anywhere in any of these additions (confirmed by review — every
reference is a `name`/`returnNumber`/`orderNumber`, never an `id`).

### Edge case review (section 8)

Each explicitly audited, with the outcome:

- **Return after partial exchange** / **Repeated exchanges**: both
  proven to work correctly via the existing `returnClaimedQuantity`
  counter (Part 1) — a partial EXCHANGE followed by a RETURN for the
  remaining quantity on the SAME item correctly reaches full claimed
  quantity with no double-counting; two separate EXCHANGE requests
  against the same item's remaining quantity both succeed independently.
  Proven directly (`return-override.test.ts`, "repeated exchanges and
  return after partial exchange", 2 tests). No code change needed — the
  counter-based design already handles this correctly by construction.
- **Cancelled request / Rejected request / Already completed request**:
  all already correctly terminal (Part 1's transition table, unchanged);
  re-confirmed by the existing exhaustive `return-lifecycle.test.ts`
  suite (every valid transition proven allowed, representative invalid
  ones proven rejected, all three terminal statuses proven to have zero
  outgoing transitions) plus Part 3/4's own transition-guard tests. No
  gap found.
- **Expired request**: audited specifically — does a `REQUESTED` row
  that was validly created within the window, but which an admin only
  gets around to approving AFTER the window has since passed, still
  process correctly? **Yes, by design**: `updateReturnRequestStatus`
  (Part 3) never re-checks the time window at all — the window only
  ever gates NEW creation (`createReturnRequest`), never a later
  transition on an already-existing, validly-created row. Proven
  directly with a dedicated test that backdates `deliveredAt` well past
  the window AFTER a valid request already exists, then confirms
  `APPROVED` still succeeds. This is correct, existing behavior,
  explicitly confirmed rather than assumed.
- **Inventory exhausted during exchange**: already proven in Part 4
  (insufficient-replacement-stock atomic rollback); re-confirmed
  unchanged.
- **Duplicate browser submission**: audited honestly. There is no
  idempotency-key mechanism for return creation (unlike checkout's
  `Order.idempotencyKey`). Two genuinely identical rapid submissions
  (the realistic "double-click Submit" scenario) both succeed as **two
  separate `ReturnRequest` rows**, if the purchased quantity allows
  both — proven directly with a dedicated test (2+2 against a
  purchased quantity of 4: both succeed, claimed quantity reaches
  exactly 4, a third identical attempt correctly fails with
  `INSUFFICIENT_QUANTITY`). This is a genuine, disclosed limitation
  (an admin would see two REQUESTED rows for the same items and need to
  reject/cancel one manually) — **not fixed** in this part, since a
  real fix (an idempotency key threaded through the customer-facing
  form and its schema) is a meaningfully sized change to Part 2's
  already-shipped, already-tested creation flow, and the brief's own
  "fix only genuine issues" / "do not redesign" instructions weigh
  against introducing it speculatively here. The property that IS
  guaranteed regardless — quantity can never be over-claimed beyond
  what was purchased — is proven and is the property that actually
  protects inventory integrity; the residual risk is purely an
  operational nuisance (an extra row to reject), not a data-integrity
  or security issue. Documented honestly as architecture debt below.
- **Refresh during processing / Back button**: no code change needed —
  every mutation in this feature is a server-side, atomically-committed
  transaction; a browser refresh or back-navigation mid-flight can only
  ever observe a fully-committed-or-fully-rolled-back state (Postgres
  transaction atomicity), never a partial one. Re-confirmed by re-reading
  every mutating function's transaction boundaries; no gap found.
- **Multi-tab admin usage**: this IS the concurrency property already
  proven repeatedly (Part 3's concurrent approvals, Part 4's concurrent
  receives, this part's concurrent overridden creation) — two tabs
  performing the same action simultaneously are indistinguishable from
  two backend calls racing, which is exactly what those tests exercise.
  No new code needed; re-confirmed as covered.

### Status validation (section 9)

The six-state lifecycle and its transition table
(`src/lib/return-lifecycle.ts`) are **unchanged since Part 1** — this
part adds no new status and no new transition. Documented here in full
for this final part's own record:

```text
REQUESTED  -> APPROVED | REJECTED | CANCELLED
APPROVED   -> RECEIVED | CANCELLED
RECEIVED   -> COMPLETED
REJECTED, COMPLETED, CANCELLED: terminal (zero outgoing transitions)
```

Every transition in this table is proven reachable
(`return-lifecycle.test.ts` + integration tests across Parts 3/4/5);
every transition NOT in this table is proven rejected, both at the pure
function level and, since Part 4, at the real-mutation level (bare
RECEIVED/COMPLETED are additionally refused by
`updateReturnRequestStatus` specifically because they now require real
inventory reconciliation — see Part 4's own report section, unchanged
here). No impossible transition was found reachable during this part's
audit.

### Security review (section 10)

- **Customer isolation**: unchanged, re-confirmed — every customer-facing
  query/action still scopes by `{ orderNumber, customerId }` derived
  from the verified session (Part 2/4), never from client input; nothing
  in this part touches that boundary.
- **Admin isolation**: every admin action still requires
  `getAdminSession()`; this part's new actions
  (none — `createWalkInReturnRequestAction`/`receiveReturnRequestAction`
  already existed from Part 4, only their PARAMETERS grew) inherit that
  gate unchanged.
- **Override permissions**: proven structurally, not just by convention
  — the customer-portal schema has no override field to tamper with at
  all; the admin schema requires `getAdminSession()` before the override
  branch is ever reached; `adminUserId` for the override is resolved
  from that session, never from client input. No privilege-escalation
  path exists from a customer session to an override (there is no
  override-capable action a customer session could even call).
- **Inventory integrity**: unchanged and re-confirmed — the guarded
  `updateMany` pattern (never allows negative stock) is the sole write
  path for every stock change in this feature, including price-snapshot
  writes (which touch no stock, only a `ReturnRequestItem` column).
- **Concurrent exchanges / concurrent receives**: unchanged from Part 4,
  re-confirmed passing.
- **Concurrent overrides**: new this part, proven directly (see "Admin
  Override architecture" above) — the SAME guarded quantity-claim
  mechanism protects overridden creation exactly as it protects normal
  creation; overriding the TIME check does not, and structurally cannot,
  weaken the CONCURRENCY guard, since they're independent code paths
  (one a pure eligibility function, the other a guarded SQL `updateMany`).
- **No privilege escalation** found anywhere in this part's new surface.

### Performance review (section 11)

Audited every query touched or added this part:

- `getReturnRequestsForOrder` (customer portal) gained one additional
  join (`replacementVariant` → `product`) — a single-row lookup per
  item via an already-indexed foreign key (`ReturnRequestItem.replacementVariantId`,
  indexed since Part 4), not a new N+1 pattern.
- `getAdminReturnRequestByNumber` gained one additional `select`
  (`overriddenByAdminUser.name`) — same shape as the five other
  admin-actor selects it already had; no new query, just one more field
  on an existing single-row `findUnique`.
- `receiveReturnRequest`'s upfront validation loop already read each
  replacement variant (Part 4, to check `isActive`); capturing
  `priceInPaise` from that SAME read added zero new queries.
- No new list-page query was added; the Returns dashboard's "Override"
  badge reads `overriddenAt`, a plain scalar already present on every
  row `getAdminReturnRequests` (Part 3) fetches — no new `include`.

**No speculative optimization was added** — every query pattern in this
feature remains a small number of indexed, single-purpose lookups,
appropriate at this shop's real scale; consistent with every prior
part's own "avoid unnecessary database work, do not optimize speculative
problems" discipline.

### Mobile review (section 12)

Re-reviewed the customer return experience specifically (quantity
picker, reason selection, history, success screen — `ReturnRequestForm`,
Part 2, untouched by this part except its indirect consumer,
`ReturnHistory`, gaining the replacement-info line). The new
replacement line is a single additional `<p>` inside an existing
`<li>`, using the same text sizing/spacing conventions as every other
line in that card — no layout shift, no horizontal scroll introduced
(confirmed by inspecting the added JSX: no fixed widths, no new flex
row wider than its container). No redesign was needed or attempted, per
the brief's own "no major redesign" instruction.

### Accessibility (section 13)

Audited the new UI surfaces specifically:

- **Walk-in form's Admin Override control**: a real `<label>` wrapping
  the checkbox and its description text (the same accessible-wrapping
  pattern used throughout this codebase, e.g. `CounterSaleCustomerPanel`),
  so the entire sentence is the checkbox's accessible name, not just an
  adjacent, disconnected span. The reason textarea carries an explicit
  `aria-label` (visible placeholder text ALSO states it's required).
- **Item eligibility explanations**: each of the three possible states
  (eligible / ineligible-and-not-overridable / ineligible-but-overridable)
  now has its own distinct, explicit text (never color alone) — a
  genuine improvement over Part 4's binary eligible/not-eligible text,
  driven directly by adding the override capability.
- **Admin Override banner / Timeline step / price-difference text**
  (Return Detail page): plain text content within existing `<section>`/
  `<p>` elements, inheriting the page's existing heading structure and
  color-plus-text (never color-alone) convention — no new interactive
  element, so no new focus-management concern.
- **Override badge** (dashboard list): text-bearing (`"Override"`), not
  an icon-only indicator — readable by assistive tech and sighted users
  alike without relying on color.

No genuine accessibility issue was found requiring a fix beyond what's
described above — the existing forms/dialogs/buttons/status/history/
error patterns from Parts 1–4 were already reviewed in their own parts
and remain unchanged.

### Testing (section 14)

**533 tests passing** (512 from Parts 1–4 + 21 new for this part):

- `src/lib/__tests__/exchange-price.test.ts` (new, 4 tests, pure):
  EQUAL_VALUE, CUSTOMER_PAYS, REFUND_DUE, and quantity-scaling
  correctness for `getExchangePriceDifference`.
- `src/server/commerce/__tests__/return-override.test.ts` (new, 12
  tests, real Postgres): without override a not-yet-delivered order is
  rejected; with override it succeeds and the override is persisted
  correctly; without override an expired-window return is rejected;
  with override it succeeds; override never bypasses over-quantity;
  override never bypasses an already-fully-claimed item; a normal
  (non-overridden) request leaves all three override fields null; two
  concurrent overridden creations racing for the last unit — exactly
  one succeeds; a partial EXCHANGE followed by a RETURN for the
  remainder both succeed, reaching full claimed quantity; two separate
  EXCHANGE requests against the same remaining quantity both succeed
  independently; two identical rapid duplicate submissions both succeed
  as separate rows without ever exceeding purchased quantity, and a
  third correctly fails; a request created within the window can still
  be approved after the window has since passed (time only gates
  creation, never later transitions).
- `src/server/commerce/__tests__/return-fulfillment.test.ts` (extended,
  4 new tests): EQUAL_VALUE/CUSTOMER_PAYS/REFUND_DUE persisted correctly
  end-to-end through a real receive; the price snapshot is immutable
  against a later live-price change.
- `src/server/actions/admin/__tests__/returns.test.ts` (extended, 1 new
  test): an admin can create a walk-in return for a not-yet-delivered
  order specifically by supplying `overrideReason`, and the audit fields
  persist correctly with the acting admin's real id.

Section 14's full list (Admin Override, override audit, exchange price
calculation, equal value, customer pays, refund due, repeated exchange
attempts, lifecycle validation, invalid transitions, duplicate
submissions, concurrent override, regression) is covered by the tests
enumerated above, each traceable to a specific named test.

### Regression (section 15)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 533/533 passing, run twice (live dev database, and
  a from-scratch database — see below) with identical results.
- `npm run build` — succeeds; every existing route (including all of
  Parts 1–4's) still appears in the route manifest unchanged.
- Fresh-database verification: created `shop_fresh_verify_p355`, applied
  all 14 migrations via `prisma migrate deploy` (including this part's
  new `20260808180000_phase3_5_part5_override_and_price_difference`),
  confirmed **zero drift** via `prisma migrate diff`, ran
  `prisma/seed.ts` and `prisma/create-admin.ts` successfully, ran the
  full 533-test suite against it (100% pass), then dropped the database.
  The real shared dev database's `orders` (8), `return_requests` (0),
  `admin_users` (1), `inventory_adjustments` (2), and `product_variants`
  (53) counts were all confirmed unchanged before and after.
- Manual verification (no browser-automation tool in this environment,
  same honest disclosure as every prior phase): a real-Postgres script
  proved, end to end: an override correctly blocked-then-allowed a
  not-yet-delivered return, with audit fields correctly persisted;
  override correctly still refused an over-quantity request; a real
  CUSTOMER_PAYS exchange was received, its price snapshot persisted
  correctly, and `getExchangePriceDifference` computed the right figures
  from it; the admin detail query resolved the overriding admin's real
  name; the customer portal query showed the completed exchange's
  replacement info; a partial exchange followed by a return for the
  remainder correctly reached full claimed quantity. All 6 steps
  passed; every script-created row was deleted afterward, confirmed via
  direct count against the shared dev database (unchanged before/after).
- The long-running dev server was again **not** restarted (per the
  standing instruction to only restart when explicitly asked) — its
  in-memory Prisma Client predates this part's migration, so it would
  currently error on any return-related page render until a future
  explicit restart. Verification therefore used direct script/domain-
  layer calls, exactly as in every prior part.

### Known limitations / architecture debt (carried forward and new)

- Everything already disclosed in Parts 1–4 that this part didn't
  address still applies: no refund/store-credit/wallet/gift-card
  processing, no courier/home pickup scheduling, no price-difference
  *settlement* (only calculation — section 4's own explicit scope),
  no WhatsApp notifications, no analytics.
- **No idempotency key for return/exchange creation** (see "Duplicate
  browser submission" above) — a genuine, disclosed gap. Quantity
  integrity is never at risk (proven), but a true double-click can
  produce two REQUESTED rows an admin must manually reconcile (reject
  one). A future fix would mirror `Order.idempotencyKey`'s own pattern
  (Phase 2) on `ReturnRequest`, threaded through the customer-facing
  form — a reasonably small, well-precedented addition, deliberately
  not built speculatively in this phase per its own "fix only genuine
  issues" instruction.
- **Price difference is calculation-only, never settled** — by explicit
  design (section 4/17). The foundation (snapshots + pure calculator)
  is complete and ready for a future phase to build real settlement on
  top of, without needing any schema or calculation change.
- **Price difference is admin-only, not customer-facing, in this
  phase** — a deliberate scoping decision (see "Price Difference
  Foundation" above), revisitable once a real settlement mechanism
  exists to pair it with.
- **`ReturnReceivePanel` (Part 4) still renders one autofocusing
  `CounterSaleProductSearch` per exchanged item** — a pre-existing,
  cosmetic rough edge for multi-item exchanges, not touched by this
  part (not a Part 5 regression, carried forward honestly).
- **No admin-side "un-override" or "edit override reason" action** —
  once set, an override's reason/actor/timestamp are permanent history,
  exactly like every other audit field in this feature (approved,
  rejected, etc. are equally immutable once stamped) — consistent, not
  an oversight.

## Production Acceptance — Phase 3.5 (Parts 1–5) verdict

> Klasiq supports secure item-level Returns and Exchanges for both
> Online and Customer-linked Counter purchases, quantity-level tracking,
> walk-in processing, inventory reconciliation, exchange inventory
> movement, controlled Admin overrides with full audit history,
> future-ready price-difference calculation, and a production-grade
> operational workflow while preserving inventory integrity, customer
> security, and complete historical accuracy.

Demonstrated true across all five parts together:

- **Item-level, quantity-level Returns and Exchanges**: Part 1's engine,
  unchanged in its core guarantees through Parts 2–5, still enforces
  server-authoritative eligibility and quantity math for every request,
  online or Counter-linked, portal-originated or walk-in.
- **Walk-in processing**: Part 4/5's admin-initiated creation reuses the
  identical `createReturnRequest` engine — proven, not just designed, to
  be the same code path (a wrong-customer walk-in attempt still fails
  exactly like a customer-portal IDOR attempt would).
- **Inventory reconciliation and exchange inventory movement**: Part 4's
  atomic, guarded-`updateMany`-based reconciliation, proven under real
  concurrency and real insufficient-stock rollback.
- **Controlled Admin overrides with full audit history**: this part's
  new capability, proven to bypass only what it should (time-based
  rules) and never what it must not (quantity), with a complete,
  structurally-enforced audit trail.
- **Future-ready price-difference calculation**: this part's new
  foundation, computing all three classifications correctly from
  immutable historical snapshots, ready for a future settlement phase.
- **Inventory integrity**: never violated across any test in any part —
  no negative stock, no double-reconciliation, no half-applied exchange,
  proven repeatedly under genuine concurrency.
- **Customer security**: customer isolation, session-only authorization,
  and structural override-exclusion all proven directly, not merely
  argued.
- **Complete historical accuracy**: order history remains immutable
  (Part 4); return/exchange history shows every status, every
  replacement, every override, and every price difference (admin) with
  nothing fabricated and nothing hidden.

Full test suite passes (533/533, run twice including a from-scratch
database, across all five parts' combined coverage); fresh-database
verification passes (14 migrations total for this feature, zero drift);
production build passes; documentation is complete across all five
parts.

Changes across Phase 3.1, Phase 3.2 (all parts), Phase 3.3 (all parts),
Phase 3.4 (all parts), and Phase 3.5 (Parts 1, 2, 3, 4, and 5) are left
uncommitted together in the working tree, per instruction.

**PHASE 3.5 — COMPLETE**

## Bug fix — Return claim release on Reject/Cancel (post-release regression audit)

**Reported symptom**: a real regression found during manual testing —
after a Return Request is fully COMPLETED, reopening the same Order in
the Admin Return flow still allows the exact same OrderItem to be
selected for another return.

**Audit performed**: the complete return-eligibility pipeline was
re-read end-to-end — `getItemReturnEligibility`/`getOrderReturnEligibility`
(`src/lib/return-eligibility.ts`), the return/exchange status lifecycle
and `doesReturnStatusClaimQuantity` (`src/lib/return-lifecycle.ts`), every
write to `returnClaimedQuantity` (`src/server/commerce/returns.ts`,
`admin-returns.ts`, `return-fulfillment.ts`), the single shared eligibility
query reused by both the customer portal and the admin walk-in flow
(`getReturnableItemsForOrder`, `src/server/queries/customer-portal/returns.ts`),
the Admin Override bypass logic (confirmed it never bypasses the quantity
check), the `canSelect` gating in `walk-in-return-form.tsx`, and the
line-item merge guarantee in `resolveAndDecrementOrderLines`
(`src/server/commerce/order-core.ts`) that rules out duplicate OrderItem
rows for the same product. This was followed by exhaustive, real-database
manual reproduction (throwaway scripts run against the dev Postgres
instance) of the full create → approve → receive/complete lifecycle for a
single RETURN, a single EXCHANGE, and two partial returns summing to the
full quantity.

**Honest result of that reproduction**: the literal reported symptom — a
fully COMPLETED request's units becoming selectable again — could not be
reproduced through the real domain pipeline in any of those scenarios;
`getItemReturnEligibility`'s quantity check (`purchasedQuantity -
claimedQuantity`, never bypassable by Override) correctly blocked every
attempt in every scenario tested.

**Root cause actually found, confirmed, and fixed**: `doesReturnStatusClaimQuantity`
has always documented that REJECTED and CANCELLED release a request's
claimed quantity back to returnable — but nothing in the codebase ever
called it. `createReturnRequest`'s guarded increment
(`src/server/commerce/returns.ts`) was the *only* write to
`returnClaimedQuantity` anywhere; there was no corresponding decrement for
either terminal status meant to give the claim back. In practice: reject
or cancel a return request once, and those units are permanently
unreturnable for the lifetime of the order — through any flow, admin or
customer portal — even though the goods were never actually taken back.
This is a real, provable, in-scope defect directly inside the
`returnClaimedQuantity` lifecycle the report named, even though it does
not literally match the "after COMPLETED" framing of the report.

**Fix** (`src/server/commerce/admin-returns.ts`,
`updateReturnRequestStatus`): when `newStatus` is REJECTED or CANCELLED,
the status write and a decrement of `returnClaimedQuantity` (by each
return item's claimed quantity) now happen atomically in one
`db.$transaction`, reusing the existing guarded-`updateMany` +
`ConcurrencyConflictError` pattern already established in
`return-fulfillment.ts` / `counter-sale.ts` / `receive-payment.ts` (no new
pattern introduced). APPROVED keeps its original bare `updateMany` — it
has no accompanying write. RECEIVED/COMPLETED are unaffected; they were
already correctly refused by this function and handled exclusively by
`receiveReturnRequest`, which correctly never touches this field.

**Regression tests added** (`src/server/commerce/__tests__/return-claim-lifecycle.test.ts`,
12 tests, real Postgres, no mocked domain functions):

- *Completed returns permanently block re-returning the same units*: a
  single fully-completed RETURN, a single fully-completed EXCHANGE, and
  two completed partial returns summing to the full quantity all
  correctly block a further attempt with `INSUFFICIENT_QUANTITY`.
- *Valid partial returns still work*: returning part of a line leaves the
  correct remainder eligible; requesting more than what remains is
  rejected (not silently truncated), with the correct `returnableQuantity`
  reported.
- *The fix itself*: rejecting/cancelling a REQUESTED return releases its
  claim (return becomes returnable again, and a second request now
  succeeds); cancelling an APPROVED return also releases its claim;
  rejecting one request never releases a sibling request's claim on the
  same item; a double reject and two concurrent reject attempts
  (`Promise.all`) each release the claim exactly once, never negative.

**Full regression**: `tsc --noEmit` clean; `eslint .` clean; full suite
846/846 passing (834 before this fix; 12 new, 0 broken); production build
(`next build`) clean; fresh-database verification clean — a throwaway
Postgres database had all 18 migrations applied with zero drift
(`prisma migrate diff --exit-code`), was seeded, and the full suite was
re-run against it (845/846 — the one failure is a confirmed pre-existing,
unrelated flake in `src/server/queries/admin/__tests__/customers.test.ts`
caused by an occasional random-UUID-slice collision with the literal
search string `"00"` in a test unrelated to this fix, and it passes in
isolation; no file this fix touches is involved). The throwaway database
was dropped afterward.

**Not changed**: no new features were added; no schema/migration was
needed (only existing-column write behavior changed).
