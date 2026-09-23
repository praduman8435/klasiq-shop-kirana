# Phase 2 — Real Checkout, Order Lifecycle & Inventory Correctness

Date: 2026-08-04

Builds on the committed Phase 1 baseline (`2feece257a1c69d5646094961da5332e5d6fa657`).
Read [`docs/PHASE_0_AUDIT.md`](./PHASE_0_AUDIT.md) and
[`docs/PHASE_1_REPORT.md`](./PHASE_1_REPORT.md) first — this document only
covers what changed.

## What was built

A real, atomic, guest checkout that replaces the Phase 1 "checkout launching
soon" stopping point:

- `/checkout` — contact details, Store Pickup / Local Delivery choice,
  conditional delivery address, a static payment info card, and a live
  order summary that surfaces price changes since the item was added to the
  bag.
- Server-authoritative order placement (`placeOrderForBasket`) that
  re-validates stock and re-prices every line from the database inside a
  single transaction, atomically decrements inventory, and is safe under
  concurrent requests and duplicate submissions (see below).
- `/order/[orderNumber]/[token]` — a real confirmation page, reachable only
  with both the human-friendly order number and an unguessable access
  token. Refreshing it, or opening the link in a browser with no cookies at
  all, both work — it's not tied to the basket session.
- `/order/[orderNumber]` (no token) — an explanatory page instead of a bare
  404 or, worse, a lookup that only needs the guessable order number.
- Order status lifecycle and payment status validators
  (`src/lib/order-lifecycle.ts`), fulfillment-aware, fully unit tested.
  Nothing mutates an order's status yet (no admin UI — out of scope per the
  brief) — this exists so Phase 3's admin UI has a correct rule to build on.
- A fulfillment/delivery-fee configuration boundary
  (`src/lib/fulfillment-config.ts`), env-backed since no admin settings
  system exists yet.
- A WhatsApp-friendly plain-text order summary formatter
  (`src/lib/order-message.ts`) — no messaging integration, just the
  data→text boundary so one doesn't need inventing under time pressure later.

## Schema changes

Full annotated source: `prisma/schema.prisma`. Migration:
`prisma/migrations/20260803200413_phase2_checkout_orders/`.

- **`Order`**: added `accessToken` (unique, required), `idempotencyKey`
  (unique, nullable), `paymentStatus` (new `PaymentStatus` enum, default
  `UNPAID`), `subtotalInPaise`, `deliveryFeeInPaise`. Replaced the single
  `deliveryAddress` field with three: `deliveryAddressLine`, `deliveryArea`,
  `deliveryLandmark` — matching the brief's Address/Area/Landmark structure
  and making it possible to render each on the confirmation page distinctly.
- **`OrderItem`**: added `productId` (nullable, `SetNull`, convenience
  reference only), `skuSnapshot`, `lineTotalInPaise`. `productName`, `size`,
  `unitPriceInPaise` already existed from Phase 1's forward-looking schema.
- **`Basket`**: added `status` (`BasketStatus`: `ACTIVE` | `CONVERTED`) and
  `convertedOrderId` (unique, nullable, `Order?` relation) — see "Basket
  conversion strategy" below.
- **`BasketItem`**: added `priceInPaiseAtAdd` — a snapshot used only to
  detect and display "price changed since you added this," never to compute
  totals.
- New enums: `PaymentStatus` (`UNPAID`/`PAID`/`REFUNDED`/`FAILED` —
  `FAILED` unused by this phase's COD-only flow, included now so a future
  online-payment integration doesn't need another migration), `BasketStatus`.

**Data-loss note**: `basket_items.priceInPaiseAtAdd` and `orders.accessToken`
are `NOT NULL` with no default. Both tables were empty of anything except
ephemeral Phase-1 manual-testing rows (0 real orders existed — Phase 1
explicitly never created any), so I truncated `baskets`/`basket_items`
before migrating rather than backfilling fabricated values. This is called
out explicitly per the instruction to migrate carefully and document why;
it did not touch `schools`, `products`, `product_variants`, or any catalog
data.

## Order architecture

`src/server/commerce/place-order.ts` (`placeOrderForBasket`) is the single
path that creates an `Order`. It's deliberately framework-agnostic — no
`cookies()`/`next/headers` import — so it's directly callable from
integration tests with a plain basket id. `src/server/actions/checkout.ts`
(`placeOrder`, a `"use server"` action) is the thin, cookie-reading wrapper
the `/checkout` page actually calls; it validates input with
`checkoutInputSchema` and delegates everything else.

This mirrors the Phase 1 pattern of keeping pure/testable domain logic
(`basket-math.ts`) separate from thin server-action wrappers — same shape,
now used for the highest-stakes code path in the app.

## Inventory transaction strategy (how overselling is prevented)

`placeOrderForBasket` runs everything — re-validation, stock decrement,
pricing, order creation, basket conversion — inside one
`db.$transaction(async (tx) => { ... })`. Two layers:

1. **Up-front check** across all basket items, purely to report every
   unavailable item at once (a good error message, not a correctness
   mechanism).
2. **Guarded decrement**, which is what actually prevents overselling:

   ```ts
   const decrement = await tx.productVariant.updateMany({
     where: { id: item.productVariantId, stockQuantity: { gte: item.quantity } },
     data: { stockQuantity: { decrement: item.quantity } },
   });
   if (decrement.count === 0) throw new PlaceOrderDomainError({ type: "STOCK_ISSUE", ... });
   ```

   `updateMany` with a `gte` guard compiles to a single conditional
   `UPDATE ... WHERE id = $1 AND "stockQuantity" >= $2`. Postgres evaluates
   that `WHERE` clause against the row's value at the moment the UPDATE
   actually executes — if a second transaction is racing for the same row,
   Postgres blocks it at the row lock until the first transaction commits
   (or rolls back), then re-evaluates the guard against the now-current
   value. Two concurrent transactions can never both successfully decrement
   the last unit. If the guard fails, the whole transaction throws and rolls
   back — no partial order, no partial decrement, matching "order creation
   should be all-or-nothing."

**Alternatives considered:**
- *Read stock, check in application code, then write* — explicitly the
  anti-pattern the brief warns against (TOCTOU race: nothing stops two
  requests both reading "1 in stock" before either writes).
- *`SELECT ... FOR UPDATE` then a plain `UPDATE`* — equally correct, but the
  guarded `updateMany` achieves the same row-lock-and-recheck behavior in
  one statement instead of two round trips, and needs no raw SQL.
- *Serializable transaction isolation* — would also work, but forces retry
  logic for serialization-failure errors across the whole transaction
  (including the order-number collision path), which is more moving parts
  for no additional safety here — the guarded UPDATE already gives
  correctness at the default READ COMMITTED level.

This is proven, not just argued: `src/server/commerce/__tests__/place-order.test.ts`
has a real Postgres integration test that creates a variant with
`stockQuantity: 1`, fires two concurrent `placeOrderForBasket` calls for two
different baskets via `Promise.all`, and asserts exactly one succeeds, the
other gets a structured `STOCK_ISSUE`, and the final stock is `0` (never
negative). It's been re-run repeatedly during this phase with no flakiness —
correct by construction (Postgres row locking), not by timing luck.

## Idempotency strategy

Three layers, from cheapest/most-common to safety-net:

1. **Client-side**: the checkout form generates one `idempotencyKey`
   (`crypto.randomUUID()`) via `useState(generateIdempotencyKey)` when the
   page mounts, and resends it unchanged on every submit attempt (including
   retries after an error). The submit button disables while a request is
   in flight. This is UX, not the safety mechanism.
2. **Pre-check**: `placeOrderForBasket` looks up `Order.idempotencyKey`
   before doing any work; if found, it returns that existing order
   (`alreadyExisted: true`) instead of creating anything.
3. **DB unique constraint + recovery**: `Order.idempotencyKey` is unique.
   Two truly concurrent submissions with the same key can both pass check
   #2 before either commits — the loser hits the unique constraint at
   insert time inside the transaction, which rolls back its (already
   redundant) stock decrement, and the outer catch recognizes the specific
   P2002-on-`idempotencyKey` error and returns the winner's order instead of
   a 500.

Layer 3 is what actually makes this safe under a genuine race, and it's the
one covered by its own test — not just the sequential "call it twice"
case, but `Promise.all` of two truly concurrent calls with the *same*
idempotency key, asserting exactly one `Order` row exists and stock was
decremented exactly once.

I initially assumed the concurrent-same-key race was narrow enough to not
need its own test (real double-taps are usually microseconds-to-milliseconds
apart, plenty of time for React to disable the button). A manual browser
test using two `dispatchEvent("click")` calls back-to-back in the same tick
proved otherwise: the `isPending` guard reads a stale closure value if
React hasn't re-rendered between the two synchronous clicks, so the client
genuinely can send two concurrent requests with the same key. (My first
attempt at reproducing this manually was inconclusive — comparing two
separate script runs made it look like the client sent two *different*
keys, which would have been a client bug; a clean, isolated re-run showed a
single key, single order, and confirmed the confusion was from mixing up
two script executions, not a real gap. I added the true-concurrency test
above specifically because that confusion made me want proof, not
assumption.)

## Basket conversion strategy

Considered three options: (a) delete the basket's items on successful
order, (b) delete the basket entirely, (c) flip a status flag and keep the
rows. Chose (c):

- `Basket.status` moves `ACTIVE → CONVERTED` and `convertedOrderId` is set,
  in the *same transaction* as order creation — never before it commits, so
  a failed checkout never leaves a basket in limbo.
- `getBasket()` (the read path used by `/bag`, `/checkout`, and the header's
  bag-count) returns `null` for a `CONVERTED` basket, so the UI immediately
  and correctly treats it as empty — no separate "is this basket usable"
  check scattered across callers.
- `getOrCreateBasketId()` mints a fresh `ACTIVE` basket (and cookie) if the
  existing cookie points at a `CONVERTED` one, so adding something new after
  a purchase transparently starts a new bag.
- `placeOrderForBasket` treats a `CONVERTED` basket as "already ordered" and
  returns the existing order rather than erroring or creating a duplicate —
  this is what makes a stale checkout tab (back button after purchase, or a
  slow network retry) resolve to the original order instead of a second one.

Deleting rows (options a/b) was rejected because it destroys the only
record of what a basket contained if anything ever needs debugging, and
because "did this basket already convert" becomes a query against absence
rather than a simple status check.

## Order-number strategy

`ORD-YYYYMMDD-XXXXX` (`src/lib/order-number.ts`), where the 5-character
suffix is drawn from a 30-character alphabet with visually-confusable
characters removed (`0`, `O`, `1`, `I`, `L`) — chosen so a shop assistant
reading it back over a phone call doesn't have to guess which letter someone
said. Uniqueness is **not** claimed by the generator — it's enforced by the
`orderNumber` unique constraint, with `placeOrderForBasket` retrying with a
fresh number (up to 5 attempts) only on an actual collision. This avoids the
brief's explicitly-flagged "count + 1" trap entirely: there is no read of
"how many orders exist today" anywhere in the code.

## Order lookup security

The order number is deliberately human-readable and (within a given day)
has a small-ish keyspace — safe for what it's *for* (something a customer
reads to staff over the phone) but not safe as the sole key to a page
containing a name, mobile number, and home address. Considered:

- *Order number alone, treat it as a secret* — rejected outright; it's
  designed to be read aloud and typed by hand, the opposite of secret.
- *Require a login to view orders* — rejected; the brief is explicit that
  guest checkout is the default and no accounts exist.
- **Chosen: order number + a separate unguessable access token**
  (`src/lib/order-access-token.ts`, 24 bytes of CSPRNG output,
  base64url-encoded), both required, as `/order/[orderNumber]/[token]`.
  `getOrderByNumberAndToken` treats a token mismatch identically to an
  unknown order number (`notFound()` either way) — it never reveals "the
  order number is real, but your token is wrong."

`/order/[orderNumber]` (no token) is its own page rather than falling
through to the token route with an empty segment, specifically so it can
explain *why* the link doesn't work instead of a bare 404 that looks like a
broken app.

## Validation approach

`src/lib/validation/checkout.ts` (zod): name and mobile always required
(loose Indian mobile pattern, accepts an optional `+91`/`91` prefix and
stripped spaces/hyphens); `fulfillmentType` restricted to the two known
enum values (the client cannot invent a third); delivery address/area
required only via `superRefine` when `fulfillmentType === "LOCAL_DELIVERY"`;
`idempotencyKey` must be a UUID. **Payment method is not a client input at
all** — the server always sets `CASH_ON_DELIVERY`; since Phase 2 supports
exactly one payment method, letting the client submit one at all would just
be an unnecessary surface for "arbitrary payment method" tampering with no
corresponding feature behind it.

## Status lifecycle

`src/lib/order-lifecycle.ts`. `OrderStatus` transitions are fulfillment-aware:
`READY_FOR_PICKUP` is only reachable for `STORE_PICKUP` orders,
`OUT_FOR_DELIVERY` only for `LOCAL_DELIVERY`; `DELIVERED`/`CANCELLED` are
terminal (nothing transitions out). `PaymentStatus` is a fully independent
lifecycle (`UNPAID → PAID → REFUNDED`, `UNPAID → FAILED → UNPAID` for a
retried future online payment) — "order confirmed" and "payment collected"
are different facts and nothing in this codebase conflates them. Every COD
order is created `PENDING` / `UNPAID`. Nothing calls these transition
functions from a mutating endpoint yet — there's no admin UI in Phase 2 —
they exist now, fully tested, so Phase 3 has a correct rule instead of
needing to invent one under deadline pressure.

## Tests added

`npm test` → **107 tests passing** (81 from Phase 1 + 26 new), all in
`src/**/__tests__/`:

- `order-lifecycle.test.ts` — every valid pickup/delivery transition, every
  fulfillment-mismatched rejection (pickup→`OUT_FOR_DELIVERY`,
  delivery→`READY_FOR_PICKUP`), terminal-state rejections, payment-status
  transitions both directions.
- `fulfillment-config.test.ts` — delivery fee at/above/below the free
  threshold, always-zero for pickup.
- `order-number.test.ts` — date embedding, format validation, no
  confusable characters, statistical uniqueness sanity check.
- `order-message.test.ts` — WhatsApp-message formatting, fulfillment/payment
  labels.
- `validation/checkout.test.ts` — pickup without address (passes), delivery
  without address/area (fails, field-specific), invalid/valid mobile
  formats, invalid fulfillment type rejected, missing/malformed idempotency
  key rejected.
- `server/commerce/__tests__/place-order.test.ts` (real Postgres
  integration, 13 tests) — successful pickup order, successful delivery
  order with fee, free delivery over threshold, snapshot integrity against
  later product edits, server-authoritative pricing when price changed
  after add-to-bag, empty-basket rejection, null-basket rejection,
  out-of-stock rejection, insufficient-quantity rejection (with correct
  item/size/quantities in the error), sequential idempotent resubmission,
  stale-tab resubmission with a different key on an already-converted
  basket, **and the true concurrent same-key race**, plus the concurrent
  final-unit-of-stock race.

## Manual browser verification

Dev server + headless Chromium, both journeys end-to-end with zero console
errors at every step:

- **Store Pickup** (desktop, 1440×900): school page → size 24 White Shirt →
  Add to Bag → `/bag` → Proceed to Checkout → Store Pickup → Place Order →
  real `/order/[orderNumber]/[token]` confirmation showing the order
  number, items, subtotal/total, "Store Pickup", "Pay at Store", "Unpaid".
  Refreshed the confirmation page (still works) and opened the exact URL in
  a brand-new browser context with zero cookies (still works — confirms
  it's not session-bound).
- **Local Delivery** (mobile, 390×844): Grey Pant → checkout → Local
  Delivery tab → address + area → confirmed delivery fee shown, "Cash on
  Delivery" label, confirmation page shows the address and "Local Delivery".
- **Empty basket checkout**: direct visit to `/checkout` with nothing in
  the bag shows a real empty state, not a crash.
- **Invalid input**: garbage mobile number rejected with an inline
  field-level error; entered name was preserved (no data loss on error).
- **Price changed between add-to-bag and checkout**: updated a variant's
  price in the DB after adding it to the bag; the checkout page showed
  "Price updated from ₹150 to ₹250" on that line, and the total reflected
  the new price.
- **Out-of-stock between add-to-bag and checkout**: zeroed a variant's
  stock in the DB after adding it to the bag; Place Order was rejected with
  "School Socks (Pair) (Size S...): only 0 available, you requested 1,"
  a link back to the bag, and confirmed zero orders were created for that
  attempt.
- **Double-tap**: dispatched two synchronous click events at the Place
  Order button; exactly one order was created (confirmed both via the UI
  and directly in the database).
- Checked the browser console after every step above — no errors or React
  warnings at any point.

## Known limitations

- **Multi-school baskets** pick the first school-specific item's school as
  the order's `schoolId` — a documented simplification (nothing in the UI
  encourages mixing two schools' exclusive items in one basket; this only
  affects an analytics/display convenience field, never correctness).
- **No admin UI** to transition order status or payment status — the
  domain logic exists and is tested, nothing calls it yet.
- **No online payment.** COD/pay-at-store only, by design for this phase.
  `PaymentMethod.UPI` and `PaymentStatus.FAILED` exist in the schema,
  unused, specifically so adding real payment later doesn't need another
  migration.
- **No WhatsApp/SMS delivery of the confirmation message** — the formatter
  exists (`order-message.ts`), nothing sends it anywhere yet.
- **Mobile number format is India-specific** and loose (no OTP/verification)
  — matches "collect only information actually needed," not a KYC check.
- **Delivery fee is a single flat rate**, no distance/zone-based
  calculation — matches "this is a local retail shop," not a shipping
  engine.

## What remains for Phase 3

1. Admin dashboard: schools, products/variants, inventory, and — now that
   the domain logic exists — order management using
   `isValidOrderStatusTransition`/`isValidPaymentStatusTransition` rather
   than ad hoc status writes.
2. QR code generation/download per school.
3. Wiring `order-message.ts` into an actual WhatsApp/SMS send.
4. Real online payment (UPI), using the `PaymentStatus`/`PaymentMethod`
   schema headroom already in place.
5. Order status visibility for the parent (beyond the initial confirmation
   page) — e.g. re-fetching the same `/order/[orderNumber]/[token]` URL
   already shows live status, but nothing proactively notifies them of a
   change yet.

## Verification gate

```
$ npm run typecheck   → clean
$ npm run lint        → clean
$ npm test            → 107/107 passed
$ npm run build       → succeeds, 13 routes (/checkout, /order/[orderNumber],
                         /order/[orderNumber]/[token] all present as ƒ dynamic)
```

Dev database reset to a clean seeded baseline after manual testing
(`TRUNCATE orders, order_items, baskets, basket_items` + re-run
`prisma/seed.ts`) — no leftover test orders or decremented stock from this
phase's manual verification remain.
