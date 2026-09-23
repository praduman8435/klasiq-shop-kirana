# Phase 3.6.5 — Counter Sale Customer Experience Redesign

## Part 1 — Counter Sale UX Redesign

Date: 2026-08-08

Simplifies the Counter Sale customer-selection flow from a three-way
Guest/Existing/New choice to two: Guest or Customer. Within Customer, the
cashier only ever searches one unified field — the system decides whether
that resolves to an existing row or a brand-new one, created inline with
zero extra steps. Phase 3.6 (WhatsApp platform) is untouched by this part;
this is a UI/UX and customer-search redesign only.

## Audit of the current implementation (before writing any code)

Read `docs/PHASE_3_2_REPORT.md` ("Customer selection," "UX decisions"),
`docs/PHASE_3_5_REPORT.md`, and `docs/PHASE_3_6_REPORT.md` first, then
audited the actual code, which is more authoritative than the prompt's own
assumptions:

- **`src/components/admin/counter-sale-customer-panel.tsx`** (pre-redesign)
  — a three-tab `role="tablist"` (Guest/Existing/New). Existing search
  called `searchCustomersForCounterSaleAction`; New showed two plain
  fields (name optional, phone required) with no eager creation — the
  typed values were only ever submitted at final sale time.
- **`src/server/queries/admin/customers.ts`** (`searchCustomers`) — found
  the REAL, current matching rule: `customerId` was an EXACT
  (case-insensitive) match, phone required a COMPLETE, validly-formatted
  number (`normalizePhoneNumber(...).valid`), and only `displayName` used
  `contains`. This directly contradicted section 5's "Partial Phone"
  requirement — a cashier typing a few digits of a phone number got zero
  results under the old code. This was the one genuine, pre-existing gap
  the redesign needed to close at the query level, not just the UI level.
- **`src/server/commerce/counter-sale.ts`** (`createCounterSale`,
  `resolveCounterSaleCustomer`) — confirmed the server's domain contract
  is `GUEST | EXISTING | NEW`, unchanged since Phase 3.2, and that `NEW`
  already delegates to `findOrCreateCustomerByPrimaryPhone`
  (`src/server/commerce/customer.ts`, Phase 3.1) — the exact "same Customer
  engine" section 14 requires reuse of.
- **`src/server/commerce/customer.ts`** — confirmed
  `findOrCreateCustomerByPrimaryPhone`'s own documented guarantee: a phone
  that already belongs to someone is reused, never duplicated, and that
  customer's stored `displayName` is never silently overwritten by
  whatever was just typed. `updateCustomerContactInfo` already exists for
  mutating `whatsappPhone` but was "still not wired into any UI" per Phase
  3.2's own report.
- **`prisma/schema.prisma`** (`Customer`) — confirmed there is no
  "outstanding balance"/ledger field anywhere — section 6's "placeholder
  only" instruction is correct, not speculative; KhataBook/Ledger remains
  fully out of scope (section 18).
- **`src/lib/counter-sale-form.ts`**, **`use-debounced-search.ts`**,
  **`counter-sale-product-search.tsx`** — the existing keyboard model
  (`nextSearchResultIndex`, highlight-first-result, ArrowUp/Down/Enter/
  Escape, 150ms debounce) that this redesign reuses verbatim for customer
  search rather than inventing a second interaction style.

## UX decisions

**Two choices, not three (sections 1, 2, 8).** The old flow asked the
cashier to decide "does this person already exist?" before search was even
possible — exactly backwards from how a real counter works, where the
cashier types what the customer tells them and finds out either way. The
redesigned `role="tablist"` has exactly two tabs, `Guest` and `Customer`.
Guest is completely unchanged (section 3): zero fields, zero database
activity for identity, a sale can never be blocked on customer information.

**One search field, not three (sections 4, 5).** Selecting `Customer`
shows a single `<input>` immediately — no separate Customer ID/Phone/Name
fields to choose between. It searches all three simultaneously via the
now-enhanced `searchCustomers` (below).

**The system decides — Existing/New is gone from the client entirely
(section 8).** `CustomerMode` is now `"GUEST" | "CUSTOMER"` (was
`"GUEST" | "EXISTING" | "NEW"`) — see `src/lib/counter-sale-form.ts` and
`src/components/admin/counter-sale-customer-panel.tsx`. There is no
client-side "I'm creating a NEW customer" state anymore: search either
finds a real row (select it) or finds nothing (create one inline,
immediately selected). By the time a customer is ever "selected," a real
`Customer` row already exists — found or just created — so the final sale
submission only ever needs to send `EXISTING` (or `GUEST`) to the server.

**The server's three-mode contract is deliberately untouched.**
`CounterSaleCustomerInput` (`GUEST | EXISTING | NEW`,
`src/server/commerce/counter-sale.ts`) and `counterSaleCustomerSchema`
(`src/lib/validation/admin-counter-sale.ts`) are byte-for-byte unchanged.
The redesigned UI simply never constructs a `NEW` payload anymore — it
resolves to a real customer id BEFORE the final "Complete Sale" submit, via
a new, separate eager-creation action (below). `NEW` remains valid, tested,
reachable domain infrastructure (any future caller could still use it),
mirroring this codebase's own precedent of keeping built-but-currently-
unreached functions (`updateCustomerContactInfo` was exactly this from
Phase 3.1 through Phase 3.2).

**No "go back" step on a miss (section 7).** As soon as debounced search
settles on zero results for a non-empty query, the "No matching customers"
message is replaced in place by an inline create form — Name (optional),
Phone (required), WhatsApp (optional), and a "Create & Continue" button.
Nothing about the layout asks the cashier to switch tabs or navigate away.

**Phone/name pre-fill, only when the query is unambiguous (section 7).**
`detectCreateFormPrefill` (`src/lib/counter-sale-form.ts`, pure, unit
tested) pre-fills:

- **Phone**, when the query — after stripping common phone punctuation
  (spaces, hyphens, parens, a leading `+`) — is entirely digits (e.g.
  `"98765 43210"`, `"+91-98765-43210"`).
- **Name**, when the query contains a letter and doesn't look like a
  Customer ID (neither the full `KLQ-XXXXXX` format nor a bare `KLQ`/`KLQ-`
  prefix fragment).
- **Neither**, for a Customer-ID-shaped or empty query — guessing wrong
  here would be worse than leaving a blank field.

Whichever field ISN'T pre-filled is autofocused, so the cashier can start
typing immediately with no extra click (section 11).

**Automatic selection, zero extra steps (sections 7, 8).** "Create &
Continue" calls a new, dedicated eager-creation action
(`createCounterSaleCustomerAction`) that creates-or-finds the customer
RIGHT THEN (not deferred to final sale submission) and immediately selects
it — the Customer Card (section 10) appears at once, with a real Customer
ID, exactly as if the cashier had found them by search.

**Recent Customers (section 9).** A small list of up to 5 recently
transacted-with customers (`getRecentCustomers`,
`src/server/queries/admin/customers.ts`) appears above the search box
while it's empty and no customer is yet selected — loaded once per panel
mount (one request, not one per keystroke — "keep it lightweight"). Each
row is a plain, natively-focusable `<button>`; clicking or Tab+Enter/Space
selects it immediately, identical to a search result. Deliberately
compact (name/phone summary + Customer ID only, no Outstanding Balance
placeholder) — that placeholder belongs to the "Customer Found" search
results list (section 6), not this quick-pick.

**Customer Card (section 10).** Unchanged in spirit from the old
"Existing, selected" block: Customer ID, name/phone summary, Last Order,
and a single "Clear" button — no Outstanding Balance shown here (section
10's own field list omits it; adding it would be exactly the clutter that
section asks to avoid).

## Search experience (sections 4, 5)

`searchCustomers` (`src/server/queries/admin/customers.ts`) was the one
piece of REAL, reusable server logic this redesign needed to change —
extended, not duplicated, since it was already the query both the old
Existing-tab search and (per Phase 3.2's own report) any future admin
customer-directory UI would call:

- **Customer ID**: `equals` → `contains` (case-insensitive) — a prefix or
  fragment now matches, not only the complete identifier.
- **Phone**: previously required a complete, validly-formatted number
  (`normalizePhoneNumber(query).valid`); now strips every non-digit
  character from the query and `contains`-matches the resulting digit
  string against BOTH `primaryPhoneNormalized` and
  `whatsappPhoneNormalized` — never the raw, inconsistently-formatted
  `primaryPhone`/`whatsappPhone` columns (a stored value like
  `"98765-43210"` could otherwise hide a hyphen in the middle of what
  should be a contiguous digit match). A minimum of 3 digits is required
  before this branch runs at all — a 1–2 digit fragment would match
  nearly every customer's phone number, a near-useless flood; proven
  directly by a dedicated test.
- **Name**: unchanged — already `contains`, case-insensitive.

This single substring check on the digit string SUBSUMES the old exact-
match case (a complete phone number's digits are still a substring of its
own normalized form), so there is no separate "exact" branch left to keep
in sync, and the existing "finds by primaryPhone in any input format" test
continues to pass unmodified.

**Indexing tradeoff, explicitly documented, not silently accepted.**
`customerId` and `primaryPhoneNormalized` are both unique B-tree indexes;
switching either to `contains` loses the O(log n) exact-lookup benefit,
exactly the same known, already-accepted tradeoff `displayName` search
carried since Phase 3.1 (Postgres can't use a plain B-tree for arbitrary
`%x%`). A trigram/GIN index is the correct fix if/when this needs to scale
past a real shop's actual customer count — deferred, per this codebase's
consistent "not a concern at this shop's real scale" reasoning, not
because the tradeoff was overlooked.

**Reuse, not duplication (section 5's explicit instruction).**
`searchCustomers` remains the ONE customer-search function in this
codebase — the Counter Sale panel's local `searchCustomers` wrapper (in
the component file) still just calls
`searchCustomersForCounterSaleAction`, which still just calls the same
query function, unchanged in shape. No second search implementation was
written anywhere.

## Automatic customer creation (sections 7, 14)

**`createCustomerInline`** (new, `src/server/commerce/customer.ts`) is the
one place this redesign's "create on the spot" logic lives — and it
invents no new customer-mutation primitive:

1. Calls `findOrCreateCustomerByPrimaryPhone` (Phase 3.1, unchanged) for
   the actual find-or-create-by-phone step — the exact same engine
   `createCounterSale`'s own `NEW` mode already uses.
2. If (and only if) that call genuinely just created a brand-new customer
   (`wasCreated: true`) AND a WhatsApp number was given, applies it via
   `updateCustomerContactInfo` (Phase 3.1, unchanged) — the first UI this
   codebase has ever wired that function into.
3. If the phone instead resolved to an ALREADY-EXISTING customer (a race
   between an earlier search and this submit, or a corrected typo), that
   customer's own `displayName`/`whatsappPhone` are left completely
   untouched — mirroring `findOrCreateCustomerByPrimaryPhone`'s own
   "never silently overwritten" guarantee. Proven directly: a test creates
   a customer, then calls `createCustomerInline` again with the SAME
   phone but different name/WhatsApp values, and asserts the original
   values survive unchanged.
4. A failure to apply the optional WhatsApp number (e.g. malformed) never
   fails customer creation itself — proven directly.

`createCounterSaleCustomerAction` (`src/server/actions/admin/counter-sale.ts`)
is a thin wrapper — admin-session check, Zod validation
(`createCounterSaleCustomerSchema`), delegate to `createCustomerInline`,
map to the client's result shape — the same auth-then-validate-then-
delegate shape every other admin action in this codebase already has. No
customer-creation logic lives in the action or the component.

## Recent Customers (section 9)

`getRecentCustomers` (new, `src/server/queries/admin/customers.ts`) reuses
the exact same model and `lastOrderAt desc` ordering `searchCustomers`
already used — just without a text filter, capped at 5. Excludes
customers with `lastOrderAt: null` (never actually completed a purchase —
including one just created moments ago via the inline form, before its
sale completes) since a never-transacted-with record isn't meaningfully
"recent" for this quick-pick's purpose. `getRecentCustomersForCounterSaleAction`
is the thin, no-input action wrapper.

## Keyboard flow (section 11)

- **Guest/Customer tabs**: native `role="tablist"`/`role="tab"` with a
  roving `tabIndex` (0 on the active tab, -1 on the other) plus
  ArrowLeft/ArrowRight to switch between them — a genuine, small ARIA-
  tablist-pattern completion found during this redesign (the OLD three-tab
  version had click-only tab switching; real tablists are expected to
  support arrow-key navigation between tabs). Click/Enter/Space still work
  via native button semantics either way.
- **Unified search box**: identical model to product search —
  ArrowUp/ArrowDown move a highlight (defaulting to the first hit as soon
  as results land, via `nextSearchResultIndex`, shared unchanged), Enter
  selects the highlighted result and clears the query, Escape clears the
  query. A cashier who already learned product search needs no second
  interaction style.
- **Recent Customers rows**: plain, independently focusable `<button>`s —
  Tab moves through them, Enter/Space selects, matching native button
  semantics with zero custom keyboard code. A deliberate scope decision:
  integrating them into the search box's arrow-key index model would add
  real complexity for a small, secondary quick-pick that Tab/Enter already
  serves well.
- **Inline create form**: Enter inside any of its three fields submits
  the form (`event.preventDefault()` + explicit dispatch) — critically,
  this does NOT bubble up and submit the outer Counter Sale `<form>` this
  panel is nested inside, since the button is `type="button"` and the
  field handler explicitly prevents the default Enter-submits-nearest-form
  behavior.
- **Focus movement, made explicit rather than left to fall wherever the
  browser drops it**: selecting a search result or Recent Customer moves
  focus to the resulting Customer Card's "Clear" button; clicking "Clear"
  moves focus back to the reappearing search box; the inline create form
  autofocuses whichever of Name/Phone ISN'T already pre-filled. No
  existing shortcut elsewhere in the Counter Sale form (product search,
  cart steppers, payment method buttons) was touched or regressed.

## Accessibility review (section 13)

Reviewed search, selection, buttons, focus, keyboard, and ARIA against the
rewritten component; one genuine, real fix was found and made (the
tablist arrow-key navigation above) — everything else already met the
bar set by the existing product-search pattern this redesign deliberately
mirrors:

- `role="combobox"`/`aria-expanded`/`aria-controls` on the search input,
  `role="listbox"`/`role="option"`/`aria-selected` on results — unchanged
  shape from the prior implementation, still correct.
- Every interactive element is a real `<button>` or `<input>` — no
  clickable `<div>`s anywhere in the new markup.
- `Label`/`htmlFor` pairing on every inline-create-form field (Name,
  Phone, WhatsApp).
- Focus-visible rings preserved on every new/changed interactive element,
  matching the existing design system's own utility classes.
- No genuine issue was found beyond the tablist arrow-key gap — nothing
  else was "fixed" speculatively, per section 13's own "only fix genuine
  issues."

## Mobile (section 12)

No phone-specific work was done or is needed — the redesign reuses the
exact same responsive utility classes (`sm:flex-row`, `h-11` touch
targets) the rest of the Counter Sale form already uses, which was already
tablet-friendly, desktop-first per Phase 3.2's own scope. Untouched by
this part.

## Architecture

**New files**: none — every change is either an extension of an existing
query/action/component file, or a genuinely new EXPORT inside one:

- `src/server/queries/admin/customers.ts` — `searchCustomers` rewritten
  (partial matching); `getRecentCustomers` added.
- `src/server/commerce/customer.ts` — `createCustomerInline` added,
  composing two pre-existing functions.
- `src/lib/validation/admin-counter-sale.ts` —
  `createCounterSaleCustomerSchema` added.
- `src/server/actions/admin/counter-sale.ts` —
  `createCounterSaleCustomerAction` and
  `getRecentCustomersForCounterSaleAction` added.
- `src/lib/counter-sale-form.ts` — `CounterSaleCustomerSelection`
  collapsed to `GUEST | CUSTOMER`; `validateCounterSaleCustomerSelection`
  simplified accordingly; `detectCreateFormPrefill` added (pure,
  independently tested).
- `src/components/admin/counter-sale-customer-panel.tsx` — rewritten:
  `CustomerMode` collapsed to `"GUEST" | "CUSTOMER"`; the New-mode's two
  plain fields became the new `CreateCustomerInline` sub-component (local
  to this file); Recent Customers added.
- `src/components/admin/counter-sale-form.tsx` — `newDisplayName`/
  `newPrimaryPhone` state and props removed entirely (no longer needed —
  the panel resolves a real customer id before submit); customer-mode
  branching in `handleSubmit`/`customerLabelForSummary` simplified from a
  3-way to a 2-way match.

**Nothing in `src/server/commerce/counter-sale.ts` or
`src/lib/validation/admin-counter-sale.ts`'s `counterSaleCustomerSchema`/
`createCounterSaleSchema` changed** — the entire redesign is additive at
the query/action/component layers, with the final sale-submission contract
between client and server completely unchanged (still `GUEST | EXISTING |
NEW` server-side; the client now simply never sends `NEW`).

## Testing (section 15)

**656 tests passing** (639 from Phase 3.6 (all parts) + 17 new for this
part):

- `src/server/queries/admin/__tests__/customers.test.ts` (+5 tests):
  partial (prefix) Customer ID match; partial phone-number-fragment
  match; the digit-count floor correctly excludes a 1–2 digit query from
  phone matching at all; `getRecentCustomers` orders by `lastOrderAt`
  descending and excludes never-ordered customers; respects its `limit`
  parameter. Every pre-existing test in this file (exact customerId,
  partial name, full-format phone, cross-field WhatsApp/primary match,
  blank/no-match queries) passes unmodified.
- `src/server/commerce/__tests__/customer.test.ts` (+5 tests, new
  `createCustomerInline` describe block): creates a brand-new customer
  with name/phone/WhatsApp; creates with no WhatsApp when none is given;
  reuses an existing customer for an already-known phone WITHOUT
  overwriting their name or WhatsApp number; rejects an invalid phone
  without creating anything; still creates and selects the customer when
  only the optional WhatsApp number is malformed.
- `src/server/actions/admin/__tests__/counter-sale.test.ts` (new file, 7
  tests, real Postgres + the same real in-memory cookie-store mock
  `admin/__tests__/returns.test.ts` already established): `UNAUTHORIZED`
  for all three new/existing actions with no session; `VALIDATION` for a
  phone-less create request; an authenticated admin creates a real,
  `KLQ-`-prefixed, DB-findable customer; two calls for the same phone
  resolve to the identical customer, never a duplicate; the recent-
  customers action returns a real array once authenticated.
- `src/lib/__tests__/counter-sale-form.test.ts` (net +4 tests):
  `validateCounterSaleCustomerSelection`'s `NEW`-mode tests replaced with
  the collapsed `CUSTOMER` mode's two tests (blocks/passes); the
  `getCounterSaleSubmitGate` test renamed from "existing" to "customer"
  mode, same assertion; six new `detectCreateFormPrefill` tests (digits-
  only query, punctuated phone query, name-like query, full Customer ID,
  partial Customer ID fragment, empty query).

Section 15's full list (Guest flow, existing-customer search, search by
phone, search by name, search by Customer ID, create new customer,
automatic selection after creation, Recent Customer selection, keyboard
navigation, Counter Sale regression) is covered above at the query/
commerce/action layer, plus the manual verification below for the parts
only observable end-to-end (real page markup, a real multi-step
create-then-sell flow). Keyboard-navigation logic itself
(`nextSearchResultIndex`) was already fully unit-tested by Phase 3.2 and
is unchanged; this codebase has no component-rendering test tooling
(no jsdom/Testing Library anywhere in the repository), consistent with
every prior phase's own testing convention — actual DOM-level keyboard
interaction is verified manually below, not via a new testing paradigm
introduced just for this part.

## Regression (section 16)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 656/656 passing, run twice (live dev database, and a
  from-scratch database — see below) with identical results.
- `npm run build` — succeeds.
- **No new migration** — this part touches no schema. Re-verified per
  "protect every previous phase": created `shop_fresh_verify_p365`,
  applied all 14 existing migrations, confirmed **zero drift**
  (`prisma migrate diff --exit-code`), ran `prisma/seed.ts` and
  `prisma/create-admin.ts` successfully, ran the full 656-test suite
  against it (100% pass), then dropped the database. The real shared dev
  database's `orders` (8) and `customers` (5) counts were confirmed
  unchanged before and after this verification round.
- Manual verification (no browser-automation tool available in this
  environment, same disclosed limitation as every prior phase): a real
  admin session was minted directly (a genuine `AdminSession` row +
  hashed token, the same mechanism `createAdminSession` uses) and used to
  fetch `/admin/counter-sale` with a real cookie — HTTP 200, the rendered
  markup confirmed exactly two `role="tab"` elements (`Guest`, `Customer`)
  with correct `aria-selected`/roving `tabIndex`, and confirmed the old
  "Existing"/"New" labels are gone. A real, unmocked integration script
  then exercised the full new flow against the live dev database: (1) an
  inline-created customer via `createCustomerInline`; (2) the SAME
  customer found by partial phone, partial name, AND a partial Customer ID
  fragment via the enhanced `searchCustomers`; (3) a second inline-create
  call for the identical phone resolving to the same row, never a
  duplicate; (4) a full `createCounterSale` completed with that customer
  selected (`mode: "EXISTING"`, exactly what the redesigned UI now always
  sends), confirming the order links to the correct customer and
  `lastOrderAt` updates; (5) `getRecentCustomers` immediately surfacing
  that same customer afterward. All 5 scenarios passed; the admin session,
  admin user, customer, product, and order created by the script were all
  deleted afterward, confirmed via direct count against the shared dev
  database (unchanged before/after: 8 orders, 5 customers).
- The long-running dev server (restarted earlier in this session) was
  left running throughout — no schema change in this part, and Next's own
  file-watching/HMR picked up every component/server file edit.

## Known limitations

- **Partial Customer ID / phone search no longer uses a B-tree index** —
  a documented, deliberate tradeoff (see "Search experience" above), not
  an oversight. Correct at this shop's real customer-table size; a
  trigram/GIN index is the fix if that ever changes.
- **Recent Customers has no per-cashier scoping** — it's shop-wide "most
  recently transacted with," not "recently searched by THIS admin
  session." No per-admin-user activity tracking exists anywhere in this
  codebase to build that from; adding it would be new, out-of-scope
  infrastructure for a quick-pick convenience feature.
- **No component-level automated test exercises the actual DOM keyboard
  interaction** (arrow keys moving a live highlight, focus landing on the
  Clear button) — consistent with this codebase's existing testing
  convention (pure-logic + real-Postgres tests only, no jsdom/RTL
  anywhere), verified instead via the manual script and markup checks
  above, same disclosed limitation every prior phase's own "Tests"
  section already carries.

## Architecture decisions

- **Eager creation over deferred creation.** The old `NEW` mode deferred
  actual customer creation until the final "Complete Sale" submit. This
  redesign creates (or finds) the customer AT THE MOMENT "Create &
  Continue" is clicked — a deliberate architectural shift, not a UI-only
  change — because section 7's "Automatically selected... Sale
  continues" and section 10's "Customer Card" both require a REAL,
  already-existing `Customer.id` to display (Customer ID, phone, Last
  Purchase) the moment creation happens, not a still-pending draft.
- **New commerce-layer function, not action-layer logic.** The
  create-or-find-plus-optional-WhatsApp composition
  (`createCustomerInline`) was deliberately placed in
  `server/commerce/customer.ts`, not inline in the Server Action —
  matching this codebase's consistent architecture (actions are thin
  auth+validation+delegate wrappers; commerce-layer functions hold real
  domain logic and are what gets directly, thoroughly tested with real
  Postgres).
- **The server's GUEST/EXISTING/NEW contract was deliberately left
  alone.** Changing `createCounterSale`'s own domain type to match the
  UI's new two-mode shape was considered and rejected: `NEW` is still
  valid, meaningful domain infrastructure (any future caller — a bulk
  import script, a different UI — could still construct it), and
  narrowing it would be a real, unrequested architecture change well
  beyond "redesign the customer SELECTION UX."

## Final Part 1 verdict

> The Counter Sale experience allows a cashier to choose only between
> Guest and Customer, search customers using a single unified search
> field, automatically create a new customer when none exists,
> immediately continue the sale without unnecessary steps, and preserve
> all existing commerce behavior while significantly simplifying the
> retail workflow.

Demonstrated true, with evidence cited above: exactly two choices exist in
the redesigned tablist, with the old three-way `Existing`/`New` split
removed from both the client's `CustomerMode` type and its rendered
markup; one unified search box replaces three separate fields, now
genuinely supporting partial name, partial phone, and partial/full
Customer ID matching (proven directly, including the specific gap audited
away — the old phone search required a COMPLETE number); a customer not
found by search is created inline and automatically selected via a new,
directly-tested commerce-layer function that reuses Phase 3.1's engine
verbatim, never duplicating or bypassing phone normalization; the sale
continues with zero extra steps in every scenario tested, including the
manual end-to-end script's full create-then-sell path; and the server's
own commerce layer, domain contract, and every pre-existing Counter Sale
test remain completely unmodified and passing. Full test suite passes
(656/656, including a from-scratch database run); fresh-database
verification passes (14 migrations, zero drift, no new migration needed);
production build passes; documentation is complete.

Changes across Phase 3.1 through Phase 3.5 (all parts) and Phase 3.6 (all
four parts) remain uncommitted together in the working tree, alongside
this part's changes, per instruction. Phase 3.6.5 Part 2 has not been
started — awaiting review.

## Part 2 — Discount Engine & Effective Item Pricing

Date: 2026-08-08

Adds real retail negotiation to Counter Sale: a single Flat-or-Percentage
discount per order, allocated proportionally across every purchased line
via a deterministic, exact-sum rounding algorithm, permanently snapshotted
per line as an immutable `effectiveLineTotalInPaise`. Returns and
Exchanges are updated to read that effective, actually-paid value instead
of the original catalog price. Online Checkout is completely untouched.

## Audit of the current implementation for Part 2 (before writing any code)

- **`prisma/schema.prisma`** (`Order`, `OrderItem`) — confirmed no
  discount/coupon concept existed anywhere in the codebase (grepped for
  "discount"/"coupon"/"promo" across `src/` and the schema — zero
  matches). `Order.totalInPaise` was always exactly
  `subtotalInPaise + deliveryFeeInPaise`; `OrderItem` had only
  `unitPriceInPaise`/`lineTotalInPaise` (the original catalog snapshot,
  Phase 1) — nothing representing a post-discount, actually-paid amount.
- **`src/server/commerce/order-core.ts`** (`resolveAndDecrementOrderLines`)
  — THE shared inventory/pricing primitive both `place-order.ts` (Online)
  and `counter-sale.ts` (Counter) call. Confirmed discount math must NOT
  live here — it's shared by both flows, and discounting must stay
  Counter-only (section 12, below). Discount computation and allocation
  were instead added entirely inside `counter-sale.ts`, downstream of
  this shared function's own `subtotalInPaise`/`lines` output.
- **`src/lib/exchange-price.ts`** (`getExchangePriceDifference`, Phase
  3.5 Part 5) — found the ONE place this codebase already computed a
  price-related figure for a return/exchange: it multiplied
  `OrderItem.unitPriceInPaise` (the ORIGINAL catalog price) by quantity.
  This was the concrete gap section 8/9 asked to close — confirmed via
  grep that the ONLY real call site is the admin Return Detail page's
  `PriceDifferenceSummary`.
- **`src/lib/return-eligibility.ts`** — confirmed this module is PURELY
  quantity/time-based (delivered-at, return window, claimed vs.
  purchased quantity) and touches no price at all — nothing here needed
  to change; eligibility and money are, and remain, cleanly separated
  concerns.
- **`src/server/commerce/return-fulfillment.ts`** (`receiveReturnRequest`)
  — confirmed inventory restoration/issuance (`applyInventoryDelta`)
  operates purely on quantities, never on price — discount allocation
  therefore cannot affect inventory correctness by construction, only
  the money figures displayed/derived alongside it.
- **`src/components/customer-portal/return-history.tsx`**, the
  customer-portal order detail page, and the public order confirmation
  page — confirmed exactly which surfaces display item/order pricing
  today (return-history.tsx displays none at all), scoping precisely
  which files needed a display update (sections 13/14).
- **`src/server/queries/admin/orders.ts`** / **`.../returns.ts`** /
  **`.../customer-portal/orders.ts`** — confirmed none of these queries
  use a Prisma `select` restricting `Order`/`OrderItem` fields (full-model
  `include`s throughout), so the new schema columns are automatically
  available to every existing caller with zero query changes.

## Discount model (sections 2, 3, 4, 5)

**Schema** (`prisma/schema.prisma`, migration
`20260808190000_phase3_6_5_part2_discount_engine`):

- `DiscountType` enum: `FLAT | PERCENTAGE` — exactly one, never stacked
  (section 2's own instruction; there is deliberately no "both" variant
  to represent).
- `Order.discountType` (nullable — null means no discount, the default
  for every pre-existing row and every ONLINE order forever),
  `discountValue` (the raw input: paise for FLAT, a whole percent 1-100
  for PERCENTAGE — kept only for display/audit, never used directly for
  money math after creation), `discountReason` (optional free text),
  `discountInPaise` (`Int @default(0)` — the COMPUTED, actually-applied
  amount, always present, independent of type/value's meaning).
- `OrderItem.effectiveLineTotalInPaise` (`Int`, NOT NULL) — the
  immutable, post-discount, actually-paid total for that line. Backfilled
  to equal `lineTotalInPaise` for every pre-existing row in the same
  migration (no pre-existing order ever had a discount, so this is a
  true fact, not invented data — mirrors this codebase's own established
  backfill philosophy from every prior schema-adding phase).

**`src/lib/discount.ts`** (new, pure, DB-free — mirrors
`src/lib/basket-math.ts`'s own convention):

- `computeDiscountInPaise({subtotalInPaise, discount})` — validates and
  computes the actual discount amount. FLAT must be a positive integer
  paise amount; PERCENTAGE must be a positive whole integer 1-100
  (fractional percentages are a deliberate, documented simplification —
  see "Known limitations"). A discount that would exceed the subtotal
  is a validation ERROR, never silently clamped — capping what an admin
  typed without telling them would undermine trust in the total shown.
- `allocateDiscountAcrossLines(lines, discountInPaise)` — the line-level
  allocation (below).
- `effectivePriceForQuantity(...)` — the partial-quantity derivation used
  by Returns/Exchanges (below).

**UI** (section 3, "Simple UX. No complicated pricing screen."):
`CounterSaleDiscountPanel` (new,
`src/components/admin/counter-sale-discount-panel.tsx`) — three large
buttons (No Discount / Flat ₹ / Percentage %, mirroring the Payment
Method group's own exact button style already in this form), one number
input for whichever is chosen, and an optional reason `<select>`
(section 4's own list — Negotiation / Festival / Damaged Box / Owner
Approval / Other, the last revealing a free-text field). A live preview
("Discount: -₹150") is computed via the EXACT SAME `computeDiscountInPaise`
the server calls — never a second, hand-rolled preview calculation.

## Line item allocation algorithm (section 6, 11) — the largest-remainder method

`allocateDiscountAcrossLines` (`src/lib/discount.ts`) distributes the
order's total discount across every line proportionally to that line's
ORIGINAL `lineTotalInPaise`, using the **largest-remainder method**
(a.k.a. Hamilton's apportionment — the standard, well-known algorithm for
"split an integer total proportionally among integer buckets, keep the
sum exact"):

1. Compute each line's exact fractional share:
   `discountInPaise * lineTotalInPaise / subtotalInPaise`.
2. Take the floor of each share.
3. The difference between the target discount and the sum of the floors
   is the "leftover" — always a non-negative integer smaller than the
   number of lines.
4. Distribute that leftover, one paisa at a time, to the lines with the
   LARGEST fractional remainder, largest first (ties broken by original
   array order — fully deterministic for identical input, required since
   `effectiveLineTotalInPaise` is a permanent historical snapshot, never
   something that could vary run to run).

**Why this method, not a simpler alternative** — two were considered and
rejected:

- Rounding each line's share independently (`Math.round`) can overshoot
  or undershoot the target discount by a few paise once summed — this
  codebase never accepts a total that doesn't reconcile exactly.
- Letting one line (e.g. the last) silently absorb the entire rounding
  remainder is simpler but can make one line disproportionately over- or
  under-discounted, especially unfair if that line happens to be small.

**Proven directly**, not just reasoned about: `allocateDiscountAcrossLines`
has dedicated tests asserting the sum of allocated effective totals
equals `subtotal - discount` EXACTLY across a deliberately awkward set of
line totals and multiple discount amounts (including a discount equal to
the full subtotal, and single-line orders), and that the algorithm is
fully deterministic (identical input → identical output, every time). The
brief's own worked example (Shirt ₹500, Pant ₹700, Belt ₹300, discount
₹150 → ₹450/₹630/₹270) is reproduced verbatim as its own test, both at the
pure-function level and end-to-end through a real `createCounterSale` call.

## Returns (section 8) — why effective price, never the original

Returns must use the effective paid amount because that is what the
customer actually gave the shop for that item — the original catalog
price is not a fact about this transaction once a discount was
negotiated, it's a fact about the CATALOG, which this order's own
historical record must never re-derive from (exactly the same "snapshot,
not live reference" principle `unitPriceInPaise` itself was already built
on in Phase 1, extended one level further: `unitPriceInPaise` snapshots
the catalog price at PURCHASE time against later catalog changes;
`effectiveLineTotalInPaise` snapshots the NEGOTIATED price against the
catalog price itself). Crediting a customer the pre-discount amount for a
returned item they paid a discounted amount for would systematically
overstate what a return should be worth — a real, if currently unbuilt-out,
financial-integrity concern this schema now has the correct data to
support the moment a refund-amount feature is built.

No refund-AMOUNT computation exists anywhere in this codebase yet (Phase
3.5 built the return workflow/inventory reconciliation, never a money-back
figure) — this phase does not invent one either (out of scope: no
"Partial Payment"/"Outstanding Ledger," section 19). What this phase DOES
do is make sure every return-adjacent price DISPLAY (the one that exists —
the admin Return Detail page's exchange price-difference summary) and
every derivation available to a FUTURE refund feature reads
`effectiveLineTotalInPaise`, never `unitPriceInPaise`, so that future work
starts from the right number instead of inheriting a silent, hard-to-notice
overstatement bug.

## Exchanges (section 9)

`getExchangePriceDifference` (`src/lib/exchange-price.ts`) changed
signature from `{originalUnitPriceInPaise, replacementUnitPriceInPaise,
quantity}` (which multiplied catalog price × quantity internally) to
`{originalValueInPaise, replacementValueInPaise}` — two already-computed
VALUES, never a unit price to multiply. The caller (the admin Return
Detail page) now computes `originalValueInPaise` via
`effectivePriceForQuantity` (below) from the order item's
`effectiveLineTotalInPaise` — the customer's actual paid value for the
returned quantity — while `replacementValueInPaise` remains a plain
catalog-price × quantity calculation, since the REPLACEMENT is a brand
new item issued at ITS OWN current price; no discount from the original
order carries over to it (nothing in the brief asked for that, and doing
so would conflate two unrelated transactions' pricing).

Reproduces the brief's own example exactly, as a dedicated end-to-end
test: a ₹300 belt at 10% off (effective ₹270) exchanged for a ₹350
replacement → `CUSTOMER_PAYS` ₹80.

## Partial returns after discount allocation (section 10)

`effectivePriceForQuantity({effectiveLineTotalInPaise, purchasedQuantity,
requestedQuantity})` (`src/lib/discount.ts`) is the one new derivation
Returns/Exchanges use for a quantity that ISN'T the full purchased amount
of a line:

- Requesting the FULL purchased quantity always returns EXACTLY
  `effectiveLineTotalInPaise` — no rounding drift for the common "return
  the whole line" case (the ratio is exactly 1).
- A genuinely partial quantity is `Math.round(effectiveLineTotalInPaise *
  requestedQuantity / purchasedQuantity)` — a proportionally-rounded
  share.

**Audited and proven, not assumed, to still work correctly**: return
QUANTITY tracking (`OrderItem.returnClaimedQuantity`, the
already-existing, price-independent guarded-`updateMany` claim mechanism
from Phase 3.5 Part 1) never reads price at all, so discount allocation
introduces zero risk to it by construction — confirmed directly with a
dedicated end-to-end test that discounts a 2-unit line, returns 1 unit,
asserts `returnClaimedQuantity`/remaining-quantity are exactly correct,
derives the correct proportional effective value (₹450 out of a ₹900
effective 2-unit line), THEN returns the second remaining unit and
confirms claimed quantity reaches exactly 2 — proving partial-then-partial
claims reconcile correctly against the same discounted basis with no
drift.

## Online Checkout scope (section 12) — Counter-only, by design

Online Checkout (`placeOrderForBasket`,
`src/server/commerce/place-order.ts`) is completely untouched: it builds
each `OrderItem` with `effectiveLineTotalInPaise: line.lineTotalInPaise`
(always identical to the original — never reads or writes any discount
field), and `Order.discountType`/`discountValue`/`discountInPaise` are
simply never set, staying at their no-discount defaults (null/null/0)
forever for every online order.

**Reasoning**: this codebase never had ANY discount/coupon mechanism
before this phase (confirmed by the audit above) — Online Checkout is a
fixed-catalog-price self-checkout, matching standard e-commerce UX (no
haggling online); Counter Sale is an in-person negotiated transaction,
which is precisely what section 1's "real retail negotiation" is about.
Extending discounting to Online Checkout was never asked for and would
be a materially different, unrequested feature (coupon codes, promotional
pricing, a checkout-UI redesign) — not a natural extension of "let a
cashier negotiate a price face to face." The existing SHARED primitive
both flows call (`resolveAndDecrementOrderLines`,
`src/server/commerce/order-core.ts`) was deliberately left untouched —
all discount math lives downstream of it, entirely inside
`counter-sale.ts` — so this separation is structural, not just a
convention that could accidentally erode: Online Checkout has no code
path that could EVER set a discount, not merely a UI that doesn't offer
one.

## Customer history / Admin Order Detail (sections 13, 14)

**Customer-facing** (customer portal order detail, the public order
confirmation page): each item's displayed total switched from
`lineTotalInPaise` to `effectiveLineTotalInPaise`, and the "each" unit
price is now a derived effective-per-unit figure
(`Math.round(effectiveLineTotalInPaise / quantity)`) so the displayed
arithmetic stays internally consistent. A plain "Discount" line (amount
only) was added between Subtotal and Delivery, shown only when
`discountInPaise > 0` — ordinary, expected retail-receipt transparency
("you got ₹150 off"), NOT the internal per-item ALLOCATION methodology
(section 13's own distinction) — no percentage, no type, no reason is
ever shown to a customer. Both surfaces render byte-identical output for
every ONLINE order (where `effectiveLineTotalInPaise` always equals
`lineTotalInPaise` and `discountInPaise` is always 0) — zero visible
change for the vast majority of historical and future orders.

**Admin-facing** (admin Order Detail): each item shows its effective
total, with the ORIGINAL total struck through above it whenever a
discount actually changed that line (never shown at all when it didn't —
no clutter for the common case). The Subtotal → Discount → Delivery →
Total breakdown shows the discount's type/percentage and reason inline
("Discount (10%) — Negotiation"), giving the admin everything section 14
asks for (original subtotal, discount, Grand Total, effective item
pricing) without exposing the allocation ALGORITHM itself. The admin
Return Detail page gained an "Effective value" line per requested item
(`effectivePriceForQuantity` applied to the requested quantity) alongside
the existing (now effective-value-based) exchange price-difference
summary.

## Security (section 15)

The discount amount is **always recomputed server-side**, inside the
same database transaction that resolved the order's real subtotal from
FRESH variant prices — never trusted from the client. The client's own
live preview (`CounterSaleDiscountPanel`) calls the identical
`computeDiscountInPaise` function purely for UX feedback; if that
preview and the server ever disagreed (a stale price, a modified request),
the SERVER's independent recomputation is what actually gets persisted —
proven directly: `createCounterSale`'s validation happens entirely inside
its `db.$transaction`, downstream of `resolveAndDecrementOrderLines`'s own
freshly-read prices, and a discount that fails validation (percentage
over 100, an amount exceeding the ACTUAL server-computed subtotal) throws
and rolls back the ENTIRE transaction — including the stock decrement
already performed — proven by a dedicated test asserting stock is
completely untouched and no order exists after a rejected discount.

## Testing (section 16)

**699 tests passing** (656 from Phase 3.6.5 Part 1 + 43 new for this
part):

- `src/lib/__tests__/discount.test.ts` (new, 27 tests):
  `computeDiscountInPaise` — no discount, flat, percentage, rounding,
  zero/negative/non-integer rejection, percentage-over-100 rejection,
  exactly-100%, discount-exceeds-subtotal rejection, discount-equal-to-
  subtotal acceptance. `allocateDiscountAcrossLines` — the brief's own
  worked example verbatim; exact-sum-to-target across awkward line-total
  sets and multiple discount amounts; never-negative; zero/negative
  discount no-ops; single-line; full-subtotal discount (Grand Total
  zero); determinism. `effectivePriceForQuantity` — full quantity exact,
  the brief's own exchange figure, partial-quantity proportional
  derivation and rounding, defensive edge cases.
- `src/lib/__tests__/exchange-price.test.ts` (rewritten for the new
  `{originalValueInPaise, replacementValueInPaise}` signature): all
  three difference types, plus a dedicated test proving the new
  signature correctly reflects an already-discounted original value
  (the brief's own ₹270/₹350/₹80 example).
- `src/server/commerce/__tests__/counter-sale.test.ts` (+9 tests, new
  "discounts" describe block): flat discount end-to-end (order fields +
  item effective total); percentage discount; no discount (defaults);
  100% discount (Grand Total zero); the brief's own 3-item worked
  example end-to-end; rounding (sum-of-effective-totals equals Grand
  Total exactly); discount-exceeds-subtotal rejection (stock untouched,
  no order created — proving the transaction rollback); percentage-over-
  100 rejection.
- `src/server/commerce/__tests__/discount-returns-exchange.test.ts` (new
  file, 4 tests, real Postgres, the full real `createCounterSale` →
  `createReturnRequest` → `updateReturnRequestStatus` →
  `receiveReturnRequest` chain, nothing mocked): a full-quantity return
  of a discounted line uses the effective value, never the catalog price;
  inventory restoration is exactly correct regardless of discount; a
  partial return of a discounted 2-unit line derives the correct
  proportional value AND leaves quantity-claim tracking exactly correct,
  proven across two sequential partial claims; the exchange
  price-difference calculation reproduces the brief's own ₹270 → ₹350 →
  ₹80 example end-to-end against real database rows.
- `src/server/commerce/__tests__/place-order.test.ts` (+2 assertions on
  an existing test, section 12): a real Online order's
  `effectiveLineTotalInPaise` equals `lineTotalInPaise` and
  `discountType`/`discountInPaise` stay at their no-discount defaults.

Section 16's full list (flat, percentage, zero, large discount, rounding,
item allocation, allocation-total-equals-Grand-Total, returns after
discount, exchange after discount, partial return, regression) is covered
above, each traceable to a specific named test.

## Regression (section 17)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 699/699 passing, run twice (live dev database, and
  a from-scratch database — see below) with identical results.
- `npm run build` — succeeds.
- **New migration**: `20260808190000_phase3_6_5_part2_discount_engine` —
  `DiscountType` enum, four new `Order` columns, one new NOT NULL
  `OrderItem` column (added nullable, backfilled to equal
  `lineTotalInPaise` for every existing row, then constrained NOT NULL —
  the standard safe pattern for adding a required column to a populated
  table). Re-verified per "protect every previous phase": created
  `shop_fresh_verify_p366`, applied all 15 migrations, confirmed **zero
  drift** (`prisma migrate diff --exit-code`), ran `prisma/seed.ts` and
  `prisma/create-admin.ts` successfully, ran the full 699-test suite
  against it (100% pass), then dropped the database. The real shared dev
  database's `orders` (8), `customers` (5), and `return_requests` (1 — the
  real return request created via manual browser testing in an earlier
  phase, correctly left untouched) counts were confirmed unchanged before
  and after.
- **A genuine issue found and fixed during manual verification**: the
  long-running dev server (already running from earlier in this session,
  started BEFORE this phase's schema migration) held a stale, in-memory
  Prisma Client that predated the new columns — an admin Order Detail
  page fetch returned 200 but silently rendered NO discount information
  at all (the new fields were `undefined` on the stale client's query
  results, so `order.discountInPaise > 0` was always false). Restarting
  the dev server (which reloads the freshly-`prisma generate`-d client)
  fixed this immediately, confirmed by re-fetching the same page and
  seeing the discount render correctly. This is a genuine operational
  lesson, not a code bug: **a schema migration always requires a dev
  server restart**, the same requirement every prior phase's own
  regression section implicitly relied on but this phase is the first to
  have caught failing to do so live, mid-verification.
- Manual verification (no browser-automation tool in this environment,
  same disclosed limitation as every prior phase): after the restart
  above, a real, unmocked script exercised (1) a genuine 3-item
  (Shirt/Pant/Belt) discounted counter sale via `createCounterSale`,
  confirming subtotal/discount/Grand Total match the brief's own figures
  exactly; (2) a real HTTP fetch (with a genuine minted admin session
  cookie) of the resulting order's `/admin/orders/{orderNumber}` page,
  confirming the rendered markup contains the discount reason and
  correct amount; (3) a real exchange on the discounted belt (10% off,
  effective ₹270) for a ₹350 replacement, then a real HTTP fetch of
  `/admin/returns/{returnNumber}`, confirming the rendered markup
  contains "Effective value" and the correct "Customer Pays" price-
  difference summary. All 3 scenarios passed; all script-created data
  (orders, products, customers, admin session/user, category) was
  deleted afterward, confirmed via direct count against the shared dev
  database (unchanged before/after).

## Known limitations (Part 2)

- **Whole-percent-only discounts** — fractional percentages (e.g. 12.5%)
  are rejected by `computeDiscountInPaise`'s validation. A deliberate
  simplification for "simple UX, no complicated pricing screen" (section
  3); extending to fractional percentages would mean storing basis points
  instead of a plain integer, a small, backward-compatible schema change
  if a genuine business need for it ever arises.
- **Partial-quantity return/exchange values are proportionally rounded,
  not perfectly reconciling across multiple partial actions** — returning
  1 of 2 units, then later the other 1, can differ by ±1 paisa in total
  from returning both at once, purely because this system doesn't track
  which SPECIFIC physical unit is being returned (only a quantity count).
  This never affects inventory correctness (quantity tracking is entirely
  separate from price) — only a cosmetic display amount, and only for the
  genuinely rare case of splitting one line's return across multiple
  separate requests.
- **No refund-AMOUNT feature exists** — this phase makes sure the correct
  effective-price DATA is available and used everywhere a return/exchange
  price is already computed or displayed, but does not itself add a "process
  a refund of ₹X" capability — that remains explicitly out of scope
  (KhataBook/Outstanding Ledger/Partial Payment, section 19), for a later
  phase to build on top of the now-correct data this phase establishes.
- **Exchange replacement pricing never inherits the original discount** —
  a deliberate design decision (see "Exchanges" above), not an oversight:
  the replacement is priced at its own current catalog price, full stop.

## Architecture decisions (Part 2)

- **Discount math lives entirely inside `counter-sale.ts`, never inside
  the shared `resolveAndDecrementOrderLines`** (`order-core.ts`) — the
  one primitive Online and Counter both call. This is what makes the
  Counter-only scope STRUCTURAL rather than a UI-only convention: Online
  Checkout's code path has no way to ever compute or apply a discount,
  because the function that would need to isn't even in its call graph.
- **`effectiveLineTotalInPaise` is a LINE-level snapshot, not a per-unit
  one** — matching the brief's own worked example (which never goes finer
  than "Belt ₹270," never "each unit within a multi-quantity Belt line").
  Per-unit/partial-quantity values are always a pure, on-demand DERIVATION
  (`effectivePriceForQuantity`) from this one stored fact, never a second
  persisted snapshot — avoiding two numbers that could drift out of sync.
- **`getExchangePriceDifference`'s signature changed from
  unit-price-plus-quantity to two pre-computed values** — pushing the
  "how do I get the right original value" decision (effective, discount-
  aware) to the ONE real call site, rather than teaching the shared
  price-difference function itself about discounts, snapshots, or
  quantities it has no other reason to know about.
- **The Grand Total formula stays `subtotal + delivery - discount`
  everywhere**, with each order TYPE only ever exercising one adjustment
  (Counter: never delivery; Online: never discount) — a single, uniform
  formula rather than two divergent ones per order source.

## Final Part 2 verdict

> Counter Sales support real retail bargaining through Flat and
> Percentage discounts, every OrderItem stores immutable effective
> pricing using deterministic proportional allocation, Returns and
> Exchanges correctly use those effective prices, and all calculations
> remain server-authoritative while preserving the integrity of the
> existing commerce engine.

Demonstrated true, with evidence cited above: Flat and Percentage
discounts are both fully implemented, validated, and applied exactly
once per order (section 2); every `OrderItem` permanently stores
`effectiveLineTotalInPaise`, computed via the largest-remainder method
and proven to sum EXACTLY to the Grand Total in every tested scenario
including deliberately awkward rounding cases (sections 6, 7, 11); Returns
and Exchanges were audited and updated to read this effective value
exclusively — proven end-to-end against real database rows, including
the brief's own worked examples reproduced exactly — and partial returns
of a discounted, multi-quantity line remain fully correct, with quantity
tracking proven entirely unaffected by price (sections 8, 9, 10); every
discount computation happens server-side, inside the same transaction
that resolves real inventory prices, with a failing discount rolling back
the entire transaction including any stock decrement already performed
(section 15); Online Checkout is structurally, not just conventionally,
incapable of ever applying a discount (section 12); and every pre-existing
commerce test, across Counter Sale, Returns, Exchanges, and Online
Checkout, continues to pass unmodified or with only additive assertions.
Full test suite passes (699/699, including a from-scratch database run);
fresh-database verification passes (15 migrations, zero drift); production
build passes; documentation is complete.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), and Phase 3.6.5 Part 1/Part 2 remained uncommitted together
in the working tree, per instruction, at the time Part 2 was reviewed and
approved.

## Part 3 — Partial Payments & Khata Foundation

Date: 2026-08-08

Adds real retail-credit support to Counter Sale: a Full-or-Partial payment
choice per order, an `amountReceivedInPaise`/`outstandingInPaise` pair
computed once (server-side) from the order's own final, discounted Grand
Total and persisted as immutable historical accounting, and a new
`PARTIALLY_PAID` payment-status value derived from that pair. Partial
Payment is only meaningful with a Customer attached — Guest sales are
unaffected, by construction. Returns and Exchanges continue to use
effective pricing exactly as Part 2 left them, entirely independent of
Outstanding. This is a foundation only: no KhataBook dashboard, ledger, or
"Receive Payment" flow exists yet — those are explicitly Parts 4–6.

## Audit of the current implementation for Part 3 (before writing any code)

- **`prisma/schema.prisma`** (`Order`, `PaymentStatus`) — confirmed
  `Order.paymentStatus` was a plain `PAID | UNPAID | REFUNDED | FAILED`
  enum with no partial concept, and `createCounterSale` always wrote
  `paymentStatus: "PAID"` unconditionally (grepped every write site — the
  Counter path was the only one that ever wrote a payment status other
  than the Online flow's own `UNPAID`-until-COD lifecycle). No
  `amountReceivedInPaise`/`outstandingInPaise`-shaped columns existed
  anywhere.
- **`src/lib/order-lifecycle.ts`** (`PAYMENT_TRANSITIONS`,
  `PAYMENT_STATUS_LABEL`, `PAYMENT_STATUS_ACTION_LABEL`) — the admin
  `updatePaymentStatus` mutation's transition table. Confirmed this is a
  GENERIC, source-agnostic admin action (used by Online's own COD
  collection flow too) — adding `PARTIALLY_PAID` here needed care so it
  couldn't be reached as an ad-hoc admin override (see "Payment status"
  below).
- **`src/server/commerce/counter-sale.ts`** (Part 2's discount engine) —
  confirmed the exact point where `subtotalInPaise - discountInPaise`
  already produces the order's Grand Total, inside the same
  `db.$transaction` as the discount validation — this is the one place a
  payment amount can be validated against the REAL, final, negotiated
  total rather than a client-supplied or pre-discount figure.
- **`src/server/commerce/place-order.ts`** (Online Checkout) — confirmed
  it shares no code path with `counter-sale.ts`'s discount/payment logic
  (both call the same `resolveAndDecrementOrderLines` primitive but
  nothing beyond it) — the same "structurally incapable" pattern Part 2
  established for discounts extends naturally to Partial Payment: Online
  simply has no payment-mode input to accept in the first place.
- **`src/server/commerce/returns.ts`**, **`admin-returns.ts`**,
  **`return-fulfillment.ts`** — grepped for
  `amountReceivedInPaise`/`outstandingInPaise`/`paymentStatus`: zero
  matches in any of the three. Returns and Exchanges read/write neither
  quantity-tracking nor pricing fields that this phase touches — the
  independence the brief asks for (sections 7, 8) already existed by
  construction; this phase's job was to confirm it, not build it.
- **`src/lib/discount.ts`** — reviewed as the direct precedent for the new
  `src/lib/payment.ts`: same DB-free, pure, independently-testable
  convention, same "the caller decides what basis to compute against"
  design (there: subtotal; here: the caller's already-discounted Grand
  Total).
- **`src/server/queries/admin/orders.ts`** — confirmed (as Part 2 did for
  its own new columns) that `getAdminOrderByNumber` uses a full-model
  `include`, not a restricting `select` — the two new columns are
  automatically available with zero query changes.

## Payment model (sections 2, 3, 4)

- **`src/lib/payment.ts`** — a new pure module, mirroring
  `src/lib/discount.ts`'s exact shape: `PaymentInput` is a discriminated
  union, `{ mode: "FULL" }` or `{ mode: "PARTIAL", amountReceivedInPaise
  }`. `computePaymentOutcome({ grandTotalInPaise, payment })` returns
  either a validated `PaymentOutcome`
  (`amountReceivedInPaise`/`outstandingInPaise`/`paymentStatus`) or a
  typed error (`INVALID_AMOUNT` | `EXCEEDS_GRAND_TOTAL`).
- **FULL mode never reads a client-supplied amount at all** — the type
  `{ mode: "FULL" }` carries no amount field, so `amountReceivedInPaise`
  is always exactly `grandTotalInPaise`. This is the strongest possible
  reading of section 12 ("never trust browser totals"): for Full Payment
  there is no browser total to even distrust.
- **PARTIAL mode validates**: `amountReceivedInPaise` must be a
  non-negative integer (never negative, never fractional-paise), and must
  never exceed `grandTotalInPaise` (section 4's "prevent Received > Grand
  Total"). A `0` received amount is explicitly VALID — full credit, a
  customer taking goods with nothing paid yet — never rejected as if it
  were an invalid input.
- **Guest + Partial is rejected before any transaction work at all** — in
  `createCounterSale`, immediately after the existing `EMPTY_SALE` check
  and before the `db.$transaction` even opens, a `customer.mode ===
  "GUEST" && payment.mode === "PARTIAL"` check returns
  `PARTIAL_PAYMENT_REQUIRES_CUSTOMER` directly, with no DB access at all.
  Mirrored identically client-side in `getCounterSaleSubmitGate`
  (`src/lib/counter-sale-form.ts`) so the cashier sees this before ever
  submitting, not just as a server error after the fact. There is no
  silent downgrade to Full Payment anywhere — a rejected combination is
  always reported, never quietly coerced.
- **`payment` is optional everywhere it's threaded** —
  `createCounterSale`'s input, `counterSalePaymentSchema` in
  `admin-counter-sale.ts`, and `getCounterSaleSubmitGate`'s new `payment`
  parameter all default an omitted value to `{ mode: "FULL" }`. This
  exactly mirrors `discount`'s own Part 2 precedent and is what kept
  ~30 pre-existing test call sites (and every pre-Part-3 caller) working
  unchanged.

## Outstanding calculation (section 3)

Outstanding is always `grandTotalInPaise - amountReceivedInPaise`, and
`grandTotalInPaise` here is always the CALLER's own already-discounted
total (`subtotalInPaise - discountInPaise`, computed inside
`createCounterSale`'s transaction, downstream of the freshly-resolved
subtotal) — never the Subtotal, never a catalog/original price.
`computePaymentOutcome` itself has no way to enforce this (it only ever
subtracts from whatever total it's handed); a dedicated test
(`"rejects an amount that fits within the Subtotal but exceeds the
discounted Grand Total"`) proves the caller wiring makes this true in
practice: a ₹100,000 subtotal at 50% off (Grand Total ₹50,000) correctly
rejects a ₹60,000 "partial" payment even though ₹60,000 easily fits inside
the ₹100,000 Subtotal.

## Payment status (section 6)

`derivePaymentStatus(amountReceivedInPaise, grandTotalInPaise)` is a pure
function of the two accounting facts, not of which UI mode produced them:

- `received >= grandTotal` → `PAID` (covers both `FULL` mode by
  construction, and a `PARTIAL` payment that happens to equal the full
  Grand Total — including the ₹0/₹0 edge case of a 100%-discounted sale,
  which is correctly `PAID`, not `UNPAID`, since there's nothing left to
  collect).
- `received <= 0` → `UNPAID` (full credit — the ₹0-received Partial case).
- otherwise → `PARTIALLY_PAID`.

**`PARTIALLY_PAID` is reachable ONLY via `createCounterSale`'s own
computation** — `PAYMENT_TRANSITIONS["PARTIALLY_PAID"] = []`, and no other
status's transition array includes it as a target, so the generic admin
`updatePaymentStatus` mutation can never set or leave a status of
`PARTIALLY_PAID` through an ad-hoc override. This protects the
"immutable historical accounting" invariant below: an admin manually
flipping payment status to `PAID` or `UNPAID` (both still reachable, for
Online's own COD-collection use case) cannot happen while
`amountReceivedInPaise`/`outstandingInPaise` silently disagree with the
new status, because the ONE status that would need those fields to change
in step is precisely the one the generic mutation can never produce.
Reusing the existing enum plus a single new value, rather than inventing
a parallel "credit status" concept, was chosen because every existing
consumer of `PaymentStatus` (badges, filters, the admin transition UI)
already needed to handle it uniformly, and a second parallel concept
would have meant two payment-status displays cross-referencing each
other for no real benefit.

## Immutable historical accounting (section 5)

`amountReceivedInPaise`/`outstandingInPaise` are set EXACTLY ONCE, at
Counter Sale creation, and nothing in this phase ever updates them again —
not Returns, not Exchanges, not the generic `updatePaymentStatus` action.
A future "Receive Payment" phase (explicitly out of scope here, Parts
4–6) would be the first code ever to change them again. This was verified
by grep (zero writes to either column outside `counter-sale.ts` and the
Part-3 migration's backfill) and by the new
`payment-returns-exchange.test.ts` suite, which asserts both fields are
byte-identical before and after a real Return and a real Exchange against
a partially-paid order.

## Discount interaction (sections 3, 9)

Discount (Part 2) and Payment (Part 3) compose in the one obvious order:
Subtotal → Discount → Grand Total → Payment. `createCounterSale` computes
`grandTotalInPaise = subtotalInPaise - discountInPaise` first, then feeds
that into `computePaymentOutcome` — so Outstanding is always correct
relative to whatever the discount already negotiated down to, never the
pre-discount figure. Tested directly (`"Outstanding is computed from the
discounted Grand Total ... (discount + partial payment combined)"`): a
₹1,00,000 item with a ₹20,000 flat discount (Grand Total ₹80,000) and a
₹30,000 partial payment correctly yields ₹50,000 Outstanding, not
₹70,000.

## Returns (section 7) — why Outstanding is untouched

Returns continue to use `effectiveLineTotalInPaise`/
`effectivePriceForQuantity` exactly as Part 2 established — nothing about
that pricing path changed. Outstanding is a separate accounting fact: it
represents what the CUSTOMER still owes the SHOP for goods already
handed over, a running credit balance independent of whether some of
those goods are later physically returned. Rewriting Outstanding on a
return would conflate two different questions ("did the goods come back?"
vs. "was the cash for them ever collected?") that this codebase
deliberately keeps separate — a customer who took ₹1,000 of goods on
₹400 credit and returns half the goods still owes the same ₹600 of that
ORIGINAL credit; the return doesn't retroactively rewrite what was agreed
at sale time. Confirmed end-to-end
(`payment-returns-exchange.test.ts`): a full return and a partial
(one-of-two-lines) return of a partially-paid order both leave
`amountReceivedInPaise`/`outstandingInPaise`/`paymentStatus` completely
unchanged.

## Exchanges (section 8) — independence confirmed

Exchange price differences continue to use `getExchangePriceDifference`
against effective pricing exactly as Part 2 left it — replacement pricing
never reads or considers Outstanding. An exchange's price difference (the
customer paying or being owed the gap between original and replacement
value) is its own, separately-settled cash event; it is not a payment
toward the original sale's Outstanding balance, and this phase does not
build any mechanism that would make it one. Confirmed end-to-end: an
exchange on a partially-paid order computes the correct `CUSTOMER_PAYS`
difference while `amountReceivedInPaise`/`outstandingInPaise` on the
original order remain exactly as recorded at sale time.

## Online Checkout scope — unaffected by construction

`place-order.ts` unconditionally sets `amountReceivedInPaise:
totalInPaise, outstandingInPaise: 0` for every Online order, regardless of
its own `paymentStatus` (which stays `UNPAID` until COD collection,
completely untouched by this phase). This is a deliberate choice, not an
oversight: Online's `paymentStatus` already answers "has cash actually
been collected for this order," and Outstanding/Khata is a fundamentally
different concept (tracked retail credit). Making these two fields
reflect Online's REAL collection state (e.g., ₹0 received while
`UNPAID`) would conflate them and produce a confusing display — an
"Outstanding: ₹0" figure sitting next to an "Unpaid" badge reads like a
bug, not a feature. So Online orders are "fully reconciled against their
own total" unconditionally, by construction, and these fields are simply
never read for Online's own COD lifecycle purposes. This mirrors Part 2's
own "Online Checkout scope" reasoning almost exactly.

## Counter Sale UX (section 9)

A new "Payment" section in `CounterSaleForm`
(`src/components/admin/counter-sale-form.tsx`), placed after Discount:

- A running Subtotal / Discount (if any) / Grand Total breakdown, reusing
  the exact same live totals the sticky summary bar already computes —
  one source of truth for the numbers shown in two places.
- The existing Cash / UPI / Card payment-METHOD buttons, unchanged in
  behavior, moved into this section (a different concept — "how" the
  money was collected — kept visually adjacent to "how much," not merged
  into one control).
- A new two-button Full / Partial toggle
  (`CounterSalePaymentPanel`, `src/components/admin/counter-sale-payment-panel.tsx`,
  mirroring `CounterSaleDiscountPanel`'s exact button/preview style) —
  Partial reveals an Amount Received input and a live Outstanding preview,
  computed via the SAME `computePaymentOutcome` the server independently
  re-runs at submit time (never trusted as the final amount).
- **Guest disables Partial** — the Partial button is `disabled` with an
  explanatory `title` whenever `customerMode === "GUEST"`, and switching
  TO Guest mid-edit (while Partial was already selected) reverts the
  payment mode back to Full in the same event handler that changes
  customer mode — not a `useEffect`, since a derived state reset belongs
  in the event that causes it (an `eslint` `react-hooks/set-state-in-effect`
  rule caught the first, effect-based attempt at this).
- The success screen shows a Received/Outstanding breakdown only when the
  completed sale was Partial — a Full-Payment sale's success screen is
  unchanged from Part 2.

## Admin Order Detail (section 11)

`src/app/admin/(protected)/orders/[orderNumber]/page.tsx`'s Items section
now shows Received and Outstanding rows, gated to `order.source ===
"COUNTER"` — Online orders never show this pair at all, for the same
"would duplicate/conflict with the UNPAID-until-COD badge" reasoning as
above. Unlike the Counter Sale form's success screen (which only shows
this pair for Partial sales), the Order Detail page shows it
UNCONDITIONALLY for every Counter order, including fully-paid ones — this
is a permanent historical record, not a live confirmation screen, and the
brief's own section 11 asks for Received/Outstanding to be always
displayed there, "clearly distinguished." Outstanding is styled in an
amber/warning color only when it's actually greater than zero.

## Section 10 scope — "persist, don't build the dashboard"

Interpreted literally: zero new CUSTOMER-facing UI in this phase. No
Outstanding/Received figure appears anywhere in the customer portal or
the public order-confirmation page. Only the admin Order Detail page (and
only for Counter-sourced orders) displays this pair. The KhataBook
dashboard, an Outstanding Ledger, a "Receive Payment" action, Customer
Notes, CRM, Family Linking, and Analytics remain entirely out of scope,
per section 19, for Parts 4–6.

## Security (section 12)

All payment computation happens server-side, inside the same
`db.$transaction` as discount validation and the stock decrement,
downstream of the transaction's own freshly-resolved subtotal — never
trusting a client-supplied Grand Total, Received amount, or Outstanding
figure. A failing payment (`PAYMENT_INVALID`) throws a
`CounterSaleDomainError`, rolling back the ENTIRE transaction, including
any stock decrement already performed in that same transaction — mirrors
Part 2's `DISCOUNT_INVALID` rollback pattern exactly. The client-side
preview (`CounterSalePaymentPanel`, `getCounterSaleSubmitGate`) exists
purely for UX — an invalid amount is caught before the cashier even
submits — but the server independently re-validates from scratch
regardless of what the client concluded.

## Testing (section 13)

- **`src/lib/__tests__/payment.test.ts`** (14 tests) — the pure
  `computePaymentOutcome`/`derivePaymentStatus` module: Full mode,
  Partial mode (outstanding computation, exact-total → PAID, zero-received
  validity, negative/non-integer/exceeds-total rejection, zero-against-
  zero-total), and `derivePaymentStatus`'s boundary/edge cases.
- **`src/server/commerce/__tests__/counter-sale.test.ts`** (new
  "payments" describe block, 11 tests) — Full Payment (default and
  explicit), Partial Payment with Outstanding computed correctly,
  zero-received full credit (`UNPAID`), exact-Grand-Total Partial (`PAID`),
  overpayment rejection with full transaction/stock rollback, negative-
  amount rejection, Guest+Partial rejection with zero DB writes, a
  discount-and-Partial combination, and the Subtotal-vs-Grand-Total
  validation trap.
- **`src/server/commerce/__tests__/payment-returns-exchange.test.ts`**
  (new file, 3 tests) — a full return, a partial (one-of-two-lines) return,
  and an exchange, each against a real partially-paid Counter Sale
  (real Postgres, the real `createCounterSale` → `createReturnRequest` →
  `updateReturnRequestStatus` → `receiveReturnRequest` chain), each
  confirming `amountReceivedInPaise`/`outstandingInPaise`/`paymentStatus`
  are byte-identical before and after.
- **`src/lib/validation/__tests__/admin-counter-sale.test.ts`** (7 new
  tests) — `counterSalePaymentSchema`: omitted, explicit Full, valid
  Partial, zero-amount Partial, negative-amount rejection, missing-amount
  rejection, unknown-mode rejection.
- **`src/lib/__tests__/counter-sale-form.test.ts`** (6 new tests) —
  `getCounterSaleSubmitGate`'s payment validation: Guest+Partial blocked,
  Customer+Partial allowed, overpayment blocked, negative amount blocked,
  zero-amount allowed, and the Subtotal-vs-discounted-Grand-Total
  validation trap at the client-gate level too.

## Regression (Part 3, section 17)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean (one `react-hooks/set-state-in-effect` violation
  found and fixed during implementation — see "Counter Sale UX" above).
- `npx vitest run` — 739/739 passing.
- `npm run build` (Turbopack) — succeeds; all 27 routes compile.
- **New migration**: `20260808200000_phase3_6_5_part3_partial_payments` —
  `ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID'`, two new
  `Order` columns (`amountReceivedInPaise`, `outstandingInPaise`), added
  nullable, backfilled (`amountReceivedInPaise = totalInPaise`,
  `outstandingInPaise = 0` for every pre-existing row — every order before
  this phase was always fully reconciled against its own total), then
  constrained `NOT NULL` — the same safe pattern Part 2 used for
  `effectiveLineTotalInPaise`. Re-verified per "protect every previous
  phase": created `shop_fresh_verify`, applied all 16 migrations,
  confirmed **zero drift** (`prisma migrate diff --exit-code`), ran
  `prisma/seed.ts` and `prisma/create-admin.ts` successfully, then dropped
  the database.
- **Dev-server restart discipline, again**: consistent with the lesson
  learned during Part 2's own regression pass, the long-running dev
  server (already running from earlier in this session, started before
  this phase's migration was applied) was killed and restarted after
  `prisma generate`, so the manual-verification script below ran against
  a freshly-loaded Prisma Client rather than a stale one that predates the
  new columns.
- Manual verification (no browser-automation tool in this environment,
  same disclosed limitation as every prior phase): after the restart
  above, a real, unmocked script against the live dev database exercised
  (1) a default Full Payment sale — confirmed `received == total`,
  `outstanding == 0`, `PAID`; (2) a Partial Payment combined with a Flat
  discount against a real customer — confirmed Subtotal/Discount/Grand
  Total/Received/Outstanding/`PARTIALLY_PAID` all matched exactly; (3) a
  Guest+Partial submission — confirmed
  `PARTIAL_PAYMENT_REQUIRES_CUSTOMER` with no order created; (4) a
  deliberate overpayment — confirmed `PAYMENT_INVALID` and that stock was
  left completely untouched (rolled back). All script-created data
  (orders, products, customers, admin user, category) was deleted
  afterward, confirmed via direct row-count comparison against the shared
  dev database (`orders`: 8, `customers`: 5, `products`: 13 — unchanged
  before and after).

## Known limitations (Part 3)

- **No "Receive Payment" flow exists yet** — Outstanding, once recorded,
  cannot currently be reduced by any code in this codebase. This is
  intentional (explicitly Part 4+ scope, section 19) — Part 3's job is
  only to establish that the figure is computed and stored correctly, not
  to let it move again afterward.
- **No KhataBook dashboard, ledger, or per-customer aggregate Outstanding
  view** — each order's Outstanding is visible individually (Admin Order
  Detail), but nothing yet sums a customer's TOTAL outstanding balance
  across multiple orders. That aggregation is explicitly deferred to a
  later phase (section 19).
- **Whole-paise-only amounts, same convention as every prior phase** — no
  new limitation introduced here, just re-confirmed: `amountReceivedInPaise`
  is validated as an integer, consistent with this codebase's
  no-floating-point-money rule throughout.
- **A Partial Payment's Outstanding is fixed at sale time and never
  revisited by a subsequent discount change** — there is no "edit an
  existing order's discount" feature in this codebase at all (Part 2 or
  Part 3), so this isn't a new gap Part 3 introduces, only a boundary
  worth naming: Outstanding reflects the Grand Total AT THE MOMENT OF
  SALE, permanently.

## Architecture decisions (Part 3)

- **`src/lib/payment.ts` is a direct structural copy of `src/lib/discount.ts`'s
  conventions** — DB-free, pure, independently testable, the exact same
  function both the server's authoritative computation and any future
  client preview call — deliberately choosing consistency with an
  established, already-reviewed pattern over inventing a new one.
- **`PARTIALLY_PAID` reuses the existing `PaymentStatus` enum rather than
  introducing a parallel "credit status" concept** — every existing
  consumer (badges, admin filters, the transition-action UI) already
  needed to handle `PaymentStatus` uniformly; a second, parallel status
  would have meant two enums a reader has to cross-reference instead of
  one.
- **Outstanding is a derived-then-persisted fact, computed exactly once
  at Counter Sale creation, never recomputed on read** — chosen over
  computing it on-the-fly from `totalInPaise` and some hypothetical
  "payments" ledger table, because Part 3 explicitly has no ledger yet
  (that's Part 4+); a single persisted snapshot is the simplest correct
  representation of "what was true when this sale was made," and matches
  the brief's own "Order Snapshot" section (5) almost verbatim.
- **Guest+Partial rejection happens in TWO places (client gate, server
  domain function) but is validated ONLY ONCE for real** — the client
  check is a pure UX convenience; the server's own check, ahead of the
  transaction, is the actual authority. Neither reimplements the other's
  logic differently — both are the same one-line condition, just at two
  different trust boundaries.
- **The admin Order Detail page's display, not the Counter Sale form's
  success screen, is the "permanent record" — so it shows Received/
  Outstanding unconditionally, while the success screen shows it only for
  Partial sales** — a deliberate asymmetry: the success screen is a
  one-time confirmation optimized for "did this go through correctly,"
  where an always-₹0 Outstanding line for the overwhelmingly common
  Full-Payment case would be pure noise; the Order Detail page is a
  historical record consulted later, where the brief's own "clearly
  distinguished" instruction (section 11) argues for consistency instead.

## Final Part 3 verdict

> Counter Sales support both Full and Partial Payments, Outstanding
> balances are calculated from the final negotiated Grand Total, all
> accounting remains server-authoritative, Returns and Exchanges remain
> mathematically correct, and the commerce engine gains a robust
> foundation for future KhataBook functionality.

Demonstrated true, with evidence cited above: Full and Partial Payment
modes are both implemented, validated server-side inside the same
transaction as discount resolution and stock decrement, with Partial
correctly restricted to Customer-attached sales (sections 2, 4, 12);
Outstanding is proven, by a dedicated adversarial test, to be computed
from the discounted Grand Total and never the Subtotal (section 3); every
payment computation is server-authoritative, with a failing payment
rolling back the entire transaction including any stock decrement already
performed (section 12); Returns and Exchanges were proven, end-to-end
against real database rows, to leave `amountReceivedInPaise`/
`outstandingInPaise`/`paymentStatus` completely unchanged regardless of
what's later returned or exchanged (sections 7, 8); and `PARTIALLY_PAID`
was added to the existing payment lifecycle in a way that's reachable
only through the one code path meant to produce it, never as an ad-hoc
admin override (section 6). Full test suite passes (739/739, including a
from-scratch database run); fresh-database verification passes (16
migrations, zero drift); production build passes; manual verification
against the live dev database confirmed all four core scenarios
(Full, Partial+Discount, Guest+Partial rejection, overpayment rejection)
end-to-end; documentation is complete.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), and Phase 3.6.5 Part 1/Part 2/Part 3 remained uncommitted
together in the working tree, per instruction, at the time Part 3 was
reviewed and approved.

## Part 4 — KhataBook: Customer Ledger & Purchase History

Date: 2026-08-08

Adds the Admin KhataBook — a searchable, per-customer operational view
built entirely on data Phase 3.1 (Customer identity), Phase 3.5 (Returns/
Exchanges), and Phase 3.6.5 Part 3 (Partial Payments/Outstanding) already
established. Search a customer by Name, Mobile, or Customer ID; see their
Outstanding balance, lifetime purchase total, and full chronological
purchase history; click through to the existing Admin Order Detail page
for any individual order. No new schema, no new mutation, no new business
logic — this phase is a read-only aggregation and presentation layer over
the commerce engine's existing, already-correct data.

## Audit of the current implementation for Part 4 (before writing any code)

- **`src/server/queries/admin/customers.ts`** (`searchCustomers`, Phase
  3.6.5 Part 1) — confirmed this ALREADY implements exactly the unified
  Customer ID / Name / Mobile Number search section 3 asks for, via one
  `OR` query. Section 3's "reuse the existing customer search
  infrastructure ... do not duplicate search logic" is satisfied by
  calling this function directly, unmodified — KhataBook's own query
  layer adds nothing to the search itself.
- **`src/components/admin/order-filters.tsx`**, **`return-filters.tsx`**,
  and their corresponding list pages (`/admin/orders`,
  `/admin/returns`) — confirmed the established pattern for a searchable
  admin list: a `searchParams`-driven Server Component page plus a small
  client component that pushes a new URL on Enter/blur. KhataBook's search
  page and `KhataBookSearch` component are a direct, deliberate copy of
  this convention (one field instead of several), not a new pattern.
- **`prisma/schema.prisma`** (`Customer`, `Order`, `ReturnRequest`) —
  confirmed every fact this phase needs to display already exists:
  `Order.amountReceivedInPaise`/`outstandingInPaise`/`totalInPaise`
  (Part 3), `Customer.lastOrderAt` (Part 1), and `ReturnRequest.type`
  (Phase 3.5) grouped by customer. Zero new columns, zero new tables,
  zero migration needed for this phase.
- **`src/server/queries/admin/dashboard.ts`** (`getDashboardStats`) —
  the one existing precedent in this codebase for "sum totalInPaise
  across a set of orders." Confirmed it does NOT exclude `CANCELLED`
  orders from its own total — this became the deciding precedent for how
  KhataBook computes Lifetime Purchase (see "Customer summary
  calculations" below), rather than inventing a new, different
  exclusion rule with no established basis in this codebase.
- **`src/app/admin/(protected)/layout.tsx`** — confirmed EVERY route
  under `(protected)` is already gated by a single `getAdminSession()`
  check with a redirect to `/admin/login`, and that `/admin/orders`,
  `/admin/returns`, etc. all rely on exactly this one enforcement point
  with no page-level re-check of their own (since they perform no
  mutation). KhataBook's two new routes live under the same
  `(protected)` segment and need no additional authorization code —
  see "Security" below.
- **`src/server/queries/customer-portal/`**, **`src/server/actions/
  customer-portal/`**, **`src/components/customer-portal/`**, **`src/lib/
  customer-portal/`** — confirmed (via directory structure and a
  project-wide grep for "khatabook"/"KhataBook") these are entirely
  separate trees from `src/server/queries/admin/`, with zero possible
  import path between them. Section 12's "Customer Portal must never
  expose KhataBook information" is satisfied structurally: the new
  `khatabook.ts` query module isn't reachable from customer-portal code
  at all, not merely unreferenced by convention.
- **`docs/PHASE_3_6_5_REPORT.md`** (Parts 1–3) — read in full per
  instruction, establishing the "immutable historical accounting"
  invariant (Part 3) this phase's Outstanding/Lifetime figures depend on,
  and the existing `OrderStatusBadge`/`PaymentStatusBadge`/
  `OrderSourceBadge` components (reused unmodified in Purchase History).

## Architecture (Part 4)

Two new read-only routes under the existing protected admin tree, and one
new query module — no server actions, no schema migration:

- **`src/server/queries/admin/khatabook.ts`** (new) — `searchKhataBookCustomers`,
  `getRecentKhataBookCustomers`, and `getKhataBookCustomerProfile`. Every
  function here is a thin aggregation layer on top of EXISTING query
  functions and Prisma aggregate calls — none of them re-implement
  Customer search, Order totals, or Return/Exchange classification.
- **`src/app/admin/(protected)/khatabook/page.tsx`** (new) — the search +
  results list, a Server Component reading `searchParams.q` exactly like
  `/admin/orders` and `/admin/returns` already do.
- **`src/app/admin/(protected)/khatabook/[customerId]/page.tsx`** (new) —
  the customer profile + purchase history, keyed by the same public-facing
  `Customer.customerId` (e.g. `KLQ-7A41K2`) every other admin surface
  already treats as the shareable identifier (mirroring `Order.orderNumber`/
  `ReturnRequest.returnNumber`'s own convention) — never the internal
  `Customer.id` cuid.
- **`src/components/admin/khatabook-search.tsx`** (new) — the one client
  component, a single-field copy of `OrderFilters`'/`ReturnFilters`' own
  URL-param pattern.
- **`src/lib/validation/admin-khatabook.ts`** (new) — `khataBookSearchSchema`,
  a one-field mirror of `adminOrderFiltersSchema`'s own `query` field.
- **`src/components/admin/admin-shell.tsx`** — one new top-level nav
  entry, "KhataBook," a sibling of Orders/Returns/Schools, not nested
  under any of them (section 2).

No new Server Action exists anywhere in this phase — every existing
mutation-bearing admin action independently re-checks `getAdminSession()`
(documented in earlier phases' own Security sections) specifically
because a client already holding an action reference could call it
directly; a page that performs no mutation at all has no such surface to
protect beyond the layout's own redirect, so none was added here.

## Search (section 3) and results (section 4)

`searchKhataBookCustomers(query)` calls `searchCustomers(query)`
UNCHANGED, then attaches two figures via one additional aggregate query:

```ts
db.order.groupBy({
  by: ["customerId"],
  where: { customerId: { in: matchedCustomerIds } },
  _sum: { totalInPaise: true, outstandingInPaise: true },
})
```

One `groupBy` call regardless of how many customers matched (bounded by
`searchCustomers`' own existing 50-row cap) — never a query per customer
(section 9). A customer matched by name/phone/ID who has never actually
placed an order correctly shows ₹0 Outstanding / ₹0 Lifetime Purchase, not
an error or a missing row. "Last Purchase Date" reuses
`Customer.lastOrderAt` directly — already maintained by every order-
creation path, so it needed no aggregation at all.

When no search has been typed yet, the page shows `getRecentKhataBookCustomers()`
— the SAME existing `getRecentCustomers()` (Phase 3.6.5 Part 1) reused
unmodified, through the identical aggregate-attachment step — rather than
a bare empty state or a new "browse all customers" query.

## Customer profile (section 5) and performance (section 9)

`getKhataBookCustomerProfile(customerId)` runs exactly five queries,
total, regardless of how many orders/returns the customer has:

1. `db.customer.findUnique({ where: { customerId } })` — resolves the
   route param to a real Customer, or returns `null` immediately (no
   further queries run) so the page can 404 cheaply.
2. `db.order.aggregate({ _sum: { totalInPaise, outstandingInPaise }, _count: { _all: true } })`
   scoped to that customer — Lifetime Purchase Total, Total Outstanding,
   and Total Orders in ONE call.
3. `db.order.count({ where: { outstandingInPaise: { gt: 0 } } })` — Number
   of Unpaid Orders (section 7).
4. `db.returnRequest.groupBy({ by: ["type"] })` scoped to that customer —
   Return Count and Exchange Count together in ONE call.
5. `db.order.findMany(...)` — the Purchase History rows themselves (the
   only query whose result size scales with that customer's own order
   count, which is the actual data being displayed, not incidental
   overhead).

Queries 2–5 run inside one `Promise.all`, since none of them depends on
another's result — only on the customer id resolved in step 1. This
satisfies section 9's "avoid N+1 queries; prefer aggregation over
repeated queries" directly: there is no loop anywhere issuing one query
per order, per return, or per customer.

**Customer summary calculations**:

- **Lifetime Purchase Total** = `sum(Order.totalInPaise)` across every
  order for this customer, with no status exclusion — mirrors
  `getDashboardStats`'s own existing precedent (see audit above) rather
  than inventing a new "exclude CANCELLED" rule with no prior basis in
  this codebase. Documented here as a deliberate, reviewable choice: a
  future phase could refine this if a shop owner specifically wants
  cancelled orders excluded, but that would be a NEW business rule, not a
  bug fix.
- **Total Outstanding** = `sum(Order.outstandingInPaise)` across every
  order — this is Phase 3.6.5 Part 3's own immutable, already-correct
  per-order figure, simply summed. No new "how much does this customer
  owe" logic was invented; this phase only aggregates what Part 3 already
  computes and persists.
- **Number of Unpaid Orders** (section 7) = count of orders where
  `outstandingInPaise > 0`.
- **Return Count / Exchange Count** = `ReturnRequest` rows grouped by
  `type` for this customer — every request ever made, regardless of its
  current lifecycle status (REQUESTED through COMPLETED/REJECTED/
  CANCELLED all count), since the brief asks "how many times has this
  customer returned/exchanged something," not "how many are currently
  pending."
- **Average Order Value** (section 8's own genuinely-useful, zero-extra-
  query addition) = `lifetimePurchaseInPaise / totalOrders`, computed in
  plain arithmetic from figures already fetched above — no new lookup.
- **Customer Since** (section 8's second addition) = `Customer.createdAt`,
  a field that already existed and was already being fetched — displayed
  for context, not computed.

Neither of these two additions is a "speculative CRM feature" (section
8's own guardrail) — both are one-line derivations of data this page was
already loading, included because they're genuinely useful to a shop
owner glancing at a customer's history, not new capabilities.

## Purchase history (section 6)

Every order for the customer, newest first (matching `getAdminOrders`'
own ordering convention), each row showing Order Number, Date, Source,
Grand Total, Amount Received, Outstanding, and Status — reusing
`OrderSourceBadge`/`OrderStatusBadge`/`PaymentStatusBadge`
(`src/components/admin/order-status-badge.tsx`) completely unmodified.
The Order Number is the one interactive element per row (a `Link` to the
EXISTING `/admin/orders/{orderNumber}` page) — section 6's explicit "do
not create another order screen" is satisfied by construction: there is
no second order-detail view anywhere in this phase, only a link to the
one that already exists.

## Outstanding summary (section 7)

A dedicated, visually prominent banner at the very top of the customer
profile page — Total Outstanding (large, amber-highlighted whenever
greater than zero) and the Number of Unpaid Orders beside it — rather
than folding these two figures into the denser Customer/Summary detail
grid below. This is a presentation choice, not a second calculation:
both figures come from the exact same `summary` object the rest of the
page reads; Outstanding is not computed twice. No payment-collection
action exists anywhere on this page or in this phase — that is
explicitly Part 5 (section 16).

## Security (Part 4, section 12)

- Both new routes live under `src/app/admin/(protected)/khatabook/`,
  inheriting the SAME `getAdminSession()`-gated layout every other admin
  page already relies on — confirmed via a real, unauthenticated
  `fetch()` in manual verification, which received a `307` redirect to
  `/admin/login` with zero customer data in the response.
- No new Server Action exists in this phase, so there is no new
  direct-call attack surface that would need its own independent
  `getAdminSession()` re-check (the reason every mutating action in this
  codebase performs one) — a read-only Server Component page has no
  callable reference a client could invoke outside of requesting the page
  itself, which the layout already gates.
- Confirmed, via a project-wide grep for `khatabook`/`KhataBook` across
  `src/server/queries/customer-portal/`, `src/server/actions/customer-portal/`,
  `src/components/customer-portal/`, `src/lib/customer-portal/`, and every
  `src/app/(site)/` route: **zero matches**. The Customer Portal has no
  import path to this phase's code at all — section 12's requirement is
  satisfied structurally, not merely by omission.

## Accessibility (section 11)

- **Search**: the input has an associated (visually-hidden) `<label>`,
  not just a placeholder, and `type="search"`.
- **Tables**: both new tables (`Search Results`, `Purchase History`) —
  the first real `<table>` elements in this admin (every prior list page
  uses a card-style `<ul>`, appropriate for their 2–3-field rows; these
  two views are genuinely multi-column and tabular, so a semantic
  `<table>` with a `scope="col"` header row and an `sr-only` `<caption>`
  fits better than stretching the card convention to seven columns) —
  reviewed for correct `<thead>`/`<tbody>` structure and header
  association.
- **Navigation**: the new "KhataBook" entry reuses `AdminShell`'s
  existing `NavLinks` component unmodified — `aria-current="page"`
  behavior, active-state styling, and mobile-sheet behavior all worked
  identically to every pre-existing nav item with zero special-casing.
- **Keyboard / Focus**: every interactive element (search input, the
  Customer/Order Number links) is a native, naturally-focusable `<input>`/
  `<a>` with an explicit `focus-visible` ring — no custom click-handlers
  standing in for a real link or button, and no focus trap introduced.
  No genuine issue was found needing a fix, consistent with section 11's
  "only fix genuine issues" — this phase introduced no accessibility
  regression to correct.

## Testing (Part 4, section 13)

- **`src/server/queries/admin/__tests__/khatabook.test.ts`** (new file,
  real Postgres, the real `createCounterSale`/`createReturnRequest`/
  `updateReturnRequestStatus`/`receiveReturnRequest` chain, nothing
  mocked) — 9 tests:
  - `searchKhataBookCustomers`: search by Customer ID (with a
    zero-order customer correctly showing ₹0/₹0), search by Name, search
    by Mobile Number (with the Outstanding/Lifetime aggregate proven
    correct across two real orders), and an empty result for a query
    matching nobody.
  - `getRecentKhataBookCustomers`: reuses `getRecentCustomers`' ordering
    and attaches aggregates correctly.
  - `getKhataBookCustomerProfile`: `null` for an unknown `customerId`;
    all-zero summary and empty purchase history for a real customer with
    no orders; a full mixed-payment scenario (one Full, one Partial, one
    zero-received full-credit sale) proving Outstanding (₹500), Number of
    Unpaid Orders (2), Lifetime Purchase (₹1,700), Average Order Value,
    and chronological Purchase History ordering all compute correctly
    together; and Return Count / Exchange Count proven against one real
    completed Return and one real completed Exchange.
- **`src/lib/validation/__tests__/admin-khatabook.test.ts`** (new file, 3
  tests) — `khataBookSearchSchema`: omitted query accepted, a query
  string trimmed, and a too-long query rejected.
- **Authorization**: proven via manual verification (below), not a new
  automated test — this phase adds no Server Action to independently
  re-check `getAdminSession()` against (see "Security" above), and the
  existing layout-level gate every other admin page already relies on
  was not modified.
- **Security/leakage**: proven via the grep described in "Security"
  above — zero references to the new module from any customer-portal
  code path.

## Regression (Part 4)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 751/751 passing.
- `npm run build` (Turbopack) — succeeds; all 28 routes compile, including
  the two new `/admin/khatabook` and `/admin/khatabook/[customerId]`
  routes.
- **No new migration** — this phase adds no schema change. Re-verified
  per "protect every previous phase" anyway: created
  `shop_fresh_verify_p4`, applied all 16 existing migrations, confirmed
  **zero drift** (`prisma migrate diff --exit-code`), ran `prisma/seed.ts`
  and `prisma/create-admin.ts` successfully, then dropped the database.
- Manual verification (no browser-automation tool in this environment,
  same disclosed limitation as every prior phase): a real, unmocked
  script against the live dev database (dev server already running a
  fresh Prisma Client from Part 3's own regression pass — no migration
  this phase, so no restart was needed) minted a genuine admin session
  row (the same mechanism `createAdminSession` uses) and exercised, via
  real `fetch()` calls: (1) an unauthenticated request to
  `/admin/khatabook` — confirmed `307` redirect to `/admin/login`; (2)
  authenticated search by Customer ID, Mobile Number, and Name — each
  confirmed the correct customer and Outstanding figure (₹300) rendered;
  (3) the customer profile page — confirmed both real orders, the
  "Purchase History" heading, and the "Total Outstanding" banner all
  rendered; (4) an unknown `customerId` — confirmed `404`. All
  script-created data (orders, products, customer, admin user, session,
  category) was deleted afterward, confirmed via direct row-count
  comparison against the shared dev database (`orders`: 8, `customers`:
  5, `products`: 13 — unchanged before and after).

## Known limitations (Part 4)

- **No payment collection** — Outstanding is displayed, never reduced,
  anywhere in this phase. "Receive Payment" is explicitly Part 5 (section
  16).
- **Lifetime Purchase/Total Orders include CANCELLED orders** — a
  deliberate choice mirroring `getDashboardStats`'s existing precedent
  (see "Customer summary calculations" above), not an oversight; worth
  revisiting explicitly if a shop owner wants a cancelled-exclusive
  figure, since no such rule exists anywhere else in this codebase today
  to be consistent with.
- **No pagination on Purchase History** — capped at 500 orders per
  customer (mirroring the "small shop doesn't need real pagination yet"
  convention already used by `getAdminOrders`/`getAdminReturnRequests`),
  which in practice is far beyond what any real customer will ever reach.
- **Search results and the "recent customers" default view are capped at
  `searchCustomers`'/`getRecentCustomers`' own existing limits** (50 and 5
  rows respectively) — unchanged from their Phase 3.6.5 Part 1 behavior,
  not a new constraint this phase introduces.
- **No customer-level "family" or "linked accounts" concept** — each
  Customer row is its own independent Khata; explicitly out of scope
  (section 16, "Customer Family").

## Architecture decisions (Part 4)

- **A read-only feature gets read-only architecture** — no Server Action,
  no mutation, no new authorization check beyond the shared protected
  layout. Adding a server action "for consistency" with mutating admin
  features would have been speculative complexity with no real use yet;
  Part 5's "Receive Payment" is the first capability that will actually
  need one.
- **`customerId` (the public identifier), never `Customer.id` (the
  internal cuid), is the route param** — the same "identifier, not a
  database key" convention `Order.orderNumber`/`ReturnRequest.returnNumber`
  already established, chosen for consistency even though, unlike those
  two, nothing here is customer-facing (this route is admin-only either
  way) — a reviewer scanning this codebase's URL conventions shouldn't
  find an unexplained exception.
- **Real `<table>` elements, a first for this admin** — every prior admin
  list page uses a 2–3-field card `<ul>`; KhataBook's two views are
  genuinely 5–7-column tabular data, where forcing the card convention
  would mean either dropping columns or an unreadably dense card. Section
  11's explicit call-out of "Tables" as something to accessibility-review
  was read as confirmation that a real table was the intended shape here,
  not a deviation to second-guess.
- **One query module, `khatabook.ts`, both for the list page's
  aggregation and the profile page's — never duplicated between the two
  routes** — `attachKhataBookAggregates` is the single, shared
  Outstanding/Lifetime-attachment step both `searchKhataBookCustomers`
  and `getRecentKhataBookCustomers` call, so the two entry points to the
  same list view can never compute this differently.
- **Outstanding is never recomputed independently on this page — always
  the same `sum(Order.outstandingInPaise)` Part 3 already made
  authoritative** — KhataBook adds a Prisma `groupBy`/`aggregate`
  wrapper around that existing fact, never a parallel formula that could
  drift from it.

## Final Part 4 verdict

> The Admin has a production-ready KhataBook that provides fast customer
> search, complete purchase history, outstanding summaries, and
> customer-level operational visibility while reusing the existing
> commerce engine without duplicating business logic.

Demonstrated true, with evidence cited above: search covers Customer ID,
Name, and Mobile Number by calling the existing `searchCustomers`
unmodified (section 3), proven via three separate passing tests plus a
live HTTP verification of each; the customer profile displays every
field section 5 asks for, computed via five total queries regardless of
order count, proven free of N+1 patterns by construction (sections 5, 9);
Purchase History shows every order chronologically and links to the
EXISTING Admin Order Detail page rather than building a second one
(section 6); the Outstanding Summary banner surfaces Total Outstanding
and Number of Unpaid Orders prominently, with no payment-collection
capability anywhere in this phase (section 7); two additional, genuinely
useful figures (Average Order Value, Customer Since) were added using
only data already being fetched, explicitly avoiding speculative CRM
scope (section 8); and the Customer Portal was confirmed, structurally,
to have zero code path to any of this (section 12). Full test suite
passes (751/751, including a from-scratch database run); fresh-database
verification passes (16 migrations, zero drift, no new migration this
phase); production build passes (28 routes); manual verification against
the live dev database confirmed authentication gating, all three search
modes, the profile page, and the 404 case end-to-end; documentation is
complete.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), and Phase 3.6.5 Part 1/Part 2/Part 3/Part 4 remained
uncommitted together in the working tree, per instruction, at the time
Part 4 was reviewed and approved.

## Part 5 — KhataBook Payment Collection & Ledger

Date: 2026-08-08

Completes the KhataBook: the Admin can now collect an outstanding
payment against any Counter Sale, and every payment becomes a permanent,
immutable `PaymentReceipt` row linked to its originating order. Receiving
the final outstanding amount naturally derives the order's `paymentStatus`
toward `PAID`, reusing Part 3's own `derivePaymentStatus` unchanged.
Outstanding is never edited directly — the ONLY way it can move is
through this one narrow, server-authoritative, concurrency-safe path.

## Audit of the current implementation for Part 5 (before writing any code)

- **`prisma/schema.prisma`** (`Order.amountReceivedInPaise`/
  `outstandingInPaise`, Phase 3.6.5 Part 3) — re-read that field's own doc
  comment, which explicitly named this exact phase: "A future 'Receive
  Payment' phase ... would be the first code to ever change them again."
  Confirmed via grep that, as of Part 4, literally the only writer of
  either column was `createCounterSale` — no other mutation, admin action,
  or Return/Exchange code path touched them. This phase's job is to
  become that one narrow exception, not to loosen the invariant generally.
- **`src/lib/order-lifecycle.ts`** (`PAYMENT_TRANSITIONS`) — confirmed
  `PARTIALLY_PAID: []` (no admin-mutation path into or out of it) still
  holds, and that this table's OWN doc comment already anticipated a
  future "Receive Payment" bypassing it directly, exactly like
  `createCounterSale` already does for the DELIVERED/derived-status
  case. Updated both this comment and the matching one in
  `prisma/schema.prisma`'s `PaymentStatus` enum to point at this phase's
  `receivePayment` now that it exists, rather than leaving them
  describing a still-hypothetical future phase.
- **`src/server/commerce/counter-sale.ts`**, **`src/lib/payment.ts`**
  (Phase 3.6.5 Part 3) — confirmed `derivePaymentStatus(amountReceivedInPaise,
  grandTotalInPaise)` is a PURE function of two numbers, already reusable
  as-is for a payment received AFTER creation, not just at creation time —
  section 8's "reuse the existing lifecycle" is satisfied by calling this
  exact function again, never a second, parallel status-derivation rule.
- **`src/server/commerce/update-order-status.ts`** (`updateOrderStatus`,
  `updatePaymentStatus`) — read in full as the established precedent for
  BOTH safety properties this phase needs: idempotent + concurrency-safe
  transitions via a guarded `updateMany({ where: { id, <field>: <value
  just read> } })`, and a `ConcurrencyConflictError`/`CONFLICT` error
  shape. `receivePayment` (below) mirrors this pattern exactly rather
  than inventing a new one.
- **`src/server/commerce/counter-sale.ts`**'s own idempotency handling
  (pre-check via a raw lookup, guarded insert, `isUniqueConstraintErrorOn`
  recovery on a race) — confirmed as the second precedent this phase
  needed, for the same reason `createCounterSale` needed it: a network
  retry on a money-handling action must never double-apply.
- **`src/server/commerce/returns.ts`**, **`admin-returns.ts`**,
  **`return-fulfillment.ts`** — re-grepped (as Part 3 did) for
  `amountReceivedInPaise`/`outstandingInPaise`/`PaymentReceipt`: zero
  matches, confirming these three files still never read or write
  anything this phase's ledger touches — the independence the brief asks
  for (sections 9, 10) already held and needed no code change, only
  confirmation plus a NEW pair of tests proving the reverse direction
  (does *receiving a payment* ever affect a Return/Exchange's own price
  calculation? — see "Returns"/"Exchanges" below).
- **`src/components/ui/sheet.tsx`** — confirmed this is already built on
  `@base-ui/react/dialog`'s `Dialog` primitive (just styled as an
  edge-docked sheet); reused the SAME primitive, styled as a centered
  modal instead, for the new `src/components/ui/dialog.tsx` — see
  "Ledger architecture" below for why a new component was still needed.
- **`src/components/ui/select.tsx`** — confirmed via grep that this
  scaffolded component has ZERO real call sites anywhere in the admin
  app; every existing admin page (School select, Discount reason select)
  uses a plain native `<select>` styled directly with Tailwind instead.
  The Receive Payment dialog's Order picker follows that SAME established
  convention, not the unused wrapper.
- **`src/server/queries/admin/khatabook.ts`** (Phase 3.6.5 Part 4) —
  confirmed `getKhataBookCustomerProfile`'s existing five-query
  `Promise.all` shape was the correct place to add ONE more parallel
  query for the Ledger, keeping the "no N+1" guarantee (section 13) intact
  rather than fetching receipts in a second round-trip after the page
  already rendered.

## Ledger architecture (sections 4, 5, 11)

- **New model: `PaymentReceipt`** (`prisma/schema.prisma`) — one row per
  collected payment: `orderId` (FK, `onDelete: Restrict` — mirrors
  `ReturnRequest.orderId`'s own convention: a row this permanent must
  never be cascade-deleted just because its order disappeared, which
  never actually happens in this codebase anyway), `customerId`
  (denormalized from `order.customerId` at creation time, so the
  KhataBook customer-ledger query filters directly on this column without
  joining through `Order` for every row), `amountInPaise`, `paymentMethod`
  (reuses the existing `PaymentMethod` enum, never a new one — section
  7), an optional `note`, `createdByAdminUserId` (nullable + `SetNull`,
  same pattern as every other admin-audit FK in this schema), and a
  nullable-unique `idempotencyKey`.
- **`outstandingBeforeInPaise`/`outstandingAfterInPaise` are immutable
  snapshots taken at the moment of payment** — the ORDER's own
  `outstandingInPaise` immediately before and after this receipt,
  written once, never recomputed. This is what makes section 4's own
  worked example ("Counter Sale → Outstanding ₹650 → Payment ₹500 →
  Outstanding ₹150 → Payment ₹150 → Outstanding ₹0") displayable directly
  from stored fact, with no need to replay every prior receipt for an
  order to explain what any single row means. Verified directly:
  `receive-payment.test.ts`'s own "sequential payments" test reproduces
  this exact ₹650/₹500/₹150/₹150/₹0 shape against real Postgres rows.
- **The Ledger is its OWN section on the Customer Profile, kept
  deliberately separate from Purchase History** (section 6's explicit
  "Keep Purchase History separate") — one query (`getKhataBookCustomerProfile`'s
  new fifth parallel query), one table, newest-first, showing Date,
  Order (linked), Amount, Method, Outstanding After, Recorded By, and
  Note. "Current Balance" is not a third, separate display — it's the
  same `summary.outstandingInPaise` figure the Outstanding banner (Part
  4) already shows, now automatically up to date the moment a payment is
  recorded, since both read the exact same live `Order.outstandingInPaise`
  column.
- **A new `src/components/ui/dialog.tsx`** — section 2's "Simple
  dialog," built on the exact SAME `@base-ui/react/dialog` primitive
  `Sheet` already wraps (`src/components/ui/sheet.tsx`), just centered
  (`fixed top-1/2 left-1/2 -translate-x/y-1/2`, rounded corners, a max
  width) instead of edge-docked. Reusing the SAME headless primitive
  the codebase already depends on, rather than adding a new UI library,
  was the deciding factor — this is a new STYLED WRAPPER, not a new
  dependency.
- **`ReceivePaymentDialog`** (`src/components/admin/receive-payment-dialog.tsx`)
  — Order (a native `<select>`, shown only when the customer has more
  than one order with a balance due; auto-selected and shown as plain
  text when there's exactly one — the common case), Amount, a Cash/UPI/Card
  payment-method button row (mirroring Counter Sale's own exact button
  style), an optional Note, and Save. A live preview validates the typed
  amount against the SELECTED order's own Outstanding via the same
  `validateReceivePaymentAmount` the server independently re-runs —
  never trusted as the final word, purely a UX convenience (section 12's
  "Security" parallel to Part 2/3's discount/payment previews).
- **Entry point**: a "Receive Payment" button sits directly beside the
  Outstanding banner on the Customer Profile (section 2's own diagram:
  "Customer Profile → Outstanding → Receive Payment"). The button/dialog
  renders nothing at all when the customer has no order with a balance
  due — never a dead-end dialog with nothing to select.

## Outstanding lifecycle (sections 1, 3)

`receivePayment` (`src/server/commerce/receive-payment.ts`) is now the
ONE AND ONLY code path in this codebase allowed to change
`Order.amountReceivedInPaise`/`outstandingInPaise` after a Counter Sale's
own creation — confirmed by grep across the entire `src/server/`
directory. "Outstanding must never be edited directly" (section 1) is
satisfied structurally: there is no admin mutation, form field, or API
route anywhere that writes these two columns except this one function,
and this one function ALWAYS derives the new values from
`amountInPaise`/the order's own freshly-read current `outstandingInPaise`
— never from a client-supplied "new balance."

Three safety properties, each a direct reuse of an existing precedent
(see "Audit" above), not a new pattern:

1. **Idempotent** — a repeat submission with the same `idempotencyKey`
   returns the SAME `PaymentReceipt` instead of recording the payment
   twice (mirrors `createCounterSale`'s own idempotency handling
   exactly, including the same race-recovery `isUniqueConstraintErrorOn`
   catch for two near-simultaneous submissions).
2. **Concurrency-safe** — the balance write is a guarded
   `updateMany({ where: { id: order.id, outstandingInPaise: order.outstandingInPaise } })`
   inside the same transaction as the read; a losing concurrent call gets
   a `CONFLICT` error ("This order's balance changed since you loaded the
   page. Please refresh.") — the exact same message shape
   `updateOrderStatus`/`updatePaymentStatus` already use for their own
   concurrency conflicts. Proven directly: a test fires two concurrent
   ₹200 payments against a ₹300-outstanding order and confirms exactly
   one succeeds, landing Outstanding at exactly ₹100 — never ₹0 (which a
   naive read-then-write race could otherwise produce) and never a
   silently-lost double payment.
3. **Server-authoritative** — `validateReceivePaymentAmount`
   (`src/lib/receive-payment.ts`, mirroring `discount.ts`/`payment.ts`'s
   own DB-free, pure convention) validates the amount against the
   order's OWN freshly-read `outstandingInPaise`, read and written
   inside the same transaction, never a client-supplied "current
   balance."

**Validation** (section 3): rejects zero, negative, non-integer, and
overpayment amounts. An order with ZERO Outstanding is reported as a
distinct `ALREADY_PAID` error rather than a generic overpayment — "there
is nothing left to collect" is a meaningfully different situation from
"you asked for too much," worth its own type, consistent with this
codebase's general preference for precise error types.

## Payment status (section 8)

`receivePayment` calls `derivePaymentStatus(newAmountReceivedInPaise,
order.totalInPaise)` — the EXACT SAME pure function
`createCounterSale`/`computePaymentOutcome` already use (Phase 3.6.5
Part 3), never a second, parallel status rule. Reaching PAID is not a
separate branch or special case; it falls out naturally from the same
`received >= grandTotal` comparison that already governs every other
payment-status outcome in this codebase. `PARTIALLY_PAID` remains
reachable ONLY via `createCounterSale`'s own computation or
`receivePayment`'s own derivation — the generic admin
`updatePaymentStatus` mutation's transition table is UNCHANGED
(`PARTIALLY_PAID: []`, no other status transitions into it), so an
ad-hoc admin override still cannot produce a status inconsistent with
the actual Received/Outstanding figures. No new `PaymentStatus` enum
value was needed or added — section 8's "do not invent unnecessary
states" is satisfied by there being nothing left to invent.

A Counter Sale order can never be `CANCELLED` (`BASE_TRANSITIONS.DELIVERED
= []` in `src/lib/order-lifecycle.ts` — a Counter Sale is created
directly DELIVERED and DELIVERED is terminal), and only a Counter Sale
can ever have `outstandingInPaise > 0` (Part 3, Online is always fully
reconciled at creation) — so `updatePaymentStatus`'s own "a cancelled
order can't be freshly marked PAID" guard is structurally unreachable
from `receivePayment`'s target orders, and `receivePayment` does not
duplicate that check.

## Order link (section 5)

Every `PaymentReceipt.orderId` is a required, non-nullable foreign key
(`onDelete: Restrict`) — traceability from a payment back to its order
can never be lost, not even by a hypothetical future order-deletion
feature (which doesn't exist in this codebase, but the constraint holds
regardless). `receivePayment` additionally verifies
`order.customer.customerId === input.customerId` (the customer's PUBLIC
identifier, resolved from the order's own `customer` relation, never
trusted as a bare client-supplied internal id) before touching anything
— a defensive guard against a confused-deputy mistake (an admin viewing
one customer's profile submitting a stale order id for another), not a
security boundary (any admin can already act on any order through this
admin-only tool either way). A mismatch returns a distinct
`CUSTOMER_MISMATCH` error rather than silently crediting the wrong
customer's ledger.

## Returns (section 9) — independence confirmed, both directions

Part 3 already established, and this phase reconfirmed by grep, that
Returns never read or write `amountReceivedInPaise`/`outstandingInPaise`.
This phase adds the REVERSE proof: does *receiving a payment* ever affect
a Return's own price calculation? `receivePayment` never reads or writes
`OrderItem` or `ReturnRequest` at all (grep-confirmed, zero matches) — it
only touches `Order` and creates a `PaymentReceipt`. A new test
(`receive-payment-returns-exchange.test.ts`) proves this end-to-end: a
Counter Sale is paid off completely via `receivePayment`, THEN returned;
the return's value is still exactly `OrderItem.effectiveLineTotalInPaise`
(Part 2's own effective-pricing snapshot), completely unaffected by the
payment collected in between, and the return in turn leaves
`amountReceivedInPaise`/`outstandingInPaise`/`paymentStatus` exactly as
`receivePayment` left them. Return calculations do not change because
there is no code path connecting the two concepts in either direction —
a payment collected against Khata credit and the value of goods
physically returned are simply different facts about the same order,
computed from different, non-overlapping fields.

## Exchanges (section 10) — no hidden adjustments

Identical reasoning and identical proof shape to Returns above: an
Exchange's price difference (`getExchangePriceDifference`, Part 2) reads
only `OrderItem.effectiveLineTotalInPaise` and the replacement variant's
own snapshotted price — never Outstanding, never a `PaymentReceipt`. The
new test exchanges an item on an order that was fully paid off via
`receivePayment` moments earlier and confirms the ₹350−₹300=₹50 "Customer
Pays" difference (the same brief-derived example Part 2's own tests use)
is completely unaffected, while the order's `amountReceivedInPaise`/
`outstandingInPaise` remain exactly as `receivePayment` left them —
proving there is no hidden adjustment anywhere in either direction.

## Auditability (section 11)

Every `PaymentReceipt` permanently records Timestamp (`createdAt`),
Amount (`amountInPaise`), Payment Method (`paymentMethod`), Admin User
(`createdByAdminUserId`), Linked Order (`orderId`, `onDelete: Restrict`),
and an optional Note — every field section 11 asks for, with nothing
optional except the Note itself. Nothing is ever overwritten: there is no
`update` call anywhere in this codebase against `PaymentReceipt` (grep-
confirmed) — the model doesn't even have an `updatedAt` column, since
nothing would ever set it.

## Editing (section 12)

No edit or delete path exists for a `PaymentReceipt`, anywhere — no
Server Action, no admin mutation, nothing. A mistaken entry today can
only be corrected by a FUTURE phase, deliberately not built here (section
18's own "Payment deletion"/"Ledger editing" out-of-scope list): the
natural direction, once built, would be a REVERSAL — a new, separate
`PaymentReceipt`-shaped row (or a dedicated reversal record) that
adjusts the balance back and itself appears in the ledger, rather than
mutating or removing the original row — preserving the same "nothing
silently overwritten" guarantee a correction would otherwise violate.
This phase intentionally stops short of building that.

## Performance (section 13)

`getKhataBookCustomerProfile` now runs SIX total queries (one customer
lookup, then five in `Promise.all`: the order aggregate, the unpaid-order
count, the return/exchange `groupBy`, the Purchase History list, and the
new Ledger list) — still O(1) in query COUNT regardless of how many
orders, returns, or receipts that customer has, exactly the same
"aggregate, never iterate" shape Part 4 established. Re-audited
specifically for this phase's addition: the new Ledger query is a single
`findMany` with an `order: { select: { orderNumber: true } }` and
`createdByAdminUser: { select: { name: true } }` nested select — Prisma
resolves this as one SQL query with joins, not N+1 lookups per receipt.
"Ledger should scale" (section 13) — bounded by the same 500-row cap
Purchase History already uses (a small shop's most loyal customer's own
payment history in practice stays far below this), documented as a known
limitation below, not a silent, undocumented truncation.

## Security (section 14)

- `receivePaymentAction` (`src/server/actions/admin/receive-payment.ts`)
  independently re-checks `getAdminSession()` and rejects with
  `UNAUTHORIZED` before ever touching its input — mirroring
  `createCounterSaleAction`'s exact shape, since (unlike Part 4's
  read-only pages) this phase DOES add a real mutation, with its own
  callable reference a client could otherwise invoke directly. Proven via
  a real (not mocked) admin session test: with no session cookie at all,
  the action returns `UNAUTHORIZED` and the order's Outstanding is
  confirmed completely untouched.
- Confirmed, via the same project-wide grep Part 4 used, that
  `receivePayment`/`PaymentReceipt`/`receive-payment` have ZERO
  references anywhere under `src/server/queries/customer-portal/`,
  `src/server/actions/customer-portal/`, `src/components/customer-portal/`,
  `src/lib/customer-portal/`, or any `src/app/(site)/` route — the
  Customer Portal has no import path to any of this phase's code, exactly
  like KhataBook's read-only Part 4 surfaces.
- `adminUserId` is ALWAYS resolved from the verified session
  (`admin.id`), never from client input — `receivePaymentSchema` has no
  such field for a client to even supply one. Proven directly: a test
  submits a payload with an extraneous, forged `adminUserId` field and
  confirms the recorded `PaymentReceipt.createdByAdminUserId` is still the
  REAL session's admin, not the forged value (zod's schema-shaped parsing
  simply drops the unrecognized field).

## Testing (Part 5, section 15)

- **`src/lib/__tests__/receive-payment.test.ts`** (8 tests) — the pure
  `validateReceivePaymentAmount`: valid partial payment, exact-balance
  payment, zero/negative/non-integer rejection, overpayment rejection,
  and the distinct `ALREADY_PAID` case (including when the amount is
  ALSO independently invalid, proving Outstanding is checked first).
- **`src/server/commerce/__tests__/receive-payment.test.ts`** (13 tests,
  real Postgres, the real `createCounterSale` → `receivePayment` chain) —
  a basic partial payment; the final payment moving `paymentStatus` to
  `PAID`; a full-credit order paid off across two sequential receipts
  reproducing the brief's own ₹650/₹500/₹150/₹150/₹0 example exactly,
  with Ledger ordering and before/after snapshots asserted directly;
  zero/negative/overpayment rejection; the distinct `ALREADY_PAID` case;
  `ORDER_NOT_FOUND`; `CUSTOMER_MISMATCH`; idempotent repeat submission
  (sequential AND truly concurrent); and a genuine concurrency race
  between two different concurrent payments that together would overpay,
  proving exactly one wins.
- **`src/server/commerce/__tests__/receive-payment-returns-exchange.test.ts`**
  (new file, 2 tests) — a Return and an Exchange, each performed on an
  order that was fully paid off via `receivePayment` moments earlier,
  proving the reverse-direction independence described above.
- **`src/server/actions/admin/__tests__/receive-payment.test.ts`** (4
  tests, real admin session via `createAdminSession`, mirroring
  `returns.test.ts`'s own established convention rather than mocking
  `getAdminSession`) — `UNAUTHORIZED` with no session; `VALIDATION` for a
  malformed amount and an unknown payment method; and the happy path,
  proving `adminUserId` is resolved from the session even when a client
  tries to forge one in the payload.
- **`src/lib/validation/__tests__/admin-khatabook.test.ts`** (9 new
  tests) — `receivePaymentSchema`: valid payload, trimmed note,
  zero/negative amount rejection, `CASH_ON_DELIVERY` rejection (proving
  reuse of Counter Sale's own payment-method subset), UPI/CARD accepted,
  malformed idempotency key, over-length note, and missing
  orderNumber/customerId.
- **`src/server/queries/admin/__tests__/khatabook.test.ts`** (1 new
  test, extending Part 4's file) — the Ledger appears on the customer
  profile, newest-first, each row correctly showing its order, amount,
  method, note, before/after Outstanding, and the recording admin's name.

## Regression (Part 5)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 788/788 passing.
- `npm run build` (Turbopack) — succeeds; all 28 routes compile (no new
  routes this phase — the Receive Payment dialog lives on the existing
  KhataBook customer profile page).
- **New migration**: `20260808210000_phase3_6_5_part5_payment_ledger` —
  one new table (`payment_receipts`), no alterations to any existing
  table (unlike Part 2/3's own populated-table-column additions, this is
  a brand-new table with no backfill needed). Re-verified per "protect
  every previous phase": created `shop_fresh_verify_p5`, applied all 17
  migrations, confirmed **zero drift** (`prisma migrate diff --exit-code`),
  ran `prisma/seed.ts` and `prisma/create-admin.ts` successfully, then
  dropped the database.
- **Dev-server restart discipline, again**: this phase DOES add a schema
  migration (unlike Part 4), so the long-running dev server was killed,
  `prisma generate` re-run, and the server restarted before manual
  verification — the same lesson from Part 2's own regression pass,
  re-applied here rather than assumed unnecessary.
- Manual verification (no browser-automation tool in this environment,
  same disclosed limitation as every prior phase): after the restart
  above, a real, unmocked script against the live dev database (1)
  confirmed an unauthenticated request to the customer's KhataBook profile
  redirects to `/admin/login`; (2) confirmed the profile page renders
  Outstanding ₹650 and a Receive Payment button for a fresh ₹650
  full-credit sale; (3) confirmed a deliberate overpayment attempt is
  rejected (`EXCEEDS_OUTSTANDING`); (4) recorded a real ₹500 payment and
  confirmed Outstanding dropped to ₹150; (5) confirmed the profile page's
  Ledger section renders the ₹500 receipt with the correct Outstanding-
  After figure (verified against the raw HTML directly, since React
  inserts an intervening comment node between adjacent JSX text that a
  naive substring check missed at first); (6) recorded the final ₹150
  payment and confirmed `paymentStatus` became `PAID` with `outstandingInPaise`
  at exactly `0`; (7) confirmed the Receive Payment button correctly
  disappears once no order has a balance due; (8) confirmed the EXISTING
  Admin Order Detail page (Part 3) independently reflects the same
  fully-paid state. All script-created data (orders, receipts, products,
  customer, admin user, session, category) was deleted afterward,
  confirmed via direct row-count comparison against the shared dev
  database (`orders`: 8, `customers`: 5, `products`: 13,
  `payment_receipts`: 0 — unchanged/empty before and after).

## Known limitations (Part 5)

- **No payment reversal or correction** — a mistaken entry cannot be
  undone or edited by anything in this codebase yet (section 12); the
  future direction (a reversal record, never a mutation of the original)
  is documented above but explicitly not built.
- **The Receive Payment dialog's Order picker offers every one of the
  customer's own orders with a balance due, with no guidance on WHICH
  one a walk-in customer intends to pay down** — for the overwhelmingly
  common case (one open balance) this is a non-issue (the order is
  auto-selected and shown as plain text, no picker at all); a customer
  with multiple simultaneous open balances requires the admin to know
  which order the cash is actually for, same as a real paper Khata book
  would.
- **Ledger and Purchase History are both capped at 500 rows per
  customer** — unchanged from Part 4's own convention, in practice far
  beyond what any real customer reaches.
- **No customer-level payment history aggregation across the whole
  shop** (e.g. "today's total collections") — explicitly Analytics,
  out of scope (section 18).
- **No partial-amount suggestion or quick-amount buttons** (e.g. "Pay
  full balance") in the dialog — a plain amount field only; a
  reasonable follow-up UX polish, not required by the brief.

## Architecture decisions (Part 5)

- **`PaymentReceipt` is a single, concrete model for exactly one event
  type (a payment collected), not a generic, extensible "ledger event"
  table with a `type` discriminator** — the brief's own "Ledger" concept
  is realized as a VIEW (the customer profile's Ledger section, built
  from `PaymentReceipt` rows plus each row's own order context), not a
  separate abstract entity requiring its own generic schema. Adding a
  speculative `type` enum for hypothetical future event kinds (a
  reversal, a manual adjustment) with only one real member today would
  be exactly the premature abstraction this project's own conventions
  warn against; a future phase that adds a second real event kind is
  better positioned to design the right generalization once it knows
  what that second kind actually needs.
- **`receivePayment`'s public `customerId` parameter is the customer's
  PUBLIC identifier (`Customer.customerId`, e.g. `KLQ-7A41K2`), resolved
  to the internal `Customer.id` via the order's own `customer` relation
  inside the transaction — never the reverse** — this was a genuine
  design correction made mid-implementation: an early draft accepted the
  internal cuid directly, which would have made the Server Action's own
  `revalidatePath(`/admin/khatabook/${customerId}`)` silently revalidate
  the WRONG path (the route is keyed by the public identifier). Resolving
  the public identifier at the boundary and only ever deriving the
  internal id from an already-trusted `Order` row removed the ambiguity
  entirely, and matches every other boundary in this codebase (order
  numbers, return numbers) that prefers a public identifier over an
  internal key.
- **Guarded-`updateMany` concurrency, not a database row lock or
  `SERIALIZABLE` transaction isolation** — mirrors `updateOrderStatus`/
  `updatePaymentStatus`'s own established choice: simpler to reason
  about, requires no isolation-level configuration, and the "read
  current value, write only if it still matches" check inside one
  transaction is suf­ficient to prevent a lost update, proven directly by
  the concurrent-payment-race test.
- **A new `src/components/ui/dialog.tsx` rather than repurposing
  `Sheet`** — a centered confirmation dialog and an edge-docked
  navigation/detail panel are different enough UX patterns (a "simple
  dialog," section 2's own words, reads as a small, centered, modal
  interaction, not a slide-in panel) that forcing one component to serve
  both would mean an awkward `side` prop misuse; splitting them keeps
  each component's className logic simple, while still sharing the one
  underlying headless primitive.

## Final Part 5 verdict

> The Admin can safely collect outstanding payments, every payment
> becomes a permanent ledger entry linked to its originating order,
> outstanding balances automatically update, payment status transitions
> remain consistent, and the KhataBook becomes a trustworthy accounting
> record without allowing direct balance edits.

Demonstrated true, with evidence cited above: Receive Payment is
implemented as a simple dialog exactly matching section 2's own flow
(Customer Profile → Outstanding → Receive Payment), validated against
negative/zero/overpayment amounts with Outstanding proven to never go
negative (section 3); every payment creates a permanent, immutable
`PaymentReceipt` linked to its originating Order via a `Restrict`-guarded
foreign key, traceability never lost (sections 5, 11); Outstanding
balances update automatically and payment status derives via the SAME
existing `derivePaymentStatus` function Part 3 already established, with
`PARTIALLY_PAID` still unreachable through any admin override (sections
4, 8); Returns and Exchanges were proven, in BOTH directions and against
real database rows, to remain completely independent of Outstanding
(sections 9, 10); and Outstanding can be changed by exactly one
code path in this entire codebase, which never accepts a direct
client-supplied balance and cannot be raced into an inconsistent state
(section 1). Full test suite passes (788/788, including a from-scratch
database run); fresh-database verification passes (17 migrations, zero
drift); production build passes; manual verification against the live
dev database confirmed the complete collection flow end-to-end,
including the exact ₹650/₹500/₹150/₹0 worked example from the brief
itself; documentation is complete.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), and Phase 3.6.5 Part 1/Part 2/Part 3/Part 4/Part 5 remained
uncommitted together in the working tree, per instruction, at the time
Part 5 was reviewed and approved.

## Part 6 — Retail Operations Production Acceptance & Final Validation

Date: 2026-08-08

This part builds no new feature. Its brief was short by design: "Phase
3.6.5 Parts 1–5 are COMPLETE. Return the implementation report and wait
for review." — a final sign-off pass, not a spec to implement. It exists
to answer one question with evidence rather than assumption: does the
retail-operations engine built across Parts 1–5 (Counter Sale customer
UX, the Discount engine, Partial Payments/Khata, the KhataBook customer
ledger, and Payment Collection) actually hold together as ONE coherent
system, in production-realistic conditions, rather than as five
independently-tested slices that happen to compile together? Six
independent validation passes were run — full regression, fresh-database
migration, a new cross-phase end-to-end test, and three audits (security,
performance, accessibility) — and two genuine, narrow issues were found
and fixed as part of this acceptance process.

## Validation approach

Given the scale of "does everything from five phases still cohere,"
three of the six validation passes (security, performance,
accessibility) were delegated to independent background audit agents
running in parallel while the other three (regression, fresh-database
verification, the new cross-phase integration test, and manual live-
server verification) were carried out directly — each agent was briefed
with full context (which files, which invariants each phase's own report
claims, what "genuine finding" versus "style nitpick" means) and
instructed to report PASS/FAIL per check with file-and-line citations,
not to manufacture findings to seem thorough. Every finding below was
independently reviewed before being acted on.

## 1. Full regression

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 789/789 passing (788 carried over from Part 5, plus
  one new cross-phase integration test — see below).
- `npm run build` (Turbopack) — succeeds; all 28 routes compile,
  unchanged from Part 5 (this part adds no new route).

## 2. Fresh-database verification

Created `shop_fresh_verify_p6`, applied all 17 migrations from
`20260803191714_init` through `20260808210000_phase3_6_5_part5_payment_ledger`
cleanly, confirmed **zero drift** (`prisma migrate diff --exit-code`),
ran `prisma/seed.ts` and `prisma/create-admin.ts` successfully, and — going
further than any single prior part's own regression section — ran the
**entire 789-test suite a second time, against this from-scratch
database**, confirming 789/789 pass there too, before dropping it. This
is the strongest evidence available in this environment (no CI, no
staging environment) that the migration history is reproducible from
nothing and that no test's passing depended on incidental state left
over in the long-lived dev database.

## 3. Cross-phase end-to-end integration test

Every prior phase's own test suite proved its OWN slice correct in
isolation — Part 2 proved discounts compute correctly, Part 3 proved
partial payments compute correctly, Part 5 proved payment collection
computes correctly — but no single test had ever exercised all of them
together, in the order a real shop day actually produces them. A new
file, `src/server/commerce/__tests__/full-retail-lifecycle.test.ts`, adds
exactly that: one continuous scenario, against real Postgres, carrying
a single order through:

1. A Counter Sale with a 20% Discount (Part 2) and a Partial Payment
   (Part 3) — Subtotal ₹1000 → Grand Total ₹800 → ₹300 received → ₹500
   Outstanding.
2. KhataBook search (Part 4) finding the customer by phone, with the
   Outstanding/Lifetime aggregates matching the Grand Total, never the
   Subtotal.
3. Receive Payment (Part 5) clearing the remaining ₹500 across two
   installments, `paymentStatus` deriving to `PAID`, the KhataBook
   Ledger showing both receipts with correct before/after snapshots.
4. A Return (Phase 3.5) on the now-fully-paid order, proving the
   returned value is still the ₹800 EFFECTIVE (discounted) price, never
   the ₹1000 catalog price, and that Outstanding/Received/`paymentStatus`
   from step 3 are completely undisturbed by the return — re-read fresh
   from the database at the very end, not merely asserted once.

This test passed on its first run with no code changes required — real,
positive evidence that the five parts' boundaries are exactly where each
part's own documentation claims they are, not merely each part's own
tests agreeing with its own assumptions.

## 4. Security audit (delegated, independently reviewed)

**Verdict: PASS on all 7 checks audited. No genuine security gap found.**

Confirmed: every Phase 3.6.5 admin route (including the two new
KhataBook routes) is nested under `src/app/admin/(protected)/`, gated by
one `getAdminSession()` check with no exception; every mutating Server
Action (`receivePaymentAction`, `createCounterSaleAction`, and every
other action under `src/server/actions/admin/`) independently
re-checks `getAdminSession()` as its first statement and resolves
`adminUserId`/`createdByAdminUserId` from the verified session, never
from client input, with no schema field anywhere that would let a
client supply one; `receivePayment`'s customer/order mismatch check and
its guarded-`updateMany` concurrency check are both correctly
implemented; and a project-wide grep found zero references from any
customer-portal file to KhataBook, `receivePayment`, `PaymentReceipt`,
`outstandingInPaise`, or `amountReceivedInPaise` (the only
`discountInPaise` references in customer-facing code are the customer's
OWN receipt/order-confirmation pages showing their OWN already-applied
discount — not Khata/ledger data, and not Part 2's discount metadata
like `discountType`/`discountReason`). No fix was needed for this pass.

## 5. Performance audit (delegated, independently reviewed)

**Verdict: PASS — no N+1 risk found**, with one stale doc-comment
corrected as a result.

The audit built a real, throwaway customer with 30 Counter Sale orders
(mixed Full/Partial) and 20 real `PaymentReceipt` rows via
`receivePayment`, then called `getKhataBookCustomerProfile` directly and
measured actual query counts. Finding: the function's own doc comment
claimed "five parallel queries," but a real run measures roughly eight —
this schema doesn't enable Prisma's `relationJoins` preview feature, so
the Ledger query's nested `order`/`createdByAdminUser` selects each
compile to one further Prisma-BATCHED `WHERE id IN (...)` round-trip
rather than a single SQL JOIN. Critically, that batching is itself still
O(1) — with 20 Ledger rows spanning only 2 orders and 1 admin, Prisma
collapsed each nested select to ONE `IN (...)` query, never one query
per row — so the underlying "no N+1" guarantee holds exactly as
documented, only the literal query count in the comment was imprecise.
Fixed: `getKhataBookCustomerProfile`'s doc comment
(`src/server/queries/admin/khatabook.ts`) now describes this accurately
— five logical operations, ~8 actual round-trips due to Prisma's
relation-loading strategy, still O(1) regardless of row count — rather
than a specific number that doesn't hold up under measurement. Timing:
a cold call took ~22.5ms, a warm repeat ~3.9ms, both trivial at any
realistic shop scale. All test data (30 orders, 20 receipts, 1 customer,
53 variants, 1 admin, 1 category) was created and fully cleaned up; row
counts on the shared dev database were confirmed unchanged before and
after.

## 6. Accessibility audit (delegated, independently reviewed) — two genuine findings, both fixed

**Verdict: two real, narrow findings — both fixed as part of this
acceptance pass, not merely documented.**

1. **Missing visible focus ring on two keyboard-reachable search-result
   buttons** — `src/components/admin/counter-sale-product-search.tsx`
   and `src/components/admin/counter-sale-customer-panel.tsx` each had a
   real, tabbable `<button>` row (search results) styled with
   `focus-visible:outline-none` and NO replacement ring class — a
   genuine WCAG 2.4.7 (Focus Visible) violation, and an inconsistency
   with the sibling "Recent Customers" button list three lines away in
   the same file, which already had the correct ring classes. **Fixed**:
   both now carry the identical `focus-visible:ring-2
   focus-visible:ring-ring focus-visible:ring-inset` classes their own
   sibling already used — a one-line consistency fix, not a new pattern.
2. **Amount-input error messages weren't programmatically associated
   with their inputs** — `receive-payment-dialog.tsx`,
   `counter-sale-discount-panel.tsx`, and `counter-sale-payment-panel.tsx`
   all showed a validation error as plain text near the amount field,
   but never wired `aria-describedby`/`aria-invalid` to it — a
   screen-reader user tabbing to a field that already has an error
   wouldn't hear it automatically. **Fixed**: all three now set
   `aria-invalid={Boolean(previewError)}` and
   `aria-describedby={previewError ? errorId : undefined}` on the
   relevant input(s), with the error `<p>` given the matching `id`.

Confirmed separately, not merely assumed: the new `src/components/ui/dialog.tsx`'s
reliance on `@base-ui/react/dialog` for focus-trapping, Escape-to-close,
and `aria-modal`/labelling was verified by reading the primitive's own
source (`FloatingFocusManager` with `modal`/`returnFocus`/`restoreFocus`,
`useDismiss`'s `escapeKey: isTopmost`, and auto-wired
`aria-labelledby`/`aria-describedby` to `Title`/`Description`) rather
than taken on faith from the library's reputation. Every `<table>`
(Purchase History, Payment Ledger, KhataBook search results) has a
correct `sr-only` `<caption>` and `scope="col"` headers; every toggle
button uses real `aria-pressed` state; and every color-coded figure
(Outstanding amber, Ledger `+amount` emerald) is always paired with a
text label, never color alone.

## 7. Known limitations — reconciled across Parts 1–5

Two limitations recorded in earlier parts' own "Known limitations"
sections are RESOLVED by later parts and are removed from the
consolidated list below rather than left stale:

- ~~Part 3: "No 'Receive Payment' flow exists yet"~~ — resolved by Part
  5.
- ~~Part 3: "No KhataBook dashboard, ledger, or per-customer aggregate
  Outstanding view"~~ — resolved by Part 4 (view) and Part 5 (ledger).
- ~~Part 4: "No payment collection"~~ — resolved by Part 5.

Limitations that remain genuinely open, consolidated (see each part's
own section for full reasoning):

- **Whole-percent-only discounts** (Part 2) — fractional percentages
  rejected by design.
- **Partial-quantity return/exchange values are proportionally rounded**
  (Part 2) — a ±1 paisa cosmetic drift only in the rare case of
  splitting one line's return across multiple separate requests; never
  affects inventory.
- **Exchange replacement pricing never inherits the original discount**
  (Part 2) — a deliberate design decision.
- **A Partial Payment's Outstanding is fixed at sale time** (Part 3) —
  there is no "edit an existing order" feature anywhere in this
  codebase to revisit it against.
- **Lifetime Purchase/Total Orders include CANCELLED orders** (Part 4)
  — mirrors `getDashboardStats`'s own existing precedent; worth
  revisiting if a shop owner explicitly wants a cancelled-exclusive
  figure.
- **No customer-level "family"/linked-accounts concept** (Part 4) — each
  Customer row is its own independent Khata.
- **No payment reversal or correction** (Part 5) — a mistaken entry
  cannot be undone or edited; the future direction (a reversal record,
  never a mutation) is documented but not built.
- **Ledger and Purchase History are both capped at 500 rows per
  customer** (Part 4/5) — far beyond any real customer in practice.
- **No shop-wide payment/revenue analytics** (Part 5) — explicitly
  out of scope for the whole 3.6.5 initiative.
- **No partial-amount suggestion/quick-amount buttons** in the Receive
  Payment dialog (Part 5) — a reasonable follow-up polish, not required.

No NEW limitation was introduced by this Part 6 pass — its only code
changes are the two accessibility fixes and one doc-comment correction
described above.

## Final Part 6 verdict — Production Acceptance

> The retail-operations engine built across Phase 3.6.5 Parts 1–5 —
> Counter Sale customer UX, the Discount engine, Partial Payments/Khata,
> the KhataBook customer ledger, and Payment Collection — is production-
> ready: it holds together as one coherent system under a real
> cross-phase scenario, has no security gap across any of its admin
> surfaces or Customer Portal boundary, carries no N+1 performance risk
> at realistic scale, and its only two accessibility gaps found during
> this acceptance pass have been fixed, not merely logged.

Demonstrated true, with evidence cited above: full regression passes
(789/789, both against the live dev database and a from-scratch one);
fresh-database migration is clean and reproducible (17 migrations, zero
drift); a new end-to-end test proves every phase's own boundary claim
holds simultaneously in one real scenario, not just in each phase's own
isolated tests; independent security, performance, and accessibility
audits each returned a specific, evidence-based verdict rather than a
rubber stamp, and the two genuine, narrow issues surfaced (a focus-ring
inconsistency, an unassociated error message) were fixed as part of this
acceptance, with a stale performance doc-comment corrected alongside
them; and every "Known limitation" recorded across Parts 1–5 was
reconciled — two resolved by later parts, the rest still accurately
described as open, deliberate scope boundaries rather than defects.

Changes across Phase 3.1 through Phase 3.5 (all parts), Phase 3.6 (all
four parts), and Phase 3.6.5 (Parts 1 through 6) remain uncommitted
together in the working tree, per instruction. Phase 3.6.5 is complete
through Part 6 — awaiting review.
