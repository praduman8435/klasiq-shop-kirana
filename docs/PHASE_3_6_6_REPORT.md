# Phase 3.6.6 — Customer Address & Invoice Foundation

## Part 1 — Customer Address Foundation & Invoice Architecture

Date: 2026-08-09

Lays the data foundation for professional customer invoicing, without
building any invoice OUTPUT yet (no PDF, no print, no WhatsApp delivery,
no download — all explicitly deferred to later parts). Counter Sale gains
an entirely optional customer/invoice address — for a Guest, a free-typed
one-time entry; for a Customer, a choice between their saved address and
a one-time override that never touches the saved record. Every order
permanently snapshots whichever address applied, independent of the
Customer's own, separately-mutable profile. A new, dedicated invoice
domain layer (`src/server/commerce/invoice.ts`) reads exclusively from
that immutable Order/OrderItem snapshot data — never a live join to
Customer, Product, ProductVariant, or School — and becomes the one
function every future PDF/Print/WhatsApp/Download output must reuse.

## Audit of the current implementation (before writing any code)

- **`docs/PHASE_3_3_REPORT.md`** — read in full for the established
  "snapshot, not live reference" philosophy this phase had to extend
  consistently, not reinvent. Its own words (Part 2, "Order snapshot
  design"): a historical order must be "fully explained... without
  another [live] call," and the reasoning explicitly favors
  recompute-and-snapshot over a signed-but-still-unverified quote,
  because "the stored snapshot is always provably correct at the moment
  of order creation." The SAME report also establishes the
  `deliveryAddressLine`/`deliveryArea`/`deliveryLandmark` (free-text,
  "what the delivery person needs") vs.
  `deliveryLatitude`/`deliveryLongitude`/`deliveryFormattedAddress`/
  `deliveryRouteDistanceMeters` (geocoded, "what determines the fee")
  split — confirming, by contrast, that this phase's NEW customer-postal-
  address concept is a genuinely different thing from delivery logistics
  and needed its own, clearly-named fields rather than reusing or
  overloading the delivery ones (see "Address strategy" below).
- **`docs/PHASE_3_6_REPORT.md`** — read in full; turned out to be
  entirely the Phase 3.6 WhatsApp Business Cloud API integration (OTP,
  order/return notification templates, a final Notification Matrix
  audit). Zero discussion of the Admin Order Detail page's layout
  philosophy, invoices, or admin customer management — the brief's
  citation pointed here for context that doesn't live in this document.
  The equivalent "what does the Order Detail page already show, and why"
  material instead lives in `docs/PHASE_3_3_REPORT.md` Part 3 ("Admin
  order visibility"), which documents this codebase's actual "avoid
  clutter" precedent: add exactly what closes a demonstrated gap
  (WhatsApp number wasn't shown; a raw lat/lon pair was rendered with no
  way to act on it, fixed with a plain map-search link), never something
  speculative, and never expose a raw value that only exists to compute
  something else.
- **`docs/PHASE_3_6_5_REPORT.md`** — the whole KhataBook/Payment/Ledger
  initiative this session already built (Parts 1–6), reviewed for its
  own precedents this phase had to match: the discriminated-union
  `{mode, ...}` shape for optional inputs (`DiscountInput`,
  `PaymentInput`), the pure-DB-free-computation-module convention
  (`src/lib/discount.ts`, `src/lib/payment.ts`,
  `src/lib/receive-payment.ts`), the "resolve server-side from a fresh
  read, never trust a client-echoed value" security convention, and the
  ownership-scoped customer-portal query pattern
  (`getOrderForAuthenticatedCustomer`).
- **`prisma/schema.prisma`** — confirmed directly (not from any doc)
  that `Customer` has NO address field of any kind today (only
  `customerId`, `displayName`, phone/WhatsApp pairs, `active`,
  `lastOrderAt`), and that there is no dedicated `Address` model/table
  anywhere in this schema — address-shaped data exists only as flat
  `Order.delivery*` columns. This is a genuine greenfield area.
- **`src/server/commerce/customer.ts`** — confirmed
  `findOrCreateCustomerByPrimaryPhone`/`createCustomerInline`/
  `updateCustomerContactInfo` are the only three customer-mutation
  functions in this codebase, and that none of them know about address
  at all — `createCustomerInline`'s existing "apply an optional field
  ONLY on genuine creation" pattern (already used for `whatsappPhone`)
  is the exact template this phase's address-at-creation logic needed
  to mirror, not reinvent.
- **`src/lib/validation/admin-counter-sale.ts`**,
  **`src/components/admin/counter-sale-customer-panel.tsx`** — confirmed
  the inline "customer not found, create one" form collects exactly
  Name/Phone/WhatsApp today, with no address field, and that
  `createCounterSaleCustomerSchema` has no such field either.
- **`src/app/admin/(protected)/orders/[orderNumber]/page.tsx`** and its
  query, **`getAdminOrderByNumber`** (`src/server/queries/admin/orders.ts`)
  — confirmed the query uses `include` (never a restricting `select`),
  so every new `Order` column added this phase is automatically
  available with zero query-layer changes; and confirmed exactly where
  a new Address display would fit inside the existing "Customer" card
  without duplicating the sibling "Delivery Address" card's own,
  unrelated concept.
- Grepped `src/` for "invoice" (case-insensitive): **zero matches**. No
  invoice-related code, type, or component existed anywhere before this
  phase — built from scratch.
- Grepped for "GST"/"gst" and "QR": zero genuine matches (only
  substring false-positives, e.g. "TrackingStage" containing "ngSt").
  `docs/PHASE_3_3_REPORT.md` itself already documented "GST-ready, not
  GST-implemented" as known architecture debt — confirming section 14's
  "GST calculations" is correctly out of scope, with nothing partially
  built to conflict with a later phase's real implementation.

## Address strategy (sections 2, 3, 4)

- **Two separate concepts, two separate field families, on purpose.**
  `Order.deliveryAddressLine`/`deliveryArea`/`deliveryLandmark`/
  `deliveryLatitude`/`deliveryLongitude`/`deliveryFormattedAddress`/
  `deliveryRouteDistanceMeters` (Phase 3.3) answer "where does a
  LOCAL_DELIVERY online order physically ship, and what did that cost to
  compute the fee." The new `Order.customerAddressLine`/
  `customerAddressCity`/`customerAddressState`/`customerAddressPincode`
  (this phase) answer a completely different question: "what is this
  customer's own postal address, for an invoice" — optional, Counter-Sale-only
  in practice, never geocoded, never priced against. Naming them
  `customerAddress*` (not reusing or extending `delivery*`) mirrors the
  existing `customerName`/`customerMobile`/`customerWhatsapp` snapshot
  family exactly, and makes the two concepts impossible to confuse in
  code or in the database schema.
- **`Customer.addressLine`/`addressCity`/`addressState`/`addressPincode`**
  — the customer's own SAVED address, all four nullable, mirroring
  `Customer`'s own "deliberately small... adding fields later is
  additive" doc comment precedent (Phase 3.1). Set **exactly once**, at
  genuine customer-creation time, via `createCustomerInline`'s existing
  "apply an optional field only when `wasCreated: true`" rule (already
  used for `whatsappPhone`) — never touched again by anything else in
  this codebase.
- **Section 4's explicit deferral, taken literally**: "If the user
  explicitly wants to update their saved address in the future, that
  will be a different feature." There is NO edit-saved-address mutation
  anywhere in this phase — not on `Customer`, not via
  `updateCustomerContactInfo` (deliberately left untouched; its name and
  scope stay "contact info," not "profile"), not anywhere. The ONLY way
  a `Customer`'s saved address is ever set is the one moment it's
  created. A one-time address entered for an ALREADY-EXISTING customer
  (whether or not they have a saved address yet) is used for that ONE
  order's own snapshot and nowhere else — proven by construction
  (`createCounterSale`'s transaction never issues a `customer.update`
  touching address fields) and directly by test (see "Testing" below).
- **Counter Sale form UX**: a new "Address (optional)" section, right
  after "Customer." Guest, or a Customer with no saved address yet, sees
  four plain optional fields (Address Line, City, State, PIN Code) —
  section 3's "if left blank, no validation, sale continues normally" is
  satisfied by there being no required-field check anywhere in this
  path, not even a discount/payment-style "type chosen but not yet
  resolved" block (there is nothing to resolve — a blank field is simply
  blank). A Customer WITH a saved address instead sees a two-button
  toggle mirroring the existing Full/Partial Payment and Discount-type
  button style exactly — "Use Saved Address" (default, shown read-only,
  zero extra clicks for the common repeat-customer case) or "Enter
  One-Time Address" (reveals the same four blank fields). Selecting a
  DIFFERENT customer (or switching to Guest) always resets this panel to
  reflect that customer's own address state, never carrying over a
  previous selection.
- **Server-side resolution never trusts the client's echoed saved
  address.** The submitted payload is a discriminated union —
  `{mode: "NONE"}` / `{mode: "SAVED"}` (no address fields at all) /
  `{mode: "ONE_TIME", addressLine?, city?, state?, pincode?}` — mirroring
  `PaymentInput`'s/`CounterSaleCustomerInput`'s own exact shape.
  `mode: "SAVED"` carries no values; `createCounterSale` reads the
  customer's CURRENT saved address fresh (from the same customer row
  already resolved for `customerName`/`customerMobile`) and snapshots
  THAT — never anything the client could have sent. `mode: "SAVED"` for
  a Guest is rejected server-side (`ADDRESS_SAVED_REQUIRES_CUSTOMER`,
  mirroring Part 3's `PARTIAL_PAYMENT_REQUIRES_CUSTOMER` exactly) as
  defense-in-depth, even though the UI structurally never offers that
  combination in the first place (a Guest's `savedAddress` prop is
  always `null`).
- **`src/lib/counter-sale-address.ts`** — a new pure, DB-free module
  (`resolveCounterSaleAddressSnapshot`), mirroring `src/lib/discount.ts`/
  `src/lib/payment.ts`'s exact convention: independently unit-testable,
  reused identically by the server's authoritative resolution. Unlike
  discount/payment, an address has no business rule to enforce (no
  format validation, no range check) — so, unlike those two, this
  function never returns an error; it only ever resolves which values to
  use.

## Snapshot strategy (section 5)

`Order.customerAddressLine`/`customerAddressCity`/`customerAddressState`/
`customerAddressPincode` are written EXACTLY ONCE, at Counter Sale
creation, from whichever source (`SAVED` or `ONE_TIME`) the sale
resolved to — identical immutable-snapshot convention to
`customerName`/`customerMobile`/`customerWhatsapp` (Phase 3.1/3.3) and
`amountReceivedInPaise`/`outstandingInPaise` (Phase 3.6.5 Part 3). Proven
directly, not just asserted: a dedicated "historical address stability"
test creates a sale using a customer's saved address, then DIRECTLY
mutates that customer's row (simulating a hypothetical future "edit
saved address" feature, which does not exist yet) and confirms the
already-placed order's own snapshot is completely unchanged. The same
proof is repeated one layer up, against the invoice domain layer itself
— see "Testing" below — confirming the guarantee holds all the way
through to what an eventual PDF/print output would actually read.

## Order snapshots review (section 6)

Audited every field an invoice would need, against what `Order`/
`OrderItem` already persist:

- **Already complete, no change needed**: order identity (`orderNumber`,
  `createdAt`), source/fulfillment (`source`, `fulfillmentType`),
  customer contact snapshot (`customerName`/`customerMobile`/
  `customerWhatsapp`, Phase 3.1/3.3), every money figure (`subtotalInPaise`,
  `discountType`/`discountValue`/`discountReason`/`discountInPaise`
  Phase 3.6.5 Part 2, `deliveryFeeInPaise`, `totalInPaise`,
  `amountReceivedInPaise`/`outstandingInPaise` Phase 3.6.5 Part 3,
  `paymentMethod`/`paymentStatus`), and every line item
  (`productName`/`size`/`skuSnapshot`/`unitPriceInPaise`/`quantity`/
  `lineTotalInPaise`/`effectiveLineTotalInPaise`, Phase 1 + Phase 3.6.5
  Part 2) — all already immutable snapshots, independently confirmed by
  this phase's own invoice-layer tests (see below).
- **Genuinely missing, added this phase**: the customer's own postal
  address — section 5's whole point, addressed by the four new
  `customerAddress*` columns above.
- **Considered, deliberately NOT added**: a `School.name` snapshot on
  `Order`. A school-uniform invoice arguably benefits from showing which
  school an order was for, and `Order` currently only stores a LIVE
  `schoolId` reference (a School rename would, in principle, retroactively
  change how an old order's school displays). Decided against adding a
  snapshot for it, for three concrete reasons: (1) section 8's own
  explicit "never read" list (current Product price, current Product
  name, current Customer address, current Inventory) does NOT include
  School name — the brief's own scope signal; (2) School rows in this
  system are shop-admin-curated reference data, not fast-churning
  personal information like a customer's own address — a rename is a
  rare, deliberate administrative event, not the normal case this phase
  is guarding against; (3) every prior phase across this entire session
  (3.1 through 3.6.5, six parts of audit work) has read `school.name`
  live in the Admin Order Detail page and elsewhere without this ever
  being flagged as a defect. Consequently, the new invoice domain layer
  (below) does not include a school field at all in this phase — kept
  consistent with this decision rather than adding one only to leave it
  unused.
- **Considered, deliberately NOT added**: an `AdminUser.name` snapshot
  for "processed by." Judged not genuinely invoice-relevant — a
  customer-facing invoice has no reason to name which staff member rang
  up the sale; that's an internal operational audit trail
  (`createdByAdminUserId`, already correctly `SetNull`-safe), not invoice
  content.
- **`Order.orderNumber`/`createdAt` double as the invoice's own
  reference number and date** — no separate "invoice number" sequence
  was introduced. Section 7's "never duplicate" is satisfied literally:
  there is nothing to duplicate, since the order already has both facts
  permanently.

## Invoice architecture (sections 7, 8)

- **`src/server/commerce/invoice.ts`** — `getInvoiceForOrder(orderNumber)`,
  THE single source of truth every future PDF/Print/WhatsApp/Download
  output must call. Reads ONLY `Order` (via `findUnique`) and its
  `OrderItem[]` (via the same query's `include`) — no join anywhere to
  `Customer`, `Product`, `ProductVariant`, or `School`. This is not a
  discipline or a convention to remember — it's structural: there is no
  code path in this function that COULD read any of those tables,
  because nothing is ever fetched from them. Confirmed empirically, not
  just by inspection: a dedicated test mutates the customer's name and
  address, the product's name, and the variant's price AFTER placing an
  order, then asserts the invoice recomputed from the same order number
  is **byte-for-byte (`toEqual`) identical** to the one captured before
  those mutations.
- **Deliberately returns raw, unformatted data** — paise integers, not
  "₹" strings; Prisma enum values, not display labels; no pre-rendered
  "10% off" discount label. Formatting is a presentation decision for
  whichever future renderer consumes this (a PDF layout, print HTML,
  WhatsApp plain text each need genuinely different formatting), and
  keeping it out of this layer is what makes "single source of truth"
  actually true — two future outputs can read the exact same numbers and
  never disagree about what happened, only about how to display it.
- **No authorization check of its own** — the same convention every
  other query function in this codebase already follows
  (`getAdminOrderByNumber`, `getKhataBookCustomerProfile`, etc.): the
  caller is responsible for having already verified the request is
  authorized. See "Security" below for exactly how each caller class
  satisfies that.

## Admin Order Detail review (section 9)

Added one small, conditionally-rendered block inside the existing
"Customer" card: an "Address" label followed by the address line and a
comma-joined city/state/pincode line, shown ONLY when at least one of
the four fields is actually present — the same "avoid clutter" judgment
`docs/PHASE_3_3_REPORT.md`'s own Part 3 already established for this
exact page. Deliberately labeled "Address," never "Delivery Address," so
it can never be confused with the sibling card's own, unrelated
Store-Pickup/Delivery/Counter-Sale block. No other admin-order-detail
change was made — everything else invoice-relevant was already
displayed there (subtotal, discount, Grand Total, Received/Outstanding,
items) per the "Order snapshots review" above.

## Security (section 10)

- **Admin**: every admin route (including the unchanged Order Detail
  page) is still gated by the single `getAdminSession()` check in
  `src/app/admin/(protected)/layout.tsx` — nothing about this phase
  changes that boundary. `getInvoiceForOrder` is callable freely from
  admin contexts precisely because the layout already gates the page
  that would call it, exactly like `getAdminOrderByNumber` today.
- **Customer Portal**: `src/server/queries/customer-portal/invoice.ts`
  adds `getInvoiceForAuthenticatedCustomer(orderNumber, customerId)`,
  mirroring `getOrderForAuthenticatedCustomer`'s exact shape
  (`src/server/queries/customer-portal/orders.ts`): ownership is checked
  in the SAME query that resolves the order (`customerId` inside the
  `WHERE` clause itself), so a syntactically valid order number
  belonging to a DIFFERENT customer returns `null` — structurally
  identical to "this order doesn't exist at all," never distinguishable
  by a caller or anyone probing it. `customerId` must come from the
  caller's own already-verified session; there is no other way for this
  function to select whose invoice it returns. Proven directly: an
  "IDOR resistance" test suite (mirroring
  `getOrderForAuthenticatedCustomer`'s own test file almost line for
  line) confirms Customer A can fetch their own invoice, Customer A
  requesting Customer B's order number by number gets `null`, a
  genuinely nonexistent order number gets the identical `null`, and a
  GUEST Counter order (no customer at all) is unreachable through this
  path even if its order number were somehow guessed.
- **Reuse, not a second calculation path**: `getInvoiceForAuthenticatedCustomer`
  performs ONLY the ownership check; it delegates the actual invoice
  assembly to `getInvoiceForOrder` unchanged. There is exactly one
  function in this codebase that computes invoice content — section 7's
  "never duplicate invoice calculations" holds for the authorization
  wrapper too, not just across future PDF/Print/WhatsApp outputs.
- Grepped the entire `src/server/queries/customer-portal/`,
  `src/server/actions/customer-portal/`, `src/components/customer-portal/`,
  and `src/app/(site)/` trees for `getInvoiceForOrder`: the ONLY match is
  the ownership-scoped wrapper itself calling it internally, after
  verifying ownership — confirmed there is no OTHER path by which
  customer-portal code could reach the unscoped, admin-level function
  directly.

## Testing (section 11)

- **`src/lib/__tests__/counter-sale-address.test.ts`** (10 tests) — the
  pure `resolveCounterSaleAddressSnapshot`: `NONE` always empty
  regardless of any saved address; `SAVED` returns exactly the given
  saved address, or the empty snapshot when there isn't one (never
  throwing); `ONE_TIME` uses exactly the given fields, trims whitespace,
  converts blank to `null`; a fully-blank `ONE_TIME` resolves identically
  to `NONE` (section 3's "no validation"); and a dedicated regression
  guard proving `ONE_TIME` never silently falls back to a saved address
  even when its own fields are blank.
- **`src/server/commerce/__tests__/counter-sale.test.ts`** (new "address"
  describe block, 8 tests, real Postgres) — Guest with a one-time
  address; Guest with no address at all (unchanged default); Guest
  requesting `SAVED` rejected with `ADDRESS_SAVED_REQUIRES_CUSTOMER`; an
  existing customer's `SAVED` mode snapshotting exactly their saved
  address (and leaving the customer's own row untouched); an existing
  customer's `ONE_TIME` address used for the order while their saved
  address remains completely unchanged (section 4's core guarantee); an
  existing customer with NO saved address entering a one-time address
  that never becomes their saved address; `SAVED` for a customer with no
  saved address resolving to an empty snapshot rather than failing; and
  the historical-address-stability test described above.
- **`src/server/commerce/__tests__/customer.test.ts`** (5 new tests,
  extending the existing `createCustomerInline` describe block) — a
  brand-new customer created with a saved address; created with none
  (unchanged default); an already-existing customer matched by phone
  NEVER has an address applied on a second call, even when one is given;
  a partial address (only some of the four fields) saves correctly with
  the rest `null`.
- **`src/server/commerce/__tests__/invoice.test.ts`** (new file, 5
  tests) — `null` for an unknown order number; a complete invoice
  assembled correctly from a discounted, partially-paid, addressed
  Counter Sale (every field cross-checked against the brief's own
  figures); a `null` address when none was ever provided; the
  byte-for-byte historical-stability proof against live Customer/Product/
  ProductVariant mutations described above; and a no-discount order
  showing `discountType: null`/`discountInPaise: 0`/equal effective and
  original line totals.
- **`src/server/queries/customer-portal/__tests__/invoice.test.ts`**
  (new file, 4 tests) — the full IDOR-resistance suite described under
  "Security" above.
- **`src/lib/validation/__tests__/admin-counter-sale.test.ts`** (14 new
  tests) — `createCounterSaleSchema`'s new `address` field (omitted,
  explicit `NONE`, `SAVED`, fully-populated `ONE_TIME`, fully-blank
  `ONE_TIME`, unknown mode rejected); `counterSaleAddressSchema` directly
  (over-length address line/pincode rejected, whitespace trimmed, `SAVED`
  silently ignores any extra fields rather than rejecting them); and
  `createCounterSaleCustomerSchema`'s new optional `address` object (no
  address, full address, partial address, over-length field rejected).

## Regression (Part 1)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 834/834 passing (up from 788 at the end of Phase
  3.6.5 Part 6 — 46 new tests this phase).
- `npm run build` (Turbopack) — succeeds; all 28 routes compile
  unchanged (this phase adds a data foundation only — no new route, per
  the brief's own explicit "do NOT implement... invoice download").
- **New migration**: `20260809100000_phase3_6_6_part1_address_invoice_foundation`
  — two plain `ALTER TABLE ... ADD COLUMN` statements (four nullable
  columns on `customers`, four nullable columns on `orders`) — no
  backfill needed, since every column is nullable and every pre-existing
  row simply never had a value for any of them. Re-verified per "protect
  every previous phase": created `shop_fresh_verify_366_p1`, applied all
  18 migrations, confirmed **zero drift** (`prisma migrate diff --exit-code`),
  ran `prisma/seed.ts` and `prisma/create-admin.ts` successfully, ran the
  full 834-test suite against it too (100% pass), then dropped the
  database.
- **Dev-server restart discipline**: this phase adds a schema migration,
  so the long-running dev server was killed, `prisma generate` re-run,
  and the server restarted before manual verification — the same lesson
  first learned in Phase 3.6.5 Part 2, re-applied here.
- Manual verification (no browser-automation tool in this environment,
  same disclosed limitation as every prior phase): after the restart
  above, a real, unmocked script against the live dev database exercised,
  end to end: (1) a Guest sale with a one-time address, snapshotted
  correctly; (2) a brand-new customer created inline WITH an address,
  confirming it becomes their saved address; (3) an existing-customer
  sale using `SAVED` mode, snapshotting exactly that saved address; (4)
  the SAME customer's next sale using a one-time address, confirming
  their saved address remained completely unchanged afterward; (5) a
  real HTTP fetch of the Admin Order Detail page (with a genuine minted
  admin session cookie), confirming the new Address section renders the
  correct street/city; (6) the invoice domain layer assembling a
  complete, correct invoice from Order/OrderItem alone; (7) the Customer
  Portal's ownership-scoped invoice accessor granting the true owner
  access and rejecting a different customer's attempt (an IDOR check);
  and (8) confirming that mutating the customer's saved address
  afterward never altered the invoice already computed for the earlier
  order. All 8 scenarios passed; all script-created data (orders,
  customers, product/variant, admin user/session, category) was deleted
  afterward, confirmed via direct row-count comparison against the
  shared dev database (`orders`: 8, `customers`: 5, `products`: 13 —
  unchanged before and after).

## Known limitations (Part 1)

- **No PDF generation, printing, WhatsApp invoice delivery, download, QR
  codes, or GST calculations** — all explicitly out of scope (section
  14), for later Parts of Phase 3.6.6 to build directly on top of this
  foundation.
- **No "edit saved address" feature** — a Customer's saved address can
  currently only ever be set once, at creation. Correcting a typo or
  moving house has no UI anywhere yet; this is section 4's own explicit,
  named deferral ("a different feature"), not an oversight.
- **No School name snapshot on Order** — reviewed and deliberately
  decided against (see "Order snapshots review" above); revisitable if
  a future invoice design genuinely needs school identity to survive a
  school rename.
- **The invoice domain layer has no caller yet** — `getInvoiceForOrder`/
  `getInvoiceForAuthenticatedCustomer` are fully built and tested, but
  no admin or customer-portal ROUTE calls them yet (there is nothing to
  display an invoice ON until Part 2+ builds PDF/Print/Download). This
  is the intended shape for a "foundation" phase — proven correct and
  ready, not yet wired to a user-facing surface.
- **Address fields have no format validation** (no pincode-shape check,
  no state-name validation against a real list) — a deliberate match to
  section 3's explicit "no validation," consistent with this being
  optional, non-critical display data rather than something the
  commerce engine computes against.
- **A Counter Sale's Address panel only ever offers "Use Saved" vs.
  "Enter One-Time"; there is no way to view or manage a customer's
  saved address from anywhere BUT the moment they're first created** —
  same deferral as "no edit saved address" above; a future KhataBook
  profile enhancement could surface it read-only without much
  additional work, but that is not this phase's job.

## Future Parts

Per the brief's own scoping, later Parts of Phase 3.6.6 are expected to
build, directly on top of this foundation, without altering it:

- **PDF generation** — a rendering layer consuming `getInvoiceForOrder`'s
  output unchanged.
- **Print** — an HTML/print-stylesheet view, same data source.
- **WhatsApp invoice delivery** — reusing the existing WhatsApp
  notification infrastructure (Phase 3.6) to send a rendered invoice.
- **Download** — an admin (and eventually customer-portal) action
  exposing a generated PDF.
- **QR codes / GST calculations** — both explicitly deferred (section
  14); GST in particular needs a real tax-rate/line-item model this
  phase deliberately does not invent.
- **Edit saved address** — the customer-address-management feature
  section 4 explicitly named as "a different feature."

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), and Phase 3.6.5 (all six parts) remain uncommitted together
in the working tree, per instruction, alongside this phase's own
changes. Phase 3.6.6 Part 2 has not been started — awaiting review.

## Part 2 — Professional Invoice Engine (PDF, Print & Download)

Date: 2026-08-09

Builds the invoice OUTPUT Part 1 deliberately deferred: a PDF invoice, a
dedicated print layout, and Download actions for both Admin and the
Customer Portal — all rendered from Part 1's `getInvoiceForOrder`/
`getInvoiceForAuthenticatedCustomer` unchanged. Explicitly out of scope
(section 16, matching Part 1's own "Future Parts" list): WhatsApp
delivery, GST, QR verification, Credit Notes, E-Invoicing.

### Audit of the current implementation (before writing any code)

- **`docs/PHASE_3_6_6_REPORT.md` Part 1** — read in full. Confirmed the
  invoice domain layer (`getInvoiceForOrder`/
  `getInvoiceForAuthenticatedCustomer`) was fully built and tested but
  had **no caller anywhere** — no PDF, no print route, no download
  action, exactly as Part 1 documented under "Known limitations." This
  phase's job is purely to build renderers/routes on top of that
  existing, unchanged foundation.
- **`docs/PHASE_3_6_5_REPORT.md`** — re-checked for reusable label/
  formatting precedent rather than inventing new ones: `formatPaise`
  (src/lib/money.ts), `getFulfillmentLabel`/`getPaymentMethodLabel`
  (src/lib/order-message.ts), and the existing "Received/Outstanding
  shown for Counter Sale only" display rule already used on the Admin
  Order Detail page.
- **`src/server/commerce/invoice.ts`**, **`src/server/queries/customer-portal/invoice.ts`**
  — read in full. Confirmed both are pure, already-tested, and reachable
  from exactly the right two authorization contexts (see Part 1
  "Security"). Neither needed to change except for one addition (see
  "Customer ID" below).
- **`src/app/admin/(protected)/orders/[orderNumber]/page.tsx`** and
  **`src/app/(site)/track/(protected)/orders/[orderNumber]/page.tsx`** —
  read in full to find exactly where new Invoice actions fit without
  duplicating anything already shown (subtotal/discount/Grand Total/
  Received/Outstanding/items were already there per Part 1's own "Order
  snapshots review").
  Also read **`src/app/admin/(protected)/layout.tsx`**,
  **`src/app/(site)/track/(protected)/layout.tsx`**,
  **`src/app/(site)/layout.tsx`**, and **`src/app/layout.tsx`** to
  understand exactly which chrome (AdminShell sidebar/topbar, storefront
  header/footer) wraps which routes, before deciding how to satisfy
  section 5's "no navigation, no admin chrome" for a print layout — see
  "Page architecture" below.
- Read **`node_modules/next/dist/docs/01-app/01-getting-started/15-route-handlers.md`**
  and **`.../03-file-conventions/route.md`** per this project's own
  AGENTS.md instruction ("read the relevant guide before writing any
  code... heed deprecation notices") — confirmed Route Handlers return
  plain Web `Response` objects with no Next-specific binary-response API,
  and that dynamic segment `params` is a `Promise` in this Next version
  (already the pattern every existing page in this codebase uses).
- Grepped `package.json`: **no PDF library, no headless-browser
  dependency, no `serverExternalPackages` config existed** before this
  phase — both were added fresh (see "PDF generation" below).

### Invoice architecture — section 2's "single invoice engine"

One data model, one set of formatting rules, two renderers:

- **`src/server/commerce/invoice.ts`** (`Invoice`, Part 1, unchanged in
  shape except one additive field — see "Customer ID") is the one and
  only source of invoice *data*.
- **`src/lib/invoice-presentation.ts`** (new) is the one and only source
  of invoice *formatting* — `getInvoiceNumber`, `formatInvoiceDate`,
  `getInvoiceSourceLabel`, `getInvoiceDiscountLabel`,
  `getInvoiceAddressLines`. Pure, DB-free, unit-tested, following the
  exact convention `src/lib/discount.ts`/`src/lib/payment.ts` already
  established. Both renderers below call these same functions for the
  same figures — a discount label or a formatted date can never read
  differently between the PDF and the Print/View page, only be drawn
  with different technology.
- **`src/server/commerce/invoice-pdf.ts`** (new) — `generateInvoicePdf`,
  a pure function `Invoice -> Buffer`, no DB access, no auth. Consumes
  `Invoice` + `invoice-presentation.ts` only.
- **`src/components/invoice/invoice-view.tsx`** (new) — `InvoiceView`, a
  presentational React component consuming `Invoice` +
  `invoice-presentation.ts` only, rendered **unchanged** by both the
  Admin invoice page and the Customer Portal invoice page — this is the
  literal, single shared component for View and Print (Download reuses
  the same PDF module instead, since a PDF byte stream and a DOM/CSS
  print layout are two different rendering technologies with no common
  code to share below the data/formatting layer — see "PDF generation"
  below for why this is the correct place to draw that line, not a
  compromise on section 2).
- No renderer ever recomputes a money figure, a discount amount, or a
  quantity — every number already exists on `Invoice`, verbatim from
  `Order`/`OrderItem`'s own snapshot columns.

### Customer ID — section 4's one addition to the Part 1 data model

Section 4 requires a "Customer ID" field the invoice must show, which
Part 1's `Invoice` type didn't have (Part 1 deliberately never joined to
`Customer` at all). Two options were weighed:

1. Add a new `Order.customerIdSnapshot` column (mirroring
   `customerName`/`customerMobile`), written at order-creation time in
   both `place-order.ts` and `counter-sale.ts`.
2. A narrow, explicit live join to `Customer`, reading `customerId`
   only.

Chose **option 2**. `Customer.customerId` (e.g. "KLQ-7A41K2") carries its
own schema doc comment: "Permanent, public-facing identifier... Never
changes, never recycled" — confirmed empirically too, by grepping every
`db.customer.update` call site in the codebase: none of them ever writes
to `customerId`. A live read of a value that structurally cannot change
carries none of the historical-accuracy risk Part 1's "never read
current Customer address/name" guarantee exists to prevent (that
guarantee is about data that genuinely drifts). Option 1 would have
re-opened Part 1's already-closed "snapshot foundation" scope during a
rendering-focused phase, for a value a second snapshot column can never
make any more correct than a live read already is. `getInvoiceForOrder`
now does `include: { customer: { select: { customerId: true } } }` —
`select`-scoped to that one field, so it remains structurally impossible
for this function to read any OTHER Customer field (name, address,
phone) — Part 1's actual guarantee (about genuinely mutable fields) is
completely intact. Null for a Guest order or a pre-Phase-3.1 order,
exactly like every other optional invoice field.

### PDF generation (section 4)

Chose **pdfkit** (pure Node.js, no native binary, no headless browser)
over Puppeteer/`@react-pdf/renderer`: this is a long-running Next.js
server process, not a serverless/edge function where a headless-Chrome
cold start would be tolerable, and pdfkit needs no extra system
dependency in the Docker/dev environment this project already runs in.
`generateInvoicePdf` builds a single-column A4 document: brand wordmark
as the placeholder logo (section 4/10 — "logo (placeholder if
necessary)"), Invoice No / Order No / Date, a "Billed To" block (Name,
Customer ID, Mobile, Address), Order Source / Payment Method /
Fulfillment, an Items list, Subtotal / Discount / Delivery Fee / Grand
Total, Received/Outstanding (Counter only — identical rule to the Admin
Order Detail page), and a footer (thank-you line + `getBackedByLine()`,
reusing the exact brand line already used elsewhere rather than writing
new footer copy). The fixed-height header uses absolute positioning; the
variable-length Items section deliberately uses pdfkit's own flowing-text
cursor (no explicit `x`/`y`) so a long item list auto-paginates onto a
second page with zero hand-rolled pagination logic — proven directly by
a 60-item regression test.

**Turbopack/bundling issue found and fixed**: the first real-server test
of the PDF route failed with `ENOENT: .../pdfkit/js/data/Helvetica.afm`.
pdfkit reads its bundled font-metric files from disk relative to its own
module directory at runtime; Next's default Server Component/Route
Handler bundling rewrites that directory away from a real on-disk path.
Fixed by adding `serverExternalPackages: ["pdfkit"]` to `next.config.ts`
— the same mechanism Next's own default list already uses for `sharp`,
`better-sqlite3`, and other filesystem/native-asset-dependent packages —
so pdfkit is `require()`'d natively instead of bundled. Confirmed fixed
by re-running the full manual verification suite (below) after adding
the config and restarting the dev server; without it, every PDF request
500'd.

### Page architecture (sections 5, 8) — why the invoice pages live outside every layout group

Section 5 asks for a print layout with "no navigation, no admin chrome."
Read `src/app/layout.tsx` (root — fonts + toast host only, deliberately
minimal), `(site)/layout.tsx` (adds the storefront header/footer to
EVERY route under `(site)`, including protected ones), and
`admin/(protected)/layout.tsx` (adds `AdminShell`'s sidebar/topbar to
every admin route). A print stylesheet that merely *hides* that chrome
at print time would still show it on screen, and "create a **dedicated**
print layout" (section 5's own wording) reads as asking for a genuinely
separate view, not a CSS override of the existing chrome-laden page.

Both new invoice pages therefore live as siblings OUTSIDE their app's
route group — `src/app/admin/orders/[orderNumber]/invoice/page.tsx`
(sibling to `admin/(protected)/`, exactly like the existing
`admin/login/page.tsx`) and `src/app/track/orders/[orderNumber]/invoice/page.tsx`
(sibling to `(site)/track/(protected)/`) — so neither ever inherits
`AdminShell` or the storefront header/footer, on screen or at print
time, by construction. Next.js route groups don't affect the URL, and
`invoice` is an additional path segment beyond `[orderNumber]`, so
neither new route conflicts with its sibling's own `page.tsx`.

The direct consequence: since Route Handlers and standalone pages are
never covered by a *different* route's layout gate, both new pages and
both new PDF Route Handlers each re-implement the exact same
`getAdminSession()`/`getCustomerSession()` check their sibling
layouts already perform — not a new pattern, the same one-call gate
every protected layout already uses, just inlined instead of inherited.

Print margins (`@page { margin: 1.5cm; }`) are set once in
`globals.css` under `@media print`; the on-screen action row
(Back/Print/Download) uses Tailwind's built-in `print:hidden` utility so
those buttons never appear in the printed/PDF-saved output — section 5's
"no unnecessary buttons," satisfied for the browser-print path
specifically, without a second component.

`InvoiceView` is deliberately fixed to `bg-white`/`text-neutral-*`
literal colors, never the theme's `bg-background`/`text-foreground`
tokens — a real invoice should look identical regardless of the
viewer's dark-mode preference, exactly like it would on actual paper.

### Admin (section 8)

The Admin Order Detail page gained one new "Invoice" card (placed after
the existing Payment section, before Customer/Delivery — the same
"exactly what closes a demonstrated gap, nothing speculative" placement
discipline Part 1 followed) with three plain links: **View Invoice**
(→ the invoice page), **Print** (→ the invoice page with `?print=1`,
which `InvoiceActions` reads via the page's own `searchParams` prop —
never `useSearchParams()`, so no `Suspense` boundary is needed — and
fires `window.print()` once on mount), and **Download PDF** (a direct
`<a download>` to the PDF Route Handler, no intermediate page at all).
All three are plain links/anchors, not client-side actions with a
pending state — none of the three need one, since Print and Download
each just navigate to a URL that performs the entire action itself.

### Customer Portal (section 7)

The Track Order page gained a matching "Invoice" section with **View
Invoice** and **Download Invoice** (no Print action required by section
7, though the invoice page itself still has one for free, being the same
shared `InvoiceActions` component — no harm in a customer using their
browser's own print function). Both delegate to
`getInvoiceForAuthenticatedCustomer`, so the exact same IDOR boundary
Part 1 already built and tested applies to the new page and PDF route,
not a second one.

### Invoice Number (section 9)

**Decision: still equal to the Order Number — no independent invoice
number sequence introduced.** This affirms Part 1's own already-made
decision (documented there under "Order snapshots review":
"`Order.orderNumber`/`createdAt` double as the invoice's own reference
number and date — no separate 'invoice number' sequence was
introduced") rather than re-litigating it; Part 2 centralizes it as code
via `getInvoiceNumber()` in `src/lib/invoice-presentation.ts` so both
renderers display the exact same value under an "Invoice No" label,
without either one hard-coding which field that means.

Deferring an independent sequence remains correct for the same reason
Part 1 gave: nothing in this codebase currently needs an invoice number
that can diverge from the order number (no multi-invoice-per-order
splitting, no credit notes, no re-issued invoices). The point section
14/16 flags as the actual future trigger — GST/e-invoicing compliance,
which typically mandates its own sequential, gap-free, financial-year-
scoped numbering distinct from an internal order number — is explicitly
out of scope for this phase (section 16) and remains the one concrete
condition that should force a real, independent invoice-number sequence
later. Introducing one now, with no compliance requirement driving its
exact shape, would be exactly the "unnecessary complexity" section 9
warns against.

### Security (section 12)

- **Admin**: the new page and PDF route each call `getAdminSession()`
  directly (see "Page architecture" above for why); unauthenticated
  access redirects (page) or 401s (route), proven directly against a
  real running server, not just asserted.
- **Customer Portal**: the new page and PDF route each call
  `getCustomerSession()` and delegate entirely to
  `getInvoiceForAuthenticatedCustomer` for ownership — a syntactically
  valid order number belonging to a DIFFERENT customer 404s identically
  to a genuinely nonexistent one, both on the page and on the PDF route,
  proven directly (see "Testing" below).
- **No internal identifiers ever exposed**: the `Invoice` type only ever
  carries `orderNumber` and the public `Customer.customerId` — the
  internal `Order.id`/`Customer.id`/`OrderItem.id` cuids are never read
  by the invoice layer at all, so there is no code path by which a PDF,
  print page, or filename (`Invoice-${orderNumber}.pdf`, never an
  internal id) could leak one.

### Accessibility (section 11)

- Print/Download/View Invoice are all plain `<Link>`/`<a>`/`<button>`
  elements — keyboard-focusable and screen-reader-labeled by default,
  the same convention every existing action in this codebase (e.g. the
  Track Order page's own "Return or Exchange an Item" link) already
  uses; no custom widget was introduced that would need its own ARIA
  wiring.
- The Download link carries a real `download` attribute (a working
  fallback/hint even though the server's own `Content-Disposition:
  attachment` header is what actually drives the browser's save
  behavior) and needs no JavaScript to function.
- Reviewed color contrast for the new invoice pages' fixed light
  palette (`text-neutral-900` on `bg-white`, `text-neutral-500`/`-600`
  for secondary text) — all comfortably AA at the sizes used; no
  genuine issue found requiring a fix.

### Testing (section 13)

- **`src/lib/__tests__/invoice-presentation.test.ts`** (new, 9 tests) —
  every pure formatting helper: `getInvoiceNumber` equals the order
  number; date formatting; both `OrderSource` labels; discount label for
  percentage-with-reason, flat-without-reason, and no-discount (null);
  address lines for null, fully-blank, complete, and partial addresses.
- **`src/server/commerce/__tests__/invoice-pdf.test.ts`** (new, 6 tests)
  — `generateInvoicePdf` called directly with hand-built `Invoice`
  objects (no DB): produces a valid PDF (`%PDF-` magic bytes) for a
  complete discounted/addressed Counter Sale; for a Guest ONLINE order
  with no address/customerId/discount; with an outstanding balance;
  never throws for either `OrderSource`; **paginates a 60-item invoice
  without error** (and produces a measurably larger buffer than a
  1-item invoice, proving the extra items were actually drawn); and is
  a pure function of its input (two identical calls produce identically
  sized output). Deliberately tests PDF *structure*, never rendered text
  content — extracting text from a generated PDF would need a
  test-only parsing dependency this codebase has no other use for; full
  visual verification is manual (below).
- **`src/server/commerce/__tests__/invoice.test.ts`** (extended, +2
  tests) — `customerId` matches the linked `Customer.customerId` for a
  Counter Sale; is `null` for a Guest order. The existing
  byte-for-byte historical-stability test needed no changes (it doesn't
  mutate `customerId`, and `customerId` is exactly the field this phase
  proved cannot drift).
- **Manual, real-server, real-Postgres end-to-end verification**
  (script run against a live `next dev` instance with genuine minted
  admin/customer session cookies, same convention as every prior
  phase): Admin invoice page loads (200, correct customer/address/
  totals, confirmed NO admin nav markup present) and redirects when
  unauthenticated (307 → `/admin/login`); Admin PDF downloads (200,
  `application/pdf`, correct `Content-Disposition` filename, valid
  `%PDF-` bytes) and 401s when unauthenticated; Customer invoice page
  loads for the true owner (200, correct data, confirmed NO storefront
  header markup present) and 404s for a DIFFERENT customer (IDOR) and
  when unauthenticated; Customer PDF downloads for the true owner and
  404s for a different customer / 401s unauthenticated; the Admin Order
  Detail and Track Order pages both render the new Invoice links;
  **and, mirroring Part 1's own historical-stability proof one layer up
  the stack**: mutating the linked Customer's `displayName` after the
  sale, then re-requesting both the PDF and the View page, shows the
  PDF is byte-length-identical and the page still shows the ORIGINAL
  name, never the mutated one.

### Regression (Part 2)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — **862/862 passing** (up from 846 at the end of the
  Return-claim-lifecycle bug fix; 17 new tests this phase — 9 + 6 + 2 —
  zero regressions).
- `npm run build` (Turbopack) — succeeds; the 4 new routes
  (`/admin/orders/[orderNumber]/invoice`,
  `/api/admin/orders/[orderNumber]/invoice`,
  `/track/orders/[orderNumber]/invoice`,
  `/api/track/orders/[orderNumber]/invoice`) all compile as dynamic
  (`ƒ`) routes, correctly, since each depends on a per-request session
  cookie.
- **No new migration** — this phase adds no schema change (the one new
  `Invoice.customerId` field is a `select`-scoped live read, not a new
  column). Re-verified anyway per "protect every previous phase":
  created `shop_verify_366_p2`, applied all 18 existing migrations,
  confirmed **zero drift** (`prisma migrate diff --exit-code`), seeded
  it, ran the full 862-test suite against it (100% pass), then dropped
  it — shared dev database row counts confirmed unchanged before/after
  (`orders`: 8, `customers`: 5, `products`: 13, matching Part 1's own
  recorded baseline exactly).
- **Dev-server restart discipline**: restarted twice — once before
  manual verification (a new external dependency, `pdfkit`, was added;
  Turbopack's dependency graph needed a clean pickup), and once more
  after adding `serverExternalPackages` to `next.config.ts` to fix the
  `ENOENT` bug above (a `next.config.ts` change is never picked up by
  hot reload).

### Known limitations (Part 2)

- **No WhatsApp invoice delivery, GST, QR codes, Credit Notes, or
  E-Invoicing** — all explicitly out of scope (section 16), for future
  parts to build on this Part's rendering layer.
- **Invoice Number remains the Order Number** — deliberate, see
  "Invoice Number" above; revisit only if GST/e-invoicing compliance
  concretely requires an independent sequence.
- **No School name on the invoice** — Part 1 already reviewed and
  deliberately excluded this from the `Invoice` model itself (see Part 1
  "Order snapshots review"); this phase renders whatever the model
  contains and did not reopen that decision.
- **The PDF has no embedded real logo image** — section 4/10's own
  "logo (placeholder if necessary)" is satisfied with a styled brand
  wordmark; swapping in a real image asset later is a rendering-layer
  change only, touching nothing in `Invoice` or its authorization.
- **No automated test renders the actual React `InvoiceView` JSX or
  parses generated PDF text** — this codebase has no existing
  component-testing or PDF-text-extraction precedent to extend (every
  existing test in this codebase targets pure/domain/query functions,
  never rendered UI), so introducing either would be a new testing
  pattern, not a continuation of one. Structural PDF tests plus the
  underlying data/formatting unit tests plus real-server manual
  verification (above) together cover what those would have proven.
- **No browser-automation tool in this environment** (disclosed in
  every prior phase) — manual verification used real HTTP requests
  against a real running server with genuine session cookies, not a
  headless browser driving the actual print dialog; the `print:hidden`/
  `@page` CSS itself was verified by inspection and by confirming the
  relevant classes render in the served HTML, not by rendering an
  actual paginated print preview.

### Architecture decisions (Part 2)

- **pdfkit over Puppeteer/`@react-pdf/renderer`** — no headless-browser
  or React-reconciler dependency for a long-running server process; see
  "PDF generation" above.
- **Two renderers, one data+formatting layer, not one renderer for
  both** — a PDF byte stream and a DOM/CSS print layout are genuinely
  different rendering technologies; section 2's "single invoice engine"
  is satisfied at the `Invoice` + `invoice-presentation.ts` layer, which
  is the layer that actually determines what an invoice says, not by
  forcing one technology to emulate the other.
- **Invoice pages live outside their app's route group** — the only way
  to satisfy "no navigation, no admin chrome" as a genuine dedicated
  layout (section 5) rather than a print-time CSS patch over chrome
  that's still there on screen; see "Page architecture" above.
- **Live join for `customerId` only, `select`-scoped** — the narrowest
  possible, explicitly-justified exception to Part 1's "never join
  Customer" guarantee, chosen over a new schema migration for a value
  that structurally cannot drift; see "Customer ID" above.

## Final Part 2 verdict

Klasiq can generate a professional invoice from immutable commerce
snapshots (`Invoice` + `invoice-presentation.ts`, unchanged from — and
one narrow, justified addition to — Part 1's foundation), render it
consistently for print and PDF (`InvoiceView`/`generateInvoicePdf`,
sharing every figure and label, differing only in rendering technology),
and allow secure downloading by both Admin and the owning Customer
(`getAdminSession()`/`getCustomerSession()` + `getInvoiceForAuthenticatedCustomer`,
each independently proven against a real server) — all without
duplicating business logic anywhere. WhatsApp delivery, GST, QR
verification, Credit Notes, and E-Invoicing remain explicitly deferred
to future parts, per section 16.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), Phase 3.6.5 (all six parts), and Phase 3.6.6 Part 1 remain
uncommitted together in the working tree, per instruction, alongside
this Part's own changes. Phase 3.6.6 Part 3 has not been started —
awaiting review.

## Part 3 — WhatsApp Invoice Delivery & Customer Communication Finalization

Date: 2026-08-09

The FINAL part of Phase 3.6.6. Completes the customer communication
workflow by letting a completed sale's invoice go out over WhatsApp —
reusing Phase 3.6's WhatsApp platform (Meta client, transport config,
sender selection, phone-fallback strategy) and Phase 3.6.6 Part 2's
invoice engine (data model, PDF generator) verbatim, with no second
implementation of either. Email/SMS invoices, GST, Credit Notes,
E-Invoicing, QR verification, invoice reminders, and marketing campaigns
remain explicitly out of scope (section 15).

### Audit of the existing implementation (before writing any code)

- **`docs/PHASE_3_6_REPORT.md`** (all four parts) — read in full. The
  concrete API surface this part had to reuse, not rebuild:
  `sendWhatsAppTemplateMessage` (`src/server/whatsapp/client.ts`, the ONE
  Meta client), `getWhatsAppTransportConfig()` (`config.ts`, the ONE
  credential resolver), `getNotificationSender()`/`NotificationSender`
  (`notification-sender.ts`, the ONE provider-selection mechanism, shared
  by Order and Return/Exchange notifications via `NOTIFICATION_PROVIDER`),
  and the established phone-fallback chain (`customerWhatsapp ??
  customerMobile`, never `Customer.whatsappPhone`). Also confirmed a
  concrete gap: `sendWhatsAppTemplateMessage`'s request body has no way to
  attach a document — every existing template (OTP/Order/Return/Exchange)
  is text-only. Attaching the invoice PDF genuinely needed one new Meta
  API capability (media upload) this platform didn't have yet.
- **`docs/PHASE_3_6_6_REPORT.md` Parts 1–2** (this same file, above) —
  re-read for the exact reusable pieces: `getInvoiceForOrder` (Part 2,
  the single invoice data model — already carries `customerName`/
  `customerMobile`/`customerWhatsapp`/`source`/every money figure, so no
  new "invoice for notification" shape was needed) and `generateInvoicePdf`
  (Part 2, the single PDF renderer).
- **`src/server/whatsapp/notification-service.ts`/`return-notification-service.ts`**
  — read in full. Confirmed both are "never throws, always swallows"
  (correct for a side effect of an already-committed commerce
  transaction, with no user waiting on the result) — and confirmed this
  is the WRONG shape to copy verbatim for invoice delivery, which is a
  direct, on-demand admin button click with a user actively waiting for
  feedback (see "Failure handling" below for the reasoned divergence).
- **`src/components/admin/order-status-actions.tsx`** — confirmed the
  established `useTransition` + `sonner` toast + `disabled` pending-state
  convention every existing admin action button already uses — reused
  verbatim for the new "Send via WhatsApp" button, no new UI pattern.
- **`src/components/admin/counter-sale-form.tsx`** — located the actual
  "Counter Sale Success screen" (section 3) the brief names: the
  `completedSale` render branch (a client-side success state after
  `createCounterSale` returns, showing the order number, line items, and
  totals with a "Start New Sale" button) — confirmed it already has
  `completedSale.orderNumber` in scope, exactly what the shared button
  needs.
- **`src/app/admin/(protected)/orders/[orderNumber]/page.tsx`** and
  **`src/app/admin/orders/[orderNumber]/invoice/page.tsx`** (Part 2) —
  confirmed exactly where a third Invoice action fits in each (the
  existing "Invoice" card; the existing `InvoiceActions` row).
- **`src/app/(site)/track/(protected)/orders/[orderNumber]/page.tsx`**
  and **`src/app/track/orders/[orderNumber]/invoice/page.tsx`** (Part 2)
  — read to determine what a customer-facing send action would need to
  look like, before deciding (section 9) whether to build one.
- Grepped `src/` for every `process.env.WHATSAPP_*`/`NOTIFICATION_PROVIDER`
  read (mirroring Phase 3.6 Part 4's own audit method) — confirmed no
  invoice-related env var existed before this part, and confirmed the
  exact insertion point in `.env.example`.

### Architecture — one Meta client, extended once; two new domain-layer files

**No second Meta client, credential resolver, or provider-selection
mechanism was created** (section 2):

- **`src/server/whatsapp/client.ts`** — extended, not forked. Two
  additions, both purely additive: (1) `WhatsAppTemplateMessageParams`
  gains an optional `headerDocument?: { mediaId, filename }`, threaded
  into the request's `components` array as a `header` entry ONLY when
  present — every existing caller (OTP, Order, Return/Exchange) omits it,
  so their request bodies are byte-for-byte unchanged (proven directly —
  see "Testing"). (2) A new sibling function, `uploadWhatsAppMedia`,
  calling Meta's `POST /{phoneNumberId}/media` (multipart/form-data) to
  get the media `id` a `headerDocument` references — the ONE new Meta API
  capability this phase genuinely needed, added to the SAME file (same
  transport config type, same retry constants, same
  `isNetworkLevelFailure`/`delay` helpers), never a second client module.
  Same retry/logging discipline as `sendWhatsAppTemplateMessage`: exactly
  one retry, only for a network-level failure; never retries a real HTTP
  response; never logs the file's own bytes, only its filename and size.
- **`src/server/whatsapp/notification-sender.ts`** — `NotificationSender`
  gains a matching `uploadMedia(...)` method alongside `send(...)`,
  implemented once per existing class. This was a genuine correctness
  fix caught during design, not an afterthought: without it, calling
  `uploadWhatsAppMedia` directly from a service would make a REAL Meta
  call even when `getNotificationSender()` would otherwise pick the
  console dev stand-in — silently breaking Parts 2/3's own "no real
  network call in development" guarantee for exactly this one new
  capability. `ConsoleNotificationSender.uploadMedia` returns a fake id
  and logs a dev-only line without ever calling `fetch`;
  `RealNotificationSender.uploadMedia` calls the real
  `uploadWhatsAppMedia`. Governed by the SAME `NOTIFICATION_PROVIDER`
  variable Order/Return notifications already use — not a third,
  invoice-specific toggle.
- **`src/server/whatsapp/invoice-notification-service.ts`** (new) — the
  logically-separate "invoice" domain, mirroring how `notification-service.ts`
  (Order) and `return-notification-service.ts` (Return/Exchange) are each
  their own module sharing the transport below them. Deliberately reuses
  `Invoice` (Part 2) as its own input type rather than inventing a
  parallel `InvoiceForNotification` shape — `Invoice` is already exactly
  the kind of plain, DB-free object `OrderForNotification`/
  `ReturnRequestForNotification` were hand-built to be; defining a second,
  identically-shaped type would duplicate Part 2's own model, not reuse
  it.
- **`src/server/commerce/send-invoice.ts`** (new) — the ONE orchestration
  function (`sendInvoiceWhatsApp(orderNumber)`) every entry point calls:
  resolves the invoice (`getInvoiceForOrder`), generates the PDF
  (`generateInvoicePdf`), and hands both to
  `sendInvoiceOverWhatsApp`. This is section 3/4's "reuse the same
  underlying implementation" made literal — one function, three UI call
  sites, never three separate wiring paths.

### Template strategy (section 5) — one reusable template, fixed 4-parameter shape

One new template, `WHATSAPP_INVOICE_TEMPLATE_NAME`, with a DOCUMENT
header component (the attached PDF) and exactly 4 body variables, in
order:

1. Customer name (`invoice.customerName ?? "Customer"`).
2. Invoice/Order number — `getInvoiceNumber(invoice)`, Part 2's own
   function, reused rather than re-derived. Presented as ONE combined
   identifier (never two near-duplicate parameters for what Part 2
   already decided is the same value — see "Invoice Number," Part 2)
   — the template's own copy labels it appropriately (e.g. "Order No:
   {{2}}").
3. Grand Total (`formatPaise(invoice.totalInPaise)`).
4. A payment status + thank-you line (`buildInvoicePaymentLine`) — see
   "Outstanding handling" below.

Fixed at 4 parameters deliberately, matching Order notifications' own
4-parameter shape (Part 2 of Phase 3.6) rather than Return/Exchange's 5
— an invoice has no separate "return number" concept needing its own
slot. Never a variable parameter count: WhatsApp template variables are
fixed slots in an approved template, so "conditionally including
Outstanding" (section 5's own example list) is handled as CONTENT
branching within one always-present parameter, not by adding or omitting
a slot at send time — the exact same technique `buildContextLine`/
`buildReturnContextLine` (Phase 3.6 Parts 2/3) already established for
every other event's own conditional wording (school name, fulfillment
type, rejection reason).

### Outstanding handling (section 6)

`buildInvoicePaymentLine` (`invoice-notification-service.ts`):

```text
COUNTER source AND outstandingInPaise > 0:
  "You've paid ₹X, with ₹Y outstanding — please clear this at your
   earliest convenience. Thank you for shopping with us!"
otherwise (COUNTER fully paid, or any ONLINE order):
  "Thank you for shopping with us!"
```

Mirrors the EXACT "Amount Received/Outstanding shown for Counter Sale
only" rule already established on the Admin Order Detail page, the Track
Order page, and the invoice PDF/Print layout itself (Part 2) — an ONLINE
order structurally always has `outstandingInPaise === 0` (Phase 3.6.5
Part 3's own invariant), so this isn't a special case invented for
messaging, it's the same fact this codebase already treats consistently
everywhere else it appears. When outstanding is zero, the line never
mentions "outstanding" at all — not a blank field, not "Outstanding:
₹0," a different, positive sentence entirely, per section 6's own
"avoid unnecessary messaging."

### Attachment generation (section 4)

`sendInvoiceWhatsApp` (`src/server/commerce/send-invoice.ts`) calls
`generateInvoicePdf(invoice)` — Part 2's own function, completely
unchanged, called with no modification to its signature or behavior.
The resulting `Buffer` is uploaded via `sender.uploadMedia(...)` (which,
in production, calls the new `uploadWhatsAppMedia` in `client.ts`) and
the returned media id is passed as the template's `headerDocument`.
There is no second PDF-generation code path anywhere in this phase —
grep-confirmed only one call to `generateInvoicePdf` exists across the
entire `src/server/whatsapp/` and `src/server/commerce/send-invoice.ts`
files combined.

### Phone selection (section 7)

Unchanged, reused verbatim: `invoice.customerWhatsapp ?? invoice.customerMobile`,
skip (never a guess) if neither is present, never `Customer.whatsappPhone`
(the customer's current, separately-mutable profile). `Invoice.customerMobile`/
`customerWhatsapp` ARE `Order.customerMobile`/`customerWhatsapp` verbatim
(Part 2's own model, itself the same checkout-time snapshot fields Phase
3.6 Parts 2/3 already resolve from) — there is no second phone-resolution
mechanism anywhere in this phase, only the one already-audited chain
read through one more layer of already-existing plumbing.

### Failure handling (section 8) — a deliberate, reasoned divergence from Parts 2/3

**`sendInvoiceOverWhatsApp` does NOT silently swallow every failure**,
unlike `notifyOrderEvent`/`notifyReturnEvent`. This is a considered
divergence, not an inconsistency: Parts 2/3's notifications are automatic
side effects of an already-committed commerce transaction, fired with no
user waiting on the outcome — swallowing is correct there because there
is nothing useful to tell anyone synchronously. Invoice delivery is the
opposite shape: a direct, on-demand admin button click, with an admin
actively watching for a result. Returning a clean, typed
`{success: false, error: {...}}` (never throwing) and surfacing it via a
`toast.error(...)` is what actually satisfies section 8's own "Admin
receives a clear notification" — a silent swallow would satisfy the
LETTER of "never affect commerce" while failing the actual requirement
right next to it in the same section.

What IS identical to Parts 2/3: it never throws an unhandled exception
(every failure path is caught and converted to a typed result); the sale
itself is never affected, because nothing in this entire flow — from the
Server Action down through `sendInvoiceWhatsApp`,
`sendInvoiceOverWhatsApp`, `uploadWhatsAppMedia`, to
`sendWhatsAppTemplateMessage` — ever writes to `Order`, `Customer`, or
any other row (grep-confirmed: zero `db.*.create`/`update`/`delete` calls
anywhere in this call chain); the invoice remains downloadable regardless
(Part 2's Download/Print/View actions are completely independent code
paths, untouched by this phase); and customer data is provably unchanged
(a dedicated test snapshots the order before and after a simulated
failure and asserts deep equality).

### Security (section 10)

- **Admin may send any invoice**: `sendInvoiceWhatsAppAction`
  (`src/server/actions/admin/invoice.ts`) requires `getAdminSession()`,
  the identical re-check every other admin-mutating Server Action already
  performs (mirrors `updateOrderStatusAction`) — a client already holding
  a reference to this action could otherwise call it directly, bypassing
  the `(protected)` layout's own gate, which only covers page renders.
- **Customer may only send their own invoice**: satisfied structurally,
  not by a runtime check that could be gotten wrong — there is NO
  customer-portal Server Action anywhere in this codebase that reaches
  `sendInvoiceWhatsApp`/`sendInvoiceOverWhatsApp` (grep-confirmed). A
  customer session cannot trigger this capability for ANY order, their
  own included, because no code path exists for it to do so — see
  "Customer Portal" below for why this was a deliberate choice, not a gap.
  If a customer-facing send action is ever added, it must go through an
  ownership-scoped wrapper mirroring `getInvoiceForAuthenticatedCustomer`
  (Part 2) exactly, never a direct call to the unscoped orchestration
  function.
- **No authorization regressions**: every existing admin/customer-portal
  authorization boundary (Parts 1–2 of this phase, and every prior phase)
  is untouched — this part adds one new, independently-gated Server
  Action and modifies no existing one.
- **No internal identifiers exposed**: the WhatsApp message and its
  attached filename use only `invoice.orderNumber` (never the internal
  `Order.id`) — grep-confirmed across every new file in this phase,
  consistent with Phase 3.6's own established discipline.

### Customer Portal (section 9) — audited, deliberately not built

**No customer-facing "Send Invoice to WhatsApp" button was added.**
Reasoning:

- The Customer Portal invoice page (Part 2) already has a one-tap
  **Download Invoice** action that is strictly more reliable than a
  WhatsApp send: it has no phone-validity dependency, no Meta API round
  trip, no per-message cost, and cannot fail for a reason outside the
  customer's own control. A customer viewing their invoice online is not
  "waiting for delivery" the way a completed sale's customer at the
  counter might be — they already have direct access, so there is no
  clear, demonstrated gap left for a "send to WhatsApp" button to close
  for someone who can already download the same file in one tap.
- Section 3's own list of the three places to support sending (Counter
  Sale Success, Admin Order Detail, Admin Invoice page) is entirely
  admin-side — a signal, not proof, that this was scoped as an
  admin-initiated capability, with section 9 asking a genuine, open
  question rather than assuming a customer-facing button too.
- Every real WhatsApp send has an actual cost (Meta bills per
  business-initiated conversation) and a real failure surface (invalid/
  changed number, template/session limits) — reintroducing that failure
  surface for an action where a strictly simpler, free, always-working
  alternative (Download) already exists would add risk without closing a
  genuine gap.
- If a genuine customer need for this is demonstrated later, the correct
  shape is documented above (an ownership-scoped Server Action calling
  `getInvoiceForAuthenticatedCustomer` first, then the same
  `sendInvoiceWhatsApp`/`sendInvoiceOverWhatsApp` functions this phase
  already built) — not a new send pathway, just a new, properly-scoped
  caller of the existing one.

### Accessibility (section 11)

- **Buttons**: `SendInvoiceWhatsAppButton` is a plain `<button>` with a
  visible text label ("Send via WhatsApp"/"Sending…") — keyboard-focusable
  and screen-reader-readable with no additional ARIA needed, the same
  convention every other admin action button in this codebase already
  uses.
- **Loading states**: `useTransition` + `disabled` while pending +
  `"Sending…"` label text — identical, not merely similar, to
  `OrderStatusActions`/`PaymentStatusActions`'s own established pattern;
  no new loading-state convention was invented.
- **Success/failure messages**: `toast.success(...)`/`toast.error(...)`
  via `sonner`, whose `<Toaster>` (mounted once, in the root layout) is
  already the established, ARIA-live-region-backed feedback mechanism
  every other admin action in this app already uses — no new
  announcement pattern was built or was needed.
- No genuine accessibility issue was found; nothing beyond reusing the
  existing, already-accessible pattern was required.

### Testing (section 12)

- **`src/server/whatsapp/__tests__/client.test.ts`** (extended, +7
  tests): `headerDocument` produces the correct `header` component,
  positioned before `body`; omitting it reproduces the EXACT pre-existing
  `components` shape (regression proof that every existing caller is
  unaffected); `uploadWhatsAppMedia` posts the correct multipart fields
  to the correct endpoint with the correct auth header and returns the
  media id; never logs the file's own bytes; never retries a real HTTP
  error response; retries exactly once on a genuine network failure;
  gives up after one retry on repeated network failures; throws if Meta
  responds 200 with no media id (defensive).
- **`src/server/whatsapp/__tests__/invoice-notification-service.test.ts`**
  (new, 15 tests): `buildInvoicePaymentLine`'s three branches (Counter +
  outstanding, Counter fully paid, Online); the full send path uploads
  then sends with the correct 4 body parameters and header document;
  customer-name fallback; phone-selection priority (WhatsApp over
  mobile, mobile fallback, skip when neither present, skip on a
  malformed number) — all never calling `fetch` when skipped; template
  not configured skips cleanly; a media-upload failure and a
  post-upload send failure both return `DELIVERY_FAILED` without
  throwing; no rejection detail or file bytes ever appear in a log line;
  the development console stand-in makes zero real `fetch` calls; the
  SAME `NOTIFICATION_PROVIDER` toggle Order/Return notifications use
  governs this service too.
- **`src/server/commerce/__tests__/send-invoice.test.ts`** (new, 4
  tests, real Postgres, `sendInvoiceOverWhatsApp` mocked to isolate
  wiring): `NOT_FOUND` for a nonexistent order without generating a PDF
  or attempting a send; a real Counter Sale's `Invoice` and a real,
  valid PDF buffer (`%PDF-` magic bytes) are passed through correctly;
  a failure result passes through unchanged; the order/customer data is
  provably unchanged (deep-equality snapshot) regardless of outcome.
- **`src/server/actions/admin/__tests__/invoice.test.ts`** (new, 4
  tests, real Postgres, real `getAdminSession()`/`createAdminSession()`
  via the established mocked-cookie-store convention): `UNAUTHORIZED`
  and zero calls to the domain function with no session; a real admin
  session delegates correctly with the given order number; malformed
  input is rejected before the domain function is ever called; a
  failure result passes through unchanged.
- **Manual, real end-to-end verification** (a real local HTTP server
  standing in for Meta's Graph API — media upload and message-send
  endpoints both — while the REAL `sendInvoiceWhatsApp` →
  `sendInvoiceOverWhatsApp` → `client.ts` chain ran with `NODE_ENV=production`
  genuinely set, mirroring every prior Phase 3.6 part's own verification
  method): (1) a real partial-payment Counter Sale produced a real PDF,
  a real multipart media upload, and a real template send with the
  correct header document and all 4 body parameters — including the
  exact expected "paid ₹X, with ₹Y outstanding" wording; (2) a simulated
  Meta failure during the media upload step returned a clean
  `DELIVERY_FAILED` with the order's row provably byte-identical before
  and after; (3) a simulated Meta failure during the template send
  (after a successful upload) also returned a clean `DELIVERY_FAILED`;
  (4) a Guest sale with no phone at all returned `NO_PHONE` with ZERO
  HTTP requests attempted; (5) a nonexistent order number returned
  `NOT_FOUND` with zero HTTP requests. A second script, against a real
  running `next dev` server with a genuine admin session cookie,
  confirmed the "Send via WhatsApp" button's markup renders on both the
  Admin Order Detail page and the Admin Invoice page, and that the
  Customer Portal invoice page correctly has no such button while its
  own authorization redirect remains unaffected.

**Total: 893 tests passing** (862 at the end of Part 2 + 31 new this
part: 7 + 15 + 4 + 4 + 1 net from a fixed count elsewhere).

### A test-hygiene bug found and fixed during this part's own regression

While confirming the shared dev database's row counts were unchanged
after this part's manual verification (the same "protect every previous
phase" discipline every part in this session applies), `adminUser` count
was found at 5 instead of the established baseline of 1. Root cause: the
new `src/server/actions/admin/__tests__/invoice.test.ts` created a fresh
admin row in three of its four tests (each call to its own
`signInAsAdmin()` helper) but its `afterAll` cleanup only ever deleted
the LAST one, since it tracked a single `let adminUserId: string`
variable that each call overwrote rather than a growing list — exactly
the `createdAdminIds: string[]` pattern every other test file in this
codebase (e.g. `returns.test.ts`) already uses correctly. Fixed by
switching to that same array-based pattern. The 4 orphaned rows already
left in the shared dev database (from this test file's own earlier runs
during this part's development) were deleted directly, and the fix was
verified by re-running the test file and re-checking the count returned
to 1. This was caught and fixed before being reported as complete, not
left as a known issue — the row-count check exists in this session's own
established regression discipline specifically to catch exactly this
class of mistake.

### Known limitations (Part 3)

- **No real WhatsApp Business template has been (or could be, in this
  environment) approved and exercised against** — same disclosed
  limitation as every part of Phase 3.6. The request shape (a
  Utility-category template with a DOCUMENT header and 4 body variables)
  is correct and proven structurally against a real local server standing
  in for Meta, but deploying this requires a real, Meta-approved template
  matching that exact shape.
- **Invoice delivery is synchronous** — an admin's "Send via WhatsApp"
  click awaits the full upload-then-send round trip (plus, in the worst
  case, one network retry on each of the two calls) before the button's
  pending state clears. Consistent with this codebase's existing
  precedent (Parts 2/3 of Phase 3.6 await their own sends synchronously
  too) — not revisited here, since this is a direct user action already
  expecting to wait for a result, unlike a background commerce side
  effect.
- **No customer-facing send action** — a deliberate, documented choice
  (section 9), not a gap; see "Customer Portal" above for the full
  reasoning and what a correctly-scoped future version would need.
- **No delivery-status webhook handling** — same as every part of Phase
  3.6; only the synchronous accept/reject of the upload and send
  requests themselves is known.
- **No dashboard/metrics/alerting** — same as every part of Phase 3.6;
  this phase's two new log lines (`whatsapp-client: media uploaded`/
  `media upload failed`) follow the exact same plain-log convention, with
  the same disclosed absence of aggregation/alerting infrastructure.

### Final acceptance audit (section 16) — the complete customer communication journey

Walked the full chain end to end against the CURRENT code, confirming
internal consistency at every step:

| Step | What happens | Verified |
| --- | --- | --- |
| Counter Sale / Checkout | `createCounterSale`/`placeOrderForBasket` | Order/OrderItem snapshot everything an invoice needs (Phase 3.6.6 Part 1) |
| Invoice Generation | `getInvoiceForOrder` | Reads ONLY the immutable snapshot, never a live join except the one narrow, justified `customerId` exception (Part 2) |
| PDF | `generateInvoicePdf` | Same function, called by Download, Print-page-adjacent flows, AND this part's WhatsApp delivery — one PDF implementation, three consumers |
| Print | `InvoiceView` + browser print | Same `Invoice` + `invoice-presentation.ts` data/formatting layer as the PDF (Part 2) |
| Download | Admin/Customer Portal PDF Route Handlers | Unchanged by this phase; independent of WhatsApp delivery succeeding or failing |
| WhatsApp Delivery | `sendInvoiceWhatsApp` (this part) | Reuses `generateInvoicePdf` and the Phase 3.6 Meta client/transport/sender-selection platform verbatim |
| Customer Portal Download | `getInvoiceForAuthenticatedCustomer` | Unchanged, ownership-scoped, still the only customer-facing invoice access path (by design — see "Customer Portal" above) |

No inconsistency was found. Every stage reads from the same `Invoice`
model; nothing in this phase altered what any prior stage computes or
displays; a WhatsApp delivery failure changes nothing about any other
stage's availability or correctness.

## PHASE 3.6.6 — COMPLETE

Klasiq provides a complete customer communication workflow supporting
optional customer addresses (Part 1), immutable invoice generation,
secure PDF viewing/downloading, and professional printing (Part 2), and
WhatsApp invoice delivery reusing the existing notification platform
without duplicating business logic (Part 3) — demonstrated, not merely
asserted: one invoice data model and one PDF renderer are shared by
Print, Download, and WhatsApp delivery alike; one Meta client (extended,
never forked) and one provider-selection mechanism serve OTP, Order,
Return/Exchange, and now Invoice messaging; every authorization boundary
(admin session, customer-portal ownership scoping) is independently
proven, with zero regressions across all three parts; a WhatsApp
delivery failure never affects the underlying sale, the invoice's
downloadability, or any customer data, proven directly against a real
simulated Meta server, not merely argued. Full test suite passes
(893/893, including a from-scratch database run); fresh-database
verification passes (18 migrations, zero drift, no new migration needed
by this Part); production build passes; a test-data-hygiene bug found
during this Part's own regression was fixed and re-verified before being
reported done; documentation is complete across all three Parts.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), Phase 3.6.5 (all six parts), and Phase 3.6.6 (all three
parts) remain uncommitted together in the working tree, per instruction.
Phase 3.7 has not been started — awaiting review.
