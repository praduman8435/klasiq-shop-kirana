# Phase 3.6 — WhatsApp Integration

## Part 1 — Production WhatsApp OTP Integration

Date: 2026-08-08

Replaces Phase 3.4 Part 1's development-only console OTP stand-in with a
real, production-grade WhatsApp Business Cloud API delivery provider,
while leaving the entire authentication flow (OTP generation, hashing,
expiry, attempt limits, replay protection, resend cooldown, rate
limiting, session creation) completely untouched. This part is
explicitly scoped to OTP delivery only — no order/return/exchange
notifications, no marketing, no broadcasts (Phase 3.6's later parts).

## Existing implementation audited (before writing any code)

Read directly, not assumed:

- **`src/server/otp/provider.ts`** — confirmed the `OtpProvider` interface
  (`sendOtp({ phoneNormalized, code, purpose })`) was already designed
  (Phase 3.4 Part 1) specifically so a real provider could be plugged in
  later with zero change to the domain layer, and that `getOtpProvider()`
  previously threw unconditionally in production (no real provider
  existed yet) — the exact gap this part closes.
- **`src/server/customer-portal/otp.ts`** — confirmed `requestOtp`
  already calls the provider BEFORE persisting any challenge (so a
  failed send never starts a cooldown window or supersedes a still-valid
  challenge the customer might have in hand), and that `provider` is
  already an injectable parameter used by every existing test
  (`otp.test.ts`) to avoid depending on a real send. Both properties are
  unchanged by this part.
- **`src/lib/otp-config.ts`** — confirmed generation (6-digit,
  `crypto.randomInt`), expiry (10 min default), attempts (5 default),
  resend cooldown (45s default), and rate limiting (5/60min default) are
  all already centralized, env-overridable, and require no change per
  section 6 of the brief ("reuse the existing OTP generation... do NOT
  change").
- **`CustomerSession`/`OtpChallenge`** (`prisma/schema.prisma`) —
  confirmed neither model has any field related to delivery provider or
  channel — the schema was already provider-agnostic; no migration is
  needed or was made for this part.
- **Customer Portal** (`/track`, Phase 3.4) — confirmed the entire
  phone-entry/code-entry UI and its Server Actions
  (`requestOtpAction`/`verifyOtpAction`,
  `src/server/actions/customer-portal/auth.ts`) call only
  `requestOtp`/`verifyOtp` — neither imports or knows about any provider
  type. Zero changes were needed or made to any of these files.
- **`.env.example`** — confirmed the existing OTP-policy block already
  anticipated this part ("No real OTP delivery provider exists yet
  (Phase 3.6 adds WhatsApp)") — updated in place, not restructured.

## Provider architecture

**No rewrite** — exactly per section 2 of the brief. The `OtpProvider`
interface (`src/server/otp/provider.ts`) is byte-for-byte unchanged:

```ts
export type OtpProvider = {
  sendOtp(params: { phoneNormalized: string; code: string; purpose: string }): Promise<void>;
};
```

One new implementation, `WhatsAppOtpProvider`
(`src/server/otp/whatsapp-provider.ts`), sends a WhatsApp template
message via the Meta WhatsApp Business Cloud API
(`POST https://graph.facebook.com/{version}/{phoneNumberId}/messages`).
`requestOtp` (`src/server/customer-portal/otp.ts`) still only ever calls
`provider.sendOtp(...)` — it has no idea which concrete class it's
talking to, exactly as designed in Phase 3.4 Part 1.

## Environment-based provider selection

`getOtpProvider()` (`src/server/otp/provider.ts`) decision table — never
hard-coded, read entirely from environment:

| `NODE_ENV`     | `OTP_PROVIDER`                    | Result                                                                                                                   |
| -------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `production`   | *(any value)*                     | **Always** `WhatsAppOtpProvider` — `OTP_PROVIDER` has no effect                                                          |
| not production | unset / anything but `"whatsapp"` | `ConsoleOtpProvider` (unchanged dev experience)                                                                          |
| not production | `"whatsapp"`                      | `WhatsAppOtpProvider` — lets a developer test real delivery from a local/staging environment without flipping `NODE_ENV` |

**Production can never be downgraded to the console provider** — this is
a hard, non-overridable invariant, deliberately preserved from Phase 3.4
Part 1's original fail-closed design (which simply threw outright, since
no real provider existed). `OTP_PROVIDER=console` in production is
silently ignored, not honored — proven directly
(`src/server/otp/__tests__/provider.test.ts`, "always returns
WhatsAppOtpProvider when configured, regardless of OTP_PROVIDER").
`ConsoleOtpProvider` additionally still carries its own independent,
unchanged defense-in-depth check (throws if somehow called while
`NODE_ENV === "production"`) — a second, redundant guard against a
future refactor mistake, exactly as Phase 3.4 Part 1 built it.

If production is missing any required `WHATSAPP_*` variable,
`getOtpProvider()` throws a clear (but never customer-visible — see
"Failure handling" below) configuration error rather than silently
falling back to console or fabricating success — the same fail-closed
philosophy Phase 3.4 Part 1 established, now backed by a real provider
class instead of an unconditional throw.

## Environment configuration

New variables (`.env.example`, template only — no real values committed):

- `WHATSAPP_API_TOKEN` — a Meta System User permanent access token with
  `whatsapp_business_messaging` permission. **Required in production.**
- `WHATSAPP_PHONE_NUMBER_ID` — the Cloud API "Phone number ID" (not the
  phone number itself) for the sending number. **Required in
  production.**
- `WHATSAPP_OTP_TEMPLATE_NAME` — the name of the one dedicated,
  Meta-approved Authentication-category template used only for OTP
  (section 5 — see "Template isolation" below). **Required in
  production.**
- `WHATSAPP_OTP_TEMPLATE_LANGUAGE` — optional, defaults to `en_US`.
- `WHATSAPP_API_VERSION` — optional, defaults to `v21.0`.
- `OTP_PROVIDER` — optional, non-production-only override (`"console"`
  default or `"whatsapp"`); documented above.

All five WhatsApp variables are read in exactly ONE place —
`createWhatsAppOtpProviderFromEnv` (`src/server/otp/provider.ts`) — so
credentials never leak into any other module, and `WhatsAppOtpProvider`
itself never touches `process.env` directly (it receives fully-resolved
config via its constructor), keeping it trivially testable with fake
credentials.

## Template isolation

`WhatsAppOtpProvider`'s constructor takes `templateName` as its own
required field — there is no shared "notification template" constant
anywhere in this codebase for it to accidentally reuse, and no other
caller of this class exists. When a later phase adds order/return/
exchange notifications, it will need its own, separately-configured
template name (a new env var, a new call site) — this class's design
gives it no path to accidentally reuse the OTP template, satisfying
section 5's "OTP messages should remain isolated" structurally, not just
by convention.

The message body sent is Meta's minimum-required shape for an
Authentication-category template: one `body` component with the code as
its single parameter. Deliberately does NOT include a "Copy Code" button
component speculatively — supplying a button component for a template
that wasn't actually approved with one causes Meta to reject the entire
message. Documented directly in the code as the extension point for
whoever configures the real approved template, if it turns out to use a
button.

## Delivery flow (section 7)

**Unchanged** from Phase 3.4 Part 1, confirmed by re-reading
`requestOtp` end to end: generate code → call `provider.sendOtp(...)` →
**only on success**, hash and persist the challenge → return a generic
response. The OTP is never returned to the browser at any point — the
Server Action (`requestOtpAction`) returns only a static, existence-
independent message string, unchanged since Phase 3.4 Part 1.

## Failure handling (section 8)

If `WhatsAppOtpProvider.sendOtp` throws for any reason (a real error
response from Meta, or a network failure after exhausting its one
retry), `requestOtp`'s existing catch block converts it to a generic
`PROVIDER_UNAVAILABLE` result — **no challenge is created, no
`CustomerSession` is ever created** (session creation only ever happens
in `verifyOtpAction` after a successful OTP verification, which requires
a challenge that was never persisted here). The customer sees "We
couldn't send a verification code right now. Please try again shortly."
— a clean retry path (the existing cooldown/rate-limit rules still
apply to the retry, exactly as before) — never Meta's raw error message,
error code, or any account/token detail.

**New this part**: `requestOtp`'s provider is now resolved (`provider ??
getOtpProvider()`) INSIDE the same try block as the send call, not as a
default parameter evaluated before it. This means a provider
**construction** failure (e.g. missing WhatsApp credentials) is now
handled by the exact same code path as a **send** failure — both
produce the identical, clean `PROVIDER_UNAVAILABLE` result, never an
uncaught exception that could otherwise surface a raw configuration
error message in a server crash. Proven directly:
`src/server/customer-portal/__tests__/otp-provider-selection.test.ts`
mocks `getOtpProvider` to throw and confirms `requestOtp` still returns
cleanly with no challenge created; the manual verification script (see
below) proves the identical property against the REAL, unmocked
`getOtpProvider()` with genuinely missing environment variables.

This is a small, targeted robustness improvement — not a rewrite of
`requestOtp`'s logic. The function's signature changed from
`provider: OtpProvider = getOtpProvider()` to `provider?: OtpProvider`
with the same effective default-resolution behavior; every existing
caller (`requestOtpAction`, calling `requestOtp(phone)` with no second
argument) and every existing test (which always supplies an explicit
fake provider, bypassing `getOtpProvider()` entirely) is unaffected —
confirmed by the full, unmodified `otp.test.ts` suite (19 tests) still
passing.

## Provider retries (section 9)

**Retries only where it is provably safe to do so.** `WhatsAppOtpProvider`
distinguishes exactly two failure classes:

1. **Network-level failure** (DNS failure, connection refused/reset, a
   fetch-level abort) — Node's `fetch` (undici) surfaces all of these as
   a `TypeError`. The request **never reached Meta's servers at all**,
   so retrying can never produce a duplicate WhatsApp message — only a
   second, genuine attempt at a send that provably didn't happen the
   first time. Retried **exactly once** (two attempts total, a short
   fixed 400ms delay between them) — bounded so a customer waiting on
   the synchronous `requestOtp` call is never kept waiting long.
2. **Any received HTTP response**, including a 5xx from Meta — **never
   retried**, under any circumstance. Meta having accepted the
   connection and responded at all means the message may already have
   been queued or even delivered before the error was generated;
   retrying risks a real duplicate WhatsApp message landing on the
   customer's phone. This is the single most important property of the
   retry strategy and is proven directly, not just documented: a
   dedicated test confirms `fetch` is called **exactly once** for a
   received 400 response, never twice.

Proven directly for both branches
(`src/server/otp/__tests__/whatsapp-provider.test.ts`): a genuine
network failure followed by a successful retry; two consecutive network
failures exhausting the one retry and then throwing; a received error
response never retried.

## Rate limiting (section 10)

**Completely unchanged and unbypassed.** `OTP_CONFIG`'s resend cooldown
(45s default) and rolling-window cap (5/60min default) live entirely in
`src/lib/otp-config.ts` and are enforced entirely inside `requestOtp`,
both BEFORE the provider is ever constructed or called — switching the
delivery mechanism has zero interaction with these checks. Proven
directly: the manual verification script's Step 2 (a real delivery
failure) and Step 3 (missing config) both still leave the phone's
cooldown/window counters exactly where a normal failed attempt would —
confirmed by re-running the full, unmodified `otp.test.ts` cooldown/
rate-limit tests (all still pass).

## Logging (section 11) & Observability (section 12)

`WhatsAppOtpProvider` logs exactly two lines, both via the same plain
`console.log`/`console.error` convention already used everywhere else in
this codebase (`geoapify.ts`, `place-order.ts`, `counter-sale.ts` — no
dedicated logging library exists in this project, so none was introduced
here):

- **Success**: `console.log("whatsapp-otp-provider: otp delivered", {
  phoneNormalized })` — the phone number only (not itself a secret in
  this codebase — already visible to admins on every order/customer
  record), never the code.
- **Failure**: `console.error("whatsapp-otp-provider: otp delivery
  failed", { phoneNormalized, httpStatus, metaErrorCode, metaErrorType })`
  for a received error response, or `{ phoneNormalized, reason:
  "network" }` for an exhausted network-level retry — a coarse category
  only. Meta's raw `error.message` field (which can vary in content) is
  **never** logged, only its numeric `code`/`type` classification.

Proven directly, not just by code review: dedicated tests assert the
OTP code and the API token never appear anywhere in any `console.log`/
`console.error` call, across both the success and failure paths, and
that Meta's raw error message string is absent from the failure log.

No new metrics/alerting/dashboard infrastructure was added — none exists
anywhere in this codebase today, and building one speculatively for a
single provider's two log lines would be exactly the kind of
infrastructure the project's own established discipline (see every
prior phase's "avoid unnecessary work," "do not add infrastructure
speculatively") argues against. This remains honestly disclosed as
architecture debt below, same as Phase 3.4 Part 1 originally flagged it,
now narrowed to "no dashboard," since basic failure-category logging
does now exist.

## Security review (section 13)

- **OTP never logged**: proven directly (dedicated tests assert the code
  never appears in any logged value, success or failure path).
- **OTP never returned**: unchanged — `requestOtp`/`requestOtpAction`
  never include the code in any response; proven by the entire existing
  `RequestOtpResult`/`RequestOtpActionResult` type shapes, neither of
  which has a code field, re-confirmed unchanged by this part.
- **OTP never persisted plaintext**: unchanged — `hashSecret` (scrypt,
  Phase 3.4 Part 1) is still the only thing written to
  `OtpChallenge.codeHash`. Proven directly in the manual verification
  script: the persisted `codeHash` is confirmed NOT to contain the
  plaintext code sent to the fake WhatsApp server.
- **Provider credentials never exposed**: `WHATSAPP_API_TOKEN` is read in
  exactly one function (`createWhatsAppOtpProviderFromEnv`) and passed
  only into the `Authorization` header of the outbound fetch call to
  Meta — never logged (proven directly), never included in any thrown
  error message, never returned to the browser.
- **Replay still impossible**: unchanged — `verifyOtp`'s
  `consumedAt: null`-scoped lookup and guarded consumption are untouched
  by this part; the full replay test in `otp.test.ts` still passes
  unmodified.
- **Rate limiting still active**: see "Rate limiting" above.
- **Enumeration protection still intact**: `requestOtp` still never
  checks Customer existence (untouched); `requestOtpAction` still
  returns the identical generic message regardless of registration —
  re-confirmed by the existing, unmodified enumeration-privacy test in
  `auth.test.ts` still passing.
- **New for this part**: production can never be silently downgraded to
  the console provider (proven directly, see "Provider architecture"
  above) — a real OTP delivery failure or misconfiguration always fails
  closed with a generic customer-facing message, never a fabricated
  success and never a real code being printed to a production server's
  console (`ConsoleOtpProvider`'s own defense-in-depth throw, re-proven
  unchanged).

## Testing (section 14)

**550 tests passing** (533 from Phase 3.5 Parts 1–5 + 17 new for this
phase):

- `src/server/otp/__tests__/whatsapp-provider.test.ts` (new, 7 tests,
  mocked global `fetch`, no real network call): a successful send builds
  the exact correct Meta Cloud API request (URL, Bearer auth header,
  `messaging_product`/`to`-without-leading-plus/`template.name`/
  `template.language.code`/single body parameter); a custom template
  language and API version are honored; a delivery-success log line
  contains the phone number but never the code; a received error
  response throws without leaking the raw body and is called **exactly
  once** (never retried); the logged failure category contains only
  `httpStatus`/`metaErrorCode`, never Meta's raw message text; a genuine
  network failure retries once then succeeds; two consecutive network
  failures exhaust the one retry and then throw.
- `src/server/otp/__tests__/provider.test.ts` (new, 9 tests, real
  `process.env` manipulation via `vi.stubEnv`/`unstubAllEnvs`): outside
  production, defaults to `ConsoleOtpProvider` when `OTP_PROVIDER` is
  unset or set to anything other than `"whatsapp"`; switches to
  `WhatsAppOtpProvider` when `OTP_PROVIDER=whatsapp` and fully
  configured (case-insensitive, whitespace-trimmed); throws a clear
  config error when `OTP_PROVIDER=whatsapp` but credentials are missing;
  in production, always returns `WhatsAppOtpProvider` regardless of
  `OTP_PROVIDER` (even `"console"`); in production, fails closed with a
  config error if credentials are missing; `ConsoleOtpProvider` still
  refuses to send while `NODE_ENV=production` (defense in depth,
  unchanged); `ConsoleOtpProvider` still works normally outside
  production (the development experience is unchanged — proves
  "Development provider still works").
- `src/server/customer-portal/__tests__/otp-provider-selection.test.ts`
  (new, 1 test, real Postgres, `getOtpProvider` mocked to throw): proves
  `requestOtp`'s new construction-failure handling — a clean
  `PROVIDER_UNAVAILABLE` result with no configuration detail leaked, and
  zero `OtpChallenge` rows created.
- `src/server/customer-portal/__tests__/otp.test.ts` (Phase 3.4 Part 1,
  **unmodified**, all 19 tests still passing): OTP verification still
  works (correct code succeeds), wrong OTP fails, expired OTP fails,
  replay fails, rate limiting/cooldown still enforced — every property
  this part was required to preserve, proven by the exact same
  pre-existing test suite passing without a single line changed.

Section 14's full list (provider called, provider failure, provider
success, retry behavior, OTP verification still works, wrong OTP,
expired OTP, replay, rate limiting, development provider still works,
provider switching, no authentication on send failure) is covered by the
tests enumerated above, each traceable to a specific named test, plus
the manual verification script's own real, unmocked-module proof of "no
authentication on send failure" (below).

## Regression (section 15)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 550/550 passing, run twice (live dev database, and a
  from-scratch database — see below) with identical results.
- `npm run build` — succeeds. Notably, `next build` itself runs with
  `NODE_ENV=production` internally, and the build still completed with
  no WhatsApp credentials configured in the build environment — this
  confirms `createWhatsAppOtpProviderFromEnv` is called lazily, only
  when `getOtpProvider()` is actually invoked at request time, never at
  module-import or build time (no top-level `process.env` read
  anywhere in `whatsapp-provider.ts`).
- **No new migration** — this part touches no schema. Re-verified anyway
  per "protect every previous phase": created
  `shop_fresh_verify_p361`, applied all 14 existing migrations via
  `prisma migrate deploy`, confirmed **zero drift** via `prisma migrate
  diff` (unchanged from before this phase), ran `prisma/seed.ts` and
  `prisma/create-admin.ts` successfully, ran the full 550-test suite
  against it (100% pass), then dropped the database. The real shared dev
  database's `orders` (8), `otp_challenges` (0), and `customer_sessions`
  (0) counts were all confirmed unchanged before and after.
- Manual verification (no browser-automation tool in this environment,
  same honest disclosure as every prior phase): a real local HTTP server
  stood in for Meta's Graph API (a genuine network endpoint, not a
  mocked module) while the REAL `provider.ts` + `whatsapp-provider.ts` +
  `otp.ts` wiring ran end to end with `NODE_ENV=production` genuinely
  set. Proved: (1) a successful send made exactly one real HTTP call
  with the correct Bearer token and template name, and the resulting
  `OtpChallenge.codeHash` did not contain the plaintext code; (2) a
  simulated Meta failure (HTTP 500) produced a clean
  `PROVIDER_UNAVAILABLE` result with no challenge row created and no
  leaked error detail; (3) genuinely missing `WHATSAPP_API_TOKEN` in
  production failed closed with the identical clean result and zero
  HTTP calls attempted — proving the "never silently fall back to
  console" invariant against the real function, not a mocked stand-in.
  All three steps passed; the temporary local server was closed and all
  script-created data was deleted afterward, confirmed via direct count
  against the shared dev database (unchanged before/after).
- The long-running dev server was **not** restarted (no schema change in
  this phase means no stale-Prisma-Client risk exists here — this
  phase's code changes are plain TypeScript module changes, which a
  running `next dev` process picks up via its own file-watching/HMR,
  unlike a Prisma Client regeneration).

## Known limitations

- **No real WhatsApp Business Account has been (or could be, in this
  environment) exercised against** — this part implements a correct,
  complete Meta Cloud API integration (verified structurally: request
  shape, headers, retry behavior, error handling) and proves the full
  wiring against a real local HTTP server standing in for Meta, but has
  not sent an actual message through a real, approved WhatsApp Business
  template. Deploying this requires: a real Meta Business/WhatsApp
  Business Account, a verified sending phone number, an approved
  Authentication-category template, and a real System User access token
  — none of which can exist in this development environment.
- **Template shape assumption**: the request body assumes the simplest,
  Meta-minimum Authentication template shape (one body parameter, no
  button). If the actual approved template uses a "Copy Code" button
  component, `WhatsAppOtpProvider`'s `components` array needs one
  additional entry — a documented, one-line extension point, not
  guessed at speculatively here since guessing wrong would break real
  delivery.
- **No delivery-status webhook handling** — Meta's Cloud API can report
  delivery/read status asynchronously via a separate webhook; this part
  only handles the synchronous "was the send request itself accepted"
  response, which is sufficient for `requestOtp`'s own success/failure
  decision (it needs to know "should a challenge be created," not
  "was it actually read"). A future phase could add webhook-based
  delivery confirmation if a real operational need for it appears.

## Architecture debt

- **No dashboard/metrics/alerting on OTP delivery** — only two plain
  `console.log`/`console.error` lines exist (see "Observability" above).
  Phase 3.4 Part 1 flagged this as "reasonable once a real provider
  exists (Phase 3.6)" — this part now has the operationally meaningful
  half of that (a real failure category is captured, not just silence),
  but genuine metrics aggregation, alerting on elevated failure rates,
  or a delivery-latency dashboard remain unbuilt, deferred until real
  production traffic demonstrates a concrete need.
- **Fixed, non-configurable retry count/delay** — `MAX_SEND_ATTEMPTS`
  (2) and `RETRY_DELAY_MS` (400) are hard constants in
  `whatsapp-provider.ts`, not environment-configurable like
  `OTP_CONFIG`'s own policy knobs. A deliberate choice: these are
  network-reliability engineering parameters, not a business policy an
  owner would ever want to tune, unlike the OTP window/attempt-limit
  values. Revisitable if real-world Meta API latency/reliability ever
  demonstrates a different value is needed.
- **No circuit breaker / provider health check** — if Meta's API is down
  for an extended period, every `requestOtp` call still attempts a real
  HTTP call (with its one retry) before failing; there is no short-circuit
  that would fail fast after repeated recent failures. At this shop's
  real request volume, the extra latency of one failed attempt is not a
  meaningful operational problem; a circuit breaker would be speculative
  infrastructure for a scale this deployment doesn't have.

## Final Phase 3.6 Part 1 verdict

> Klasiq customers receive real OTPs on WhatsApp through the production
> provider while preserving all security guarantees built in Phase 3.4,
> with environment-based provider selection, secure credential handling,
> replay protection, resend limits, and zero exposure of OTPs or
> secrets.

Demonstrated true, with evidence cited above: a real, correct Meta
WhatsApp Business Cloud API integration exists and was proven, end to
end, against a real local server (not just mocked units); every security
guarantee built in Phase 3.4 Part 1 (hashing, expiry, attempt limits,
replay protection, resend cooldown, rate limiting, customer-enumeration
resistance) is provably unchanged (its own original, unmodified test
suite still passes in full); provider selection is entirely
environment-driven with a hard, non-overridable production invariant
(never silently downgrades to the console stand-in); credentials are
read in exactly one place and never logged, returned, or leaked in any
error path (proven directly); a delivery failure — whether a real
Meta-side error or a missing configuration — never creates a challenge
or a session, and never surfaces internal detail to the customer. Full
test suite passes (550/550, including a from-scratch database run);
fresh-database verification passes (14 migrations, zero drift, no new
migration needed); production build passes; documentation is complete.

Changes across Phase 3.1 through Phase 3.5 (all parts) remain
uncommitted together in the working tree, alongside this phase's
changes, per instruction. Phase 3.6 Part 2 has not been started —
awaiting review.

## Part 2 — Transactional Notifications

Date: 2026-08-08

Adds automatic WhatsApp notifications for five order-lifecycle events
(Order Placed, Confirmed, Preparing, Ready for Pickup, Delivered),
reusing Part 1's Meta Cloud API transport unchanged. OTP and
notifications are two logically separate concerns sharing one transport
— exactly section 2's instruction. Returns/Exchange notifications remain
explicitly out of scope (Part 3).

## Existing implementation audited for Part 2 (before writing any code)

- **`src/server/otp/whatsapp-provider.ts`/`provider.ts`** (Part 1) —
  confirmed the Meta Cloud API request shape (fetch call, retry policy,
  error categorization, logging discipline) lived entirely inside
  `WhatsAppOtpProvider`, with no existing extraction point a second
  caller could reuse — the concrete gap section 2 ("do not create
  another Meta client") asks this part to close.
- **`src/server/commerce/place-order.ts`** (`placeOrderForBasket`) —
  confirmed the exact transaction boundary (a single `db.$transaction`
  wrapping stock decrement, customer resolution, and order creation) and
  the ALREADY-established precedent, right after it, for a best-effort,
  try/catch-wrapped, non-blocking post-commit side effect (the
  WhatsApp-number-sync call) — the exact pattern this phase's "Order
  Placed" notification reuses, not a new one invented for this phase.
- **`src/server/commerce/update-order-status.ts`** — confirmed the
  idempotent (`order.status === newStatus` short-circuits before any
  write) + concurrency-guarded (`updateMany` keyed to the status just
  read) shape, and that it already fetches the full order (including
  `items`) in one query — informing the "reuse this exact guarantee for
  duplicate prevention" decision below.
- **`src/server/commerce/counter-sale.ts`** — re-confirmed (unchanged
  since every prior phase's own audit) that a Counter sale is created
  directly at `DELIVERED`/`PAID` and never subsequently calls
  `updateOrderStatus` at all — informing the Counter-exclusion decision
  below.
- **`Customer`/`Order`** (`prisma/schema.prisma`) — confirmed
  `Order.customerWhatsapp` (Phase 3.3 Part 3) is already a point-in-time
  checkout snapshot, independent of the customer's current, mutable
  `Customer.whatsappPhone` — exactly the field section 12 asks this
  phase to prefer.
- **`src/lib/order-message.ts`** — read `buildOrderConfirmationMessage`,
  a Phase 2 plain-text, itemized order-summary formatter written in
  anticipation of a future WhatsApp integration. **Deliberately not
  reused** — see "Message content" below for why a real Meta
  Authentication/Utility-category template needs a short, fixed set of
  variables, not one large free-text blob, and section 7's own
  requirement for one template per event.
- **`src/lib/site-config.ts`** — confirmed `SITE_URL` is the existing,
  correct base-URL helper (already used for sitemap/robots/metadata) to
  build the tracking link from, never a hard-coded domain.
- **Order Detail pages / `/order/[orderNumber]/[token]`** (Phase 2) —
  re-confirmed this route's `accessToken` is the existing, intentionally
  shareable secure mechanism section 15 asks to reuse — not the
  customer-portal's own session-based `/track` route, which would add
  unnecessary re-verification friction for a notification link.

## Provider architecture — one Meta client, two logically separate consumers

**No second Meta client was created.** The actual HTTP request to Meta's
Cloud API (`POST /{phoneNumberId}/messages`), its retry policy, error
categorization, and logging now live in exactly one place:
`sendWhatsAppTemplateMessage` (`src/server/whatsapp/client.ts`) — a
generic function taking a phone, template name/language, and an ordered
list of body parameters. Both consumers call it:

- **`WhatsAppOtpProvider`** (`src/server/otp/whatsapp-provider.ts`,
  refactored, not rewritten) — now a thin wrapper supplying its own
  template name and the OTP code as a single body parameter.
  **Behavior is unchanged**, proven directly: its own pre-existing test
  suite (7 tests, Part 1) passes unmodified, and the full OTP test suite
  (36 tests across `otp.test.ts`, `provider.test.ts`,
  `whatsapp-provider.test.ts`, `otp-provider-selection.test.ts`) passes
  unmodified.
- **`WhatsAppNotificationService`** (`src/server/whatsapp/notification-service.ts`,
  new) — supplies an order-notification template name and four body
  parameters (customer name, order number, a short status line, the
  tracking link).

**Transport credentials are shared, template choice is not.**
`getWhatsAppTransportConfig()` (`src/server/whatsapp/config.ts`, new) is
the ONE place `WHATSAPP_API_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/
`WHATSAPP_API_VERSION` are read — both `createWhatsAppOtpProviderFromEnv`
(Part 1, refactored to call this) and `notifyOrderEvent` call it. Each
consumer still resolves its OWN template name(s) from its OWN env
var(s) — `WHATSAPP_OTP_TEMPLATE_NAME` vs. five separate
`WHATSAPP_ORDER_*_TEMPLATE_NAME` vars — so credentials are shared while
template choice, and therefore message content, stays logically
separate. **Provider selection is ALSO independently toggleable**:
`getNotificationSender()` mirrors `getOtpProvider()`'s exact environment-
based decision table (production always real, non-production defaults
to a console dev stand-in unless explicitly opted in) but reads its OWN
`NOTIFICATION_PROVIDER` variable, never `OTP_PROVIDER` — enabling real
WhatsApp notification sending in a staging environment can never
accidentally also enable real OTP sending there, or vice versa.

## Message service

`WhatsAppNotificationService`'s one entry point,
`notifyOrderEvent(order, event)`, has exactly one responsibility (section
3): send a transactional notification for an order-lifecycle event.
Nothing about authentication lives anywhere near it — it is a
completely separate module tree from `src/server/otp/`, sharing only
the low-level `sendWhatsAppTemplateMessage` client. It is deliberately
**DB-free** — callers resolve and pass a plain `OrderForNotification`
object (order number, access token, source, fulfillment type, customer
name/mobile/WhatsApp, and an already-resolved school name) — mirroring
this codebase's established "pure business logic, no Prisma types
leaking in" convention (`return-eligibility.ts`, `order-tracking.ts`),
which also makes the entire service trivially unit-testable with a
mocked `fetch` and no database.

## Events (section 4)

Exactly the five events listed, no more:

| Event              | Fires from                                     | `OrderStatus`                 |
| ------------------ | ---------------------------------------------- | ----------------------------- |
| `ORDER_PLACED`     | `placeOrderForBasket`, once, at order creation | n/a — not a status transition |
| `ORDER_CONFIRMED`  | `updateOrderStatus`, on transition INTO        | `CONFIRMED`                   |
| `PREPARING`        | `updateOrderStatus`, on transition INTO        | `PREPARING`                   |
| `READY_FOR_PICKUP` | `updateOrderStatus`, on transition INTO        | `READY_FOR_PICKUP`            |
| `DELIVERED`        | `updateOrderStatus`, on transition INTO        | `DELIVERED`                   |

`STATUS_TRANSITION_EVENT` (`src/server/whatsapp/notification-events.ts`)
is the single mapping table both `update-order-status.ts` and this
report consult — `PENDING`, `OUT_FOR_DELIVERY`, and `CANCELLED` have no
entry and therefore never notify (not in section 4's fixed list;
`CANCELLED` in particular gets no "bad news" message in this phase —
explicitly out of scope, not an oversight). **Never inferred**: the
event fired is always the literal transition TARGET a real, guarded
`updateOrderStatus` call just committed — never guessed from polling,
never fabricated for a status the order didn't actually reach.

## Source — Counter sales (sections 5/13)

**Counter-sourced orders receive NONE of the five notifications in this
phase.** `notifyOrderEvent` checks `order.source === "COUNTER"` first,
before anything else, and returns immediately if so — proven directly,
not just documented (a dedicated test sends all five events against a
Counter order and confirms zero HTTP calls occur). `createCounterSale`
itself has no call to `notifyOrderEvent` at all — there was no reason to
add one, for the reasoning below.

**Reasoning, in full** (section 5's explicit "document the reasoning"):
every one of these five events describes an ANTICIPATORY update for a
customer WAITING for their order to progress — "your order has been
placed [and will be processed]," "confirmed [we're going to make it],"
"preparing," "ready [come get it]," "delivered [it arrived]." A Counter
sale has no such waiting period: it is created already `DELIVERED`+
`PAID` (Phase 3.2), with the customer standing at the register having
already received their goods. Sending "Order Placed" or "Order
Confirmed" to someone who just completed an in-person transaction and
walked out with their purchase would be redundant noise, not useful
information — precisely "do not spam customers unnecessarily." Section
13's own explicit list ("probably should NOT receive: Preparing, Ready,
Delivered") already rules out three of the five for exactly this
reason; extending the identical logic to `ORDER_PLACED`/`ORDER_CONFIRMED`
(neither of which represents a real, separate step a Counter sale ever
passes through either) is the consistent, principled completion of that
same reasoning, not a separate decision. A future phase could introduce
a dedicated "Counter Purchase Receipt" event if a real business need is
demonstrated — that would be a NEW, sixth event type, not a reuse of
any of these five, and is explicitly out of scope here (section 22).

Both directions were manually verified: a real Counter sale created via
`createCounterSale` triggers zero WhatsApp requests (see "Regression"
below), and every ONLINE-sourced test fixture in this phase's test
suite confirms the five events DO fire for `source: "ONLINE"`.

## Message content (section 6)

Every template is called with exactly the same four ordered body
parameters, regardless of event — the DIFFERENTIATION between events is
each one's own distinct, Meta-approved template name and surrounding
copy, not a different parameter shape:

1. Customer name (`order.customerName`, falling back to `"Customer"` if
   somehow absent).
2. Order number (`order.orderNumber` — never the internal `Order.id`,
   confirmed by grep across every new file in this phase).
3. A short, concise status line, built by `buildContextLine` — e.g.
   "Your order for Demo Sunrise Public School has been confirmed."
   School name is folded into this line ONLY when the order actually has
   one (never an awkward empty parameter otherwise); `DELIVERED` is
   fulfillment-aware, saying "collected" for Store Pickup vs.
   "delivered" for Local Delivery — reusing the exact same distinction
   the customer portal's own tracking timeline already makes
   (`src/lib/order-tracking.ts`'s "Collected" label), never a second,
   competing convention for the same fact.
4. The tracking link (see "Tracking link" below).

## Template architecture (section 7)

Five dedicated environment variables, one per event, resolved via
`NOTIFICATION_TEMPLATE_ENV_VAR` (`notification-events.ts`) —
`WHATSAPP_ORDER_PLACED_TEMPLATE_NAME`,
`WHATSAPP_ORDER_CONFIRMED_TEMPLATE_NAME`,
`WHATSAPP_ORDER_PREPARING_TEMPLATE_NAME`,
`WHATSAPP_ORDER_READY_TEMPLATE_NAME`,
`WHATSAPP_ORDER_DELIVERED_TEMPLATE_NAME` — proven distinct and never
equal to `WHATSAPP_OTP_TEMPLATE_NAME` (a dedicated test asserts all five
values are unique and none is the OTP variable). If a specific event's
template isn't configured (e.g. Meta approval is still pending for
one), `notifyOrderEvent` logs a clear skip and returns — it never
crashes commerce and never falls back to a different event's template.

## Delivery policy (section 8) — transaction boundaries audited

- **`placeOrderForBasket`**: `notifyOrderEvent` is called strictly AFTER
  `attemptTransaction()`'s `db.$transaction(...)` has already returned
  successfully — never inside it, never before it. It is also only ever
  reached on the genuinely-fresh-order code path (see "Duplicate
  prevention" below) — every early return for an already-existing order
  happens before this line.
- **`updateOrderStatus`**: `notifyOrderEvent` is called strictly AFTER
  the guarded `updateMany`/`$transaction` status write has already
  succeeded (past the function's own try/catch, right before the final
  `return`) — never inside the transaction, never before the
  concurrency guard has confirmed a real transition occurred.

Both are proven directly, not just by code review: a dedicated test
mocks `notifyOrderEvent` to throw and confirms the order/status change
had already fully committed regardless (see "Failure handling").

## Failure handling (section 9)

`notifyOrderEvent` never throws — every internal failure (Counter
exclusion, no phone, no template, a real Meta API failure, even a
transport-configuration error) is caught and logged inside the function
itself. **Additionally**, both call sites (`place-order.ts`,
`update-order-status.ts`) wrap their own call in a second, redundant
try/catch — defense in depth mirroring the EXACT pattern the codebase
already uses for the adjacent WhatsApp-number-sync best-effort call, so
a hypothetical future bug that broke the service's own "never throws"
guarantee still could not turn a successful commerce operation into a
customer-facing error. Proven directly: dedicated tests mock
`notifyOrderEvent` to reject and confirm both a real checkout and a real
status transition still succeed, with the order's data reflecting the
successful commerce outcome.

## Retries (section 10)

Unchanged from Part 1, now literally the same code both callers share:
exactly one retry, and ONLY for a genuine network-level failure (the
request never reached Meta at all); any real HTTP response, even a 5xx,
is never retried, since Meta having responded means the message may
already be queued or delivered — retrying that would risk a real
duplicate landing on the customer's phone. Proven directly at the shared
client level (`client.test.ts`) with a multi-parameter notification-style
payload (Part 1's own tests only ever exercised OTP's single-parameter
case), and again at the service level (`notification-service.test.ts`).

## Duplicate prevention (section 11)

**The smallest robust solution: reuse each transaction's own existing
idempotency guarantee, add nothing new.**

- **`ORDER_PLACED`**: `placeOrderForBasket` already has three separate
  early-return paths for "this order already exists" (an idempotency-key
  match, an already-`CONVERTED` basket, and a unique-constraint race
  recovery) — all of which return BEFORE the notification call. The
  notification is reached only once, ever, per genuinely new order.
  Proven directly: a duplicate submission with the same idempotency key
  is confirmed to call `notifyOrderEvent` exactly once in total (not
  once per submission).
- **`ORDER_CONFIRMED`/`PREPARING`/`READY_FOR_PICKUP`/`DELIVERED`**:
  `updateOrderStatus`'s existing idempotent short-circuit
  (`order.status === newStatus` returns immediately, before any write)
  means a repeat call to a status the order has already reached never
  reaches the notification line at all. Its existing concurrency guard
  (a guarded `updateMany` keyed to the status just read) means that of
  two truly concurrent calls transitioning the same order to the same
  new status (the "admin double-clicks Confirm" scenario), only ONE can
  ever have `alreadyInState: false` — the other gets `CONFLICT` and
  never reaches the notification line either. Proven directly with a
  genuinely concurrent (`Promise.all`) test: exactly one of two
  simultaneous transition attempts results in exactly one
  `notifyOrderEvent` call, never two.
- **Structural guarantee**: because the six-state order lifecycle
  (`order-lifecycle.ts`) never transitions back INTO an earlier status
  once left (there is no edge back to `CONFIRMED` from any later state),
  a genuine "Order Confirmed" notification can be triggered **at most
  once in an order's entire lifetime**, by construction — not merely
  "unlikely to duplicate," but structurally incapable of it.

No new idempotency key, flag, or "notification sent" column was added —
the existing transaction-level guarantees already provide exactly-once
semantics for free.

## Customer phone selection (section 12)

Explicit, three-step fallback chain, in `notifyOrderEvent` itself:

1. `Order.customerWhatsapp` — the checkout-time WhatsApp snapshot
   (Phase 3.3 Part 3), preferred first.
2. `Order.customerMobile` — the order's own primary contact number, used
   only when step 1 is null.
3. **No notification attempted** if neither is present (a guest Counter
   sale with no phone at all, or the historical, pre-Phase-3.3-Part-3
   edge case) — logged as a skip, never a guess, never a crash.

Deliberately **never** falls back to `Customer.whatsappPhone` (the
customer's CURRENT, mutable profile) — this order's own snapshot fields
are what was true when this specific order happened, consistent with
every other "snapshot, not live profile" decision already made for this
exact field. Both fallback branches are proven directly by dedicated
tests, as is the "neither present" skip case.

## Admin actions (section 14)

No "Send Message" button exists anywhere in the admin UI, and none was
added. `OrderStatusActions` (Phase 3, unchanged by this phase) still has
exactly the same status-transition buttons it always did; the
notification now happens automatically, invisibly, as a direct
consequence of `updateOrderStatus`'s own success — an admin confirming/
preparing/marking-ready/delivering an order never does anything
differently than before this phase, and the customer is notified
without any extra admin action.

## Tracking link (section 15)

Reuses the EXISTING secure per-order confirmation URL
(`/order/[orderNumber]/[token]`, Phase 2) unchanged — never the
customer-portal's own session-based `/track` route (which would add
unnecessary OTP re-verification friction for someone who just wants to
tap a link from a WhatsApp message), and never a new mechanism. The
`accessToken` embedded in this URL is not "exposed unnecessarily"
(section 15) — it IS the intentionally shareable secret this exact URL
was designed around since Phase 2 (see `docs/PHASE_2_REPORT.md` "Order
lookup security"). The raw internal `Order.id` is never included
anywhere in any notification — confirmed by grep across every new file
in this phase.

## Logging (section 16) & Observability (section 17)

The shared client (`client.ts`) logs only `logLabel` and `phoneNormalized`
on success, and `logLabel`/`phoneNormalized`/`httpStatus`/`metaErrorCode`/
`metaErrorType` (or `reason: "network"`) on failure — **never any body
parameter's actual value**, so a customer's name, an order number, or
(for OTP, sharing this same client) the OTP code itself can never appear
in a log line. Proven directly, not just by review: dedicated tests pass
deliberately sensitive-looking parameter values and assert they never
appear in any `console.log`/`console.error` call, for both success and
failure paths. The notification service's own outer catch adds only
`event`/`orderNumber` context (never re-logs the error's own message,
which is already generic) — between the two log lines (client + service),
every operationally useful fact (which event, which order, which phone,
what category of failure) is present without ever including sensitive
content.

## Security review (section 18)

- **Template data**: every value sent is either a plain order-number
  string, a customer's own name (already visible to that same customer
  in their order confirmation), a short server-generated status phrase,
  or the order's own pre-existing secure tracking link — nothing derived
  from another customer's data, nothing internal-only.
- **Links**: the tracking link reuses the exact, already-audited Phase 2
  mechanism; no new token type, no new access-control decision was made
  in this phase.
- **Customer phone selection**: explicit, order-scoped, never a guess,
  never falls back to a different customer's data (grep-confirmed: the
  fallback chain only ever reads fields off the SAME order being
  notified about).
- **Provider credentials**: read in exactly one shared function
  (`getWhatsAppTransportConfig`), never duplicated, never logged.
- **No customer data leakage**: proven directly (see "Logging" above) —
  no log line, success or failure, ever contains a template parameter's
  actual value.

## Testing (section 19)

**586 tests passing** (550 from Phase 3.6 Part 1 + 36 new for this
part):

- `src/server/whatsapp/__tests__/client.test.ts` (new, 6 tests): the
  shared client sends a correct multi-parameter template body; logs
  delivery success with the label/phone but never a parameter value;
  never retries a real HTTP response (even a 5xx) and never leaks the
  raw response body; retries exactly once on a genuine network failure
  then succeeds; gives up after exactly one retry on repeated network
  failures.
- `src/server/whatsapp/__tests__/notification-events.test.ts` (new, 4
  tests): the status→event mapping covers exactly the four transition
  events and excludes `PENDING`/`OUT_FOR_DELIVERY`/`CANCELLED`; all five
  template env var names are distinct and none equals the OTP template
  variable.
- `src/server/whatsapp/__tests__/notification-service.test.ts` (new, 15
  tests): each of the five events sends via its own distinct template
  with the correct context line (Order Placed, Confirmed, Preparing,
  Ready for Pickup with pickup-location wording, Delivered with
  fulfillment-aware "collected" vs. "delivered" wording); school name
  folded into context only when present; the tracking link is built
  from the order's own access token; a Counter-sourced order triggers
  zero sends across all five events; phone selection prefers
  `customerWhatsapp`, falls back to `customerMobile`, and skips (logging
  why) when neither is present; a specific event's missing template
  configuration is skipped gracefully; a real delivery failure and a
  missing-transport-configuration failure are both swallowed without
  rejecting; the retry policy is exercised end-to-end through the
  service; the development default (console stand-in, no real `fetch`
  call) is confirmed outside production.
- `src/server/commerce/__tests__/place-order-notifications.test.ts`
  (new, 3 tests, real Postgres, `notifyOrderEvent` mocked to isolate
  wiring from the service's own internals): a fresh checkout calls
  `notifyOrderEvent` exactly once with `ORDER_PLACED` and the correct
  order data; an idempotency-key replay of an already-placed order does
  NOT notify a second time; the order is NOT rolled back when
  `notifyOrderEvent` rejects.
- `src/server/commerce/__tests__/update-order-status-notifications.test.ts`
  (new, 8 tests, real Postgres, `notifyOrderEvent` mocked): each of
  `CONFIRMED`/`PREPARING`/`READY_FOR_PICKUP`/`DELIVERED` notifies with
  its correct event exactly once; `CANCELLED` triggers no notification
  at all; a repeat call to an already-reached status does not notify
  again; two genuinely concurrent transitions to the same new status
  result in exactly one notification, never two; the order's status
  change is unaffected when `notifyOrderEvent` rejects.

Section 19's full list (Order Placed/Confirmed/Preparing/Ready/Delivered
notifications, no notification before commit, no rollback on send
failure, retry policy, duplicate prevention, Counter behavior, correct
phone selection) is covered by the tests enumerated above, each
traceable to a specific named test, plus the manual verification
script's own real, unmocked-module proof of the same properties (below).

## Regression (section 20)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 586/586 passing, run twice (live dev database, and
  a from-scratch database — see below) with identical results.
- `npm run build` — succeeds; confirms (as in Part 1) that no
  `WHATSAPP_ORDER_*` template env var is read at module-import or build
  time, only lazily inside `notifyOrderEvent` at actual send time.
- **No new migration** — this part touches no schema. Re-verified
  anyway per "protect every previous phase": created
  `shop_fresh_verify_p362`, applied all 14 existing migrations,
  confirmed **zero drift**, ran `prisma/seed.ts` and
  `prisma/create-admin.ts` successfully, ran the full 586-test suite
  against it (100% pass), then dropped the database. The real shared
  dev database's `orders` (8) and `otp_challenges` (0) counts were
  confirmed unchanged before and after.
- Manual verification (no browser-automation tool in this environment,
  same honest disclosure as every prior phase): a real local HTTP server
  stood in for Meta's Graph API while the REAL `placeOrderForBasket` →
  `notifyOrderEvent` → `sendWhatsAppTemplateMessage` chain ran end to end
  with `NODE_ENV=production` genuinely set. Proved: (1) a real checkout
  sent exactly one correctly-shaped `ORDER_PLACED` request (right
  template, right recipient, right order number); (2) a duplicate
  submission with the same idempotency key sent no second request; (3) a
  real `updateOrderStatus` call to `CONFIRMED` sent exactly one
  correctly-templated `ORDER_CONFIRMED` request; (4) a simulated Meta
  failure (HTTP 500) during a `PREPARING` transition left the order's
  status genuinely updated to `PREPARING` regardless — commerce
  unaffected; (5) a real `createCounterSale` call triggered ZERO
  WhatsApp requests. All 5 steps passed; the temporary local server was
  closed and all script-created data was deleted afterward, confirmed
  via direct count against the shared dev database (unchanged
  before/after).
- The long-running dev server was **not** restarted (no schema change in
  this phase; plain TypeScript module changes are picked up by `next
  dev`'s own file-watching/HMR).

## Known limitations (Part 2)

- **Notification sending is awaited synchronously** inside both
  `placeOrderForBasket` and `updateOrderStatus` — a slow or retrying
  WhatsApp send can add up to roughly one extra network round-trip
  (plus, in the worst case, the ~400ms retry delay) to an admin's status-
  change click or a customer's checkout submission, before either
  returns. This is a deliberate simplification (matching this
  codebase's existing precedent of awaiting best-effort side effects
  synchronously, e.g. the WhatsApp-number-sync call) rather than
  introducing a background job queue, which would be speculative
  infrastructure for a shop at this scale. Revisitable if real usage
  ever demonstrates the latency is a genuine problem.
- **No real WhatsApp Business templates have been (or could be, in this
  environment) approved and exercised against** — same disclosed
  limitation as Part 1, now covering five templates instead of one. The
  request shape (four-variable Utility/Marketing-category body) is
  correct and proven structurally, but deploying this requires real,
  Meta-approved templates matching that exact shape.
- **Fixed four-parameter shape for every template** — simpler and more
  testable than a per-event-customized parameter count, but means every
  approved template must be written to accept exactly these four
  variables in this order. A future event with genuinely different
  informational needs would either need to fit this same shape or
  introduce a second parameter-building convention.

## Architecture debt (Part 2)

- **No delivery-status webhook handling** — same as Part 1; this phase
  only handles the synchronous "was the send request itself accepted"
  response.
- **No dashboard/metrics/alerting** — same as Part 1, now covering a
  second message category. Two plain log lines exist per attempt; real
  aggregation/alerting remains deferred until production traffic
  demonstrates a concrete need.
- **Counter Purchase Receipt is a real, deferred idea, not a rejected
  one** — see "Source — Counter sales" above. If a genuine business need
  for a Counter-sale confirmation message appears, it is a new, sixth
  event type with its own template, not a repurposing of any of these
  five.

## Final Phase 3.6 Part 2 verdict

> Klasiq automatically sends production-ready WhatsApp transactional
> notifications for appropriate order lifecycle events without
> affecting commerce reliability, preserving transaction integrity,
> preventing duplicate customer messages, and reusing the existing
> provider architecture.

Demonstrated true, with evidence cited above: exactly one Meta client
exists, shared by OTP and notifications while remaining logically
separate (distinct templates, distinct provider-selection variable,
distinct service); notifications fire only for the five specified
events, only after their authoritative transaction has genuinely
committed, and only for `ONLINE`-sourced orders (Counter sales excluded
by explicit, documented design, proven to trigger zero sends); a
WhatsApp failure of any kind — a real Meta error, a network failure, or
a missing configuration — never affects the underlying commerce
operation (proven with real rejected-mock tests against both call
sites, and again against the unmocked, real service in the manual
verification script); duplicate notifications are structurally
prevented by reusing each transaction's own existing idempotency/
concurrency guarantees, with zero new state introduced; customer phone
selection follows an explicit, order-scoped fallback chain that never
guesses and never leaks another customer's data; no sensitive content
(customer name, order number, OTP code) ever appears in any log line.
Full test suite passes (586/586, including a from-scratch database
run); fresh-database verification passes (14 migrations, zero drift, no
new migration needed); production build passes; documentation is
complete.

Changes across Phase 3.1 through Phase 3.5 (all parts) and Phase 3.6
Part 1 remain uncommitted together in the working tree, alongside this
part's changes, per instruction. Phase 3.6 Part 3 has not been started —
awaiting review.

## Part 3 — Return & Exchange Notifications

Date: 2026-08-08

Extends the notification system built in Part 2 to cover Return and
Exchange lifecycle events, reusing every piece of existing
infrastructure — the same Meta client, the same transport config, the
same sender-selection philosophy — without building a second
notification engine (section 1). Marketing, broadcasts, promotions,
analytics, push, email, and SMS remain explicitly out of scope (section
17).

## Existing implementation audited for Part 3 (before writing any code)

- **`src/lib/return-lifecycle.ts`** — `ReturnRequestStatus` has exactly
  six values (REQUESTED/APPROVED/REJECTED/RECEIVED/COMPLETED/CANCELLED)
  and `RETURN_STATUS_TRANSITIONS` is strictly one-directional with two
  terminal branches. Critically: **nothing ever transitions INTO
  REQUESTED** (it's the creation default, never a transition target) and
  **RECEIVED only ever transitions to COMPLETED**, never anywhere else.
- **`src/server/commerce/return-fulfillment.ts`** (`receiveReturnRequest`)
  — confirmed RECEIVED and COMPLETED are stamped together, in the SAME
  transaction, as one indivisible admin action (Phase 3.5 Part 4's own
  documented design) — there is no window where a request is observably
  RECEIVED-but-not-COMPLETED, and for an EXCHANGE, the replacement
  variant's stock is deducted in that same transaction. This directly
  shaped two of this part's biggest decisions — see "Events" below.
- **`prisma/schema.prisma`** (`ReturnRequest`/`ReturnRequestItem`) —
  confirmed `receivedAt`/`completedAt` are two distinct, genuinely
  persisted timestamp columns (not inferred), confirmed `rejectionReason`
  is already documented as customer-visible (never internal-only, unlike
  `adminNote`), and confirmed there is NO "ready"/"dispatched" field
  anywhere for an exchange — the replacement's issuance is recorded only
  via `completedAt` + `replacementVariantId`.
- **`src/server/commerce/returns.ts`** (`createReturnRequest`) — the one
  shared creation path for BOTH `RETURN` and `EXCHANGE` requests, and for
  BOTH the customer portal and the admin walk-in flow (see below) —
  confirmed the `order` fetched here (a full, unselected `db.order.findFirst`)
  already carries every snapshot field a notification needs
  (`customerName`/`customerMobile`/`customerWhatsapp`/`accessToken`/
  `fulfillmentType`), exactly like Part 2's own audit of `place-order.ts`.
- **`src/server/actions/customer-portal/returns.ts`** and
  **`src/server/actions/admin/returns.ts`** (`createWalkInReturnRequestAction`)
  — confirmed BOTH call the exact same `createReturnRequest` (Phase 3.5
  Part 1/2's own "one shared function serves both" design) — the only
  difference is where `customerId` comes from (verified session vs.
  admin-searched customer). Wiring the notification into
  `createReturnRequest` itself, rather than into either action, is what
  makes section 7 ("do not create a separate workflow") automatic rather
  than something to remember to duplicate.
- **`src/server/commerce/admin-returns.ts`** (`updateReturnRequestStatus`)
  — confirmed `RECEIVED`/`COMPLETED` are explicitly REFUSED as a
  `newStatus` here (redirected to the dedicated receive flow) — so this
  function can only ever reach `APPROVED`/`REJECTED`/`CANCELLED`/
  `REQUESTED` in practice, and `REQUESTED` is unreachable (nothing
  transitions into it). Its existing idempotent (`status === newStatus`
  early-return) + concurrency-guarded (`updateMany` keyed to the status
  read) shape is IDENTICAL to `updateOrderStatus`'s (Part 2) — reused,
  never duplicated.
- **`src/server/commerce/counter-sale.ts`** — re-confirmed (as in Part 2)
  that a Counter sale is created directly at `DELIVERED`/`PAID`. Also
  confirmed a Counter-originated order CAN still be linked to a real
  `Customer` and later have a genuine `ReturnRequest` created against it
  (`returns.test.ts`'s own "Counter purchase support" tests already
  proved this before this phase) — this directly informed the "Source"
  decision below, a deliberate DIVERGENCE from Part 2.
- **`src/lib/exchange-price.ts`** and its own schema doc comment — priced
  difference (CUSTOMER_PAYS/REFUND_DUE/EQUAL_VALUE) display is
  documented as admin-only in this phase (Phase 3.5 Part 5's own
  decision), and no payment processing exists anywhere near it —
  confirmed this must stay OUT of any customer-facing message here too
  (no amounts, no payment language).
- **`src/app/(site)/order/[orderNumber]/[token]/page.tsx`** — confirmed
  (as expected) this page shows ORDER details only, no return/exchange
  status — there is no dedicated, shareable, secure return-tracking URL
  anywhere in the codebase; only the OTP-gated customer portal shows
  return status. This directly shaped the "Tracking link" decision below.

## Events — 7 implemented, not 8 (section 2 audit finding)

The brief lists eight named events (Return Requested, Return Approved,
Return Rejected, Item Received, Return Completed, Exchange Approved,
Exchange Ready, Exchange Completed). Section 2 also says: **"Only
implement events that genuinely exist in the current lifecycle. Do not
invent new business states."** Auditing the actual `ReturnRequestStatus`
enum and `receiveReturnRequest`'s own transaction against that list
surfaces a real conflict this report resolves explicitly rather than
silently picking one side:

| # | Brief's named event | Implemented as                                                    | Why                                                                 |
| - | ------------------- | ----------------------------------------------------------------- | ------------------------------------------------------------------- |
| 1 | Return Requested    | `RETURN_REQUESTED` (fires for BOTH `RETURN` and `EXCHANGE` types) | `REQUESTED` is a single, type-agnostic creation default — see below |
| 2 | Return Approved     | `RETURN_APPROVED`                                                 | `APPROVED` split by `ReturnRequest.type`                            |
| 3 | Exchange Approved   | `EXCHANGE_APPROVED`                                               | same transition, distinct template                                  |
| 4 | Return Rejected     | `RETURN_REJECTED` (fires for BOTH types)                          | `REJECTED` has no type-specific business meaning — see below        |
| 5 | Item Received       | `ITEM_RECEIVED` (fires for BOTH types)                            | genuinely, separately stamped `receivedAt`                          |
| 6 | Return Completed    | `RETURN_COMPLETED`                                                | `COMPLETED` split by `type`                                         |
| 7 | Exchange Ready      | **not implemented as a separate event**                           | no such state exists — folded into #8, below                        |
| 8 | Exchange Completed  | `EXCHANGE_COMPLETED` (fulfillment-aware wording)                  | carries "Exchange Ready"'s meaning via content, not a new state     |

**Why "Return Requested" and "Return Rejected" cover both types.** The
brief names exactly one "Requested" event and one "Rejected" event (not
a Return/Exchange pair, unlike Approved/Completed) — matching the fact
that `REQUESTED` and `REJECTED` are genuinely the SAME transition for
either type, with no type-specific business meaning attached (a rejected
exchange isn't handled any differently than a rejected return — no
inventory, no replacement selection, nothing type-dependent happens on
rejection). `RETURN_REQUESTED`'s and `RETURN_REJECTED`'s CONTENT is still
type-aware (`buildReturnContextLine` says "return request"/"exchange
request" using `ReturnRequest.type`, and for a REQUESTED exchange this
means the customer is correctly told "exchange," never
mislabeled "return") — only the EVENT KEY and TEMPLATE are shared, never
the wording.

**Why "Exchange Ready" is not a separate event.** `receiveReturnRequest`
stamps `RECEIVED` and `COMPLETED` — plus, for an EXCHANGE, the
replacement variant's stock deduction — all in ONE transaction, one
admin action (Phase 3.5 Part 4's own documented, deliberate design: "one
indivisible admin action"). There is no database state, no timestamp
column, no observable moment where an exchange is "ready" but not yet
"completed" — by the time `COMPLETED` is ever set, the replacement item
has ALREADY been issued (inventory deducted) in the exact same
transaction. Inventing an `EXCHANGE_READY` event would mean firing a
notification for a state that no query could ever actually observe —
precisely what section 2 forbids. Instead, `EXCHANGE_COMPLETED`'s own
content is fulfillment-aware (`buildReturnContextLine`, matching Part
2's established `DELIVERED`-wording precedent): Store Pickup/Counter
Handover gets "ready for collection at {store}" wording — literally
satisfying what "Exchange Ready" was asking for — while Local Delivery
gets a plain "has been completed," since this system has no separate
"exchange dispatched" tracking and must never claim more than it
actually knows.

**Why "Item Received" IS implemented as its own event, despite the same
atomicity concern.** Unlike "Exchange Ready," `RECEIVED` is a REAL,
pre-existing state in `ReturnRequestStatus` (used throughout
`return-lifecycle.ts`, the schema, and the admin/customer-portal UI
already), and `receivedAt`/`completedAt` are two distinct, genuinely
persisted columns — not a state that had to be invented for this report.
"We have your item back" (reassurance) and "here's what happens next"
(refund done / exchange ready) are meaningfully different information to
a customer, even though this codebase's admin flow bundles the two
admin-facing steps into one click for inventory-atomicity reasons (Part
4's own reasoning is about NOT letting RECEIVED sit unreconciled — it
says nothing about the customer-facing narrative needing to collapse
into one message too). Both are fired from the same
`receiveReturnRequest` call, independently try/caught (see "Failure
handling" below), never inferred.

`CANCELLED` has no mapped event — not in section 2's fixed list,
mirroring Part 2's identical exclusion of `OrderStatus.CANCELLED`.

## Source — Counter-linked orders are NOT excluded (a deliberate divergence from Part 2)

Part 2 excludes every one of its five order-lifecycle notifications for
`Order.source === "COUNTER"`, reasoning that a counter sale has no
anticipatory "waiting" period — it's created already `DELIVERED`, with
the customer standing at the register having already received their
goods.

**That reasoning does not transfer to returns/exchanges, and Part 3
does not apply it.** A return or exchange — regardless of whether the
ORIGINAL purchase happened online or at the counter — always has a
genuine, multi-day waiting process: a customer submits a request, staff
reviews and approves or rejects it (often days later), the customer
sends or brings the item back, staff receives and completes it. The
customer is waiting on updates throughout this process no matter how
they originally bought the item. Section 7's own instruction — "Admin
processing a walk-in return should still trigger the same customer
notifications where appropriate. Do not create a separate workflow." —
directly confirms this: it would be self-defeating to build a
notification system for walk-in returns and then silently suppress it
by source. `ReturnRequestForNotification` (return-notification-service.ts)
deliberately has NO `source`/`OrderSource` field at all — not merely an
unused check, but structurally absent, so a future call site cannot even
attempt to exclude by source without first adding the field back and
consciously deciding to.

Proven directly: a dedicated test (`returns-notifications.test.ts`)
creates a return request against a Counter-linked order and confirms
`notifyReturnEvent` IS called, and the manual verification script's
scenario 4 confirms a real end-to-end request against a Counter-linked
order sends a real notification.

## Walk-in returns (section 7)

There is no separate walk-in notification workflow anywhere in this
phase's code — this is not a promise, it's a structural consequence: the
notification calls in `returns.ts`/`admin-returns.ts`/
`return-fulfillment.ts` are wired into the three shared domain functions
(`createReturnRequest`, `updateReturnRequestStatus`, `receiveReturnRequest`)
that `createWalkInReturnRequestAction` (admin walk-in) and
`createReturnRequestAction`/`updateReturnRequestStatusAction`/
`receiveReturnRequestAction` (customer portal / admin UI) ALL call
identically — Phase 3.5's own "one shared function serves both" design
(Part 1/2) already made this the only possible outcome once notifications
were wired at the commerce layer rather than into any individual Server
Action. There was no walk-in-specific branch to write, and none exists.

## Customer experience / message content (section 4/6)

Every return/exchange template is called with the same five ordered
body parameters — one more than Part 2's four-parameter order
convention, a deliberate, documented divergence (not an inconsistency):
section 4 explicitly asks for a Return Number IN ADDITION TO an Order
Number, which an order notification never needed.

1. Customer name (`request.customerName`, falling back to `"Customer"`).
2. Return Number (`request.returnNumber`) — never the internal
   `ReturnRequest.id`.
3. Order Number (`request.orderNumber`) — never the internal `Order.id`.
4. A short status + next-action line (`buildReturnContextLine`) — e.g.
   "Your return has been approved. Please send or bring the item back to
   us." (current status AND next expected action, combined, per section
   4).
5. The tracking link (see below).

Deliberately does NOT fold in a school name (contrast Part 2's order
notifications) — section 4's required fields are status, Return Number,
Order Number, next action, and (where appropriate) the tracking link; a
school name isn't among them, and a return/exchange's own identity is
already anchored by its Return Number, so adding one would be scope
creep beyond "concise."

## Return Rejected (section 5)

`rejectionReason` is included directly and unconditionally whenever
present — never conditionally suppressed — because
`ReturnRequestItem`'s own schema doc comment ALREADY establishes it as
customer-visible ("Customer-visible... never an internal-only field"),
identical to how it's already always rendered in
`return-history.tsx`. When absent (never actually possible given
`updateReturnRequestStatus`'s own validation requires a non-empty reason
to reject — this is defensive, not reachable in practice), a generic
"could not be approved at this time" message is used instead of a blank
or awkward sentence. `adminNote` — the genuinely internal-only field —
is never read by `return-notification-service.ts` at all; grep-confirmed
across every new file in this phase.

## Exchange (section 6)

Exchange approval uses its own distinct template (`EXCHANGE_APPROVED`,
never `RETURN_APPROVED`) so its copy can say what actually happens next
for an exchange specifically. Exchange completion
(`EXCHANGE_COMPLETED`) is fulfillment-aware, telling the customer their
replacement is ready for collection (Store Pickup/Counter Handover) or
that the exchange has been completed (Local Delivery) — see "Events"
above for why this is the ONLY exchange-specific completion state that
genuinely exists. No price-difference amount (CUSTOMER_PAYS/REFUND_DUE)
is ever mentioned — that stays admin-only, per Phase 3.5 Part 5's own
established decision, and no payment processing exists anywhere near
this feature.

## Duplicate prevention (section 8) — reusing Part 2's exact guarantees

**The smallest robust solution, again: reuse each function's own
existing idempotency/concurrency guarantee, add nothing new.**

- **`RETURN_REQUESTED`**: fires only past `db.$transaction` inside
  `createReturnRequest`, on the genuine creation success path — every
  validation failure returns earlier, and a concurrency loser throws
  `ConcurrencyConflictError` and is caught without ever reaching the
  notification call. `created.returnNumber` is a real, newly-persisted
  row exactly once per call that reaches this far.
- **`RETURN_APPROVED`/`EXCHANGE_APPROVED`/`RETURN_REJECTED`**:
  `updateReturnRequestStatus`'s existing idempotent
  (`request.status === newStatus` early-return) + concurrency-guarded
  (`updateMany` keyed to the status just read) shape — IDENTICAL to
  `updateOrderStatus`'s own guarantee (Part 2) — means a repeat call to
  an already-reached status, or the losing side of two concurrent
  transitions, never reaches the notification line. Proven directly with
  both a repeat-call test and a genuinely concurrent (`Promise.all`)
  test.
- **`ITEM_RECEIVED`/`RETURN_COMPLETED`/`EXCHANGE_COMPLETED`**:
  `receiveReturnRequest`'s existing guard
  (`isValidReturnStatusTransition({from: request.status, to: "RECEIVED"})`
  — false once already RECEIVED/COMPLETED) plus its own transactional
  concurrency check (`claimed.count === 0` throws) mean a duplicate or
  losing-concurrent receive attempt never reaches either notification
  call. Proven directly: a second (rejected) receive attempt and a
  genuinely concurrent double-receive both result in exactly 2 total
  notification calls (one ITEM_RECEIVED + one completion event), never 4.
- **Structural guarantee**: `return-lifecycle.ts`'s transition table
  never re-enters `APPROVED` or `COMPLETED` once left (both are either
  terminal or one-way), so a genuine `RETURN_APPROVED`/`EXCHANGE_APPROVED`/
  completion notification can fire **at most once in a request's entire
  lifetime**, by construction.

No new idempotency key, flag, or "notification sent" column was added.

## Failure handling (section 9, Part 3)

`notifyReturnEvent` never throws (identical internal try/catch shape to
Part 2's `notifyOrderEvent`), and every call site ALSO wraps its own
call in a try/catch — same defense-in-depth precedent. `receiveReturnRequest`
is the one place with TWO sequential notification calls
(`ITEM_RECEIVED` then the completion event); each is independently
try/caught, so a hypothetical failure in the first can never prevent the
second from being attempted, and neither can ever affect the already-
committed inventory reconciliation or status write. Proven directly: a
dedicated test rejects the FIRST call only and confirms the SECOND is
still attempted; another rejects BOTH calls and confirms the DB state
(status COMPLETED, stock restored) is unaffected either way; the manual
verification script's scenario 5 simulates a real HTTP 500 during a live
`APPROVED` transition and confirms the transition still commits.

## Retries (section 10 shares Part 1/2's philosophy) & Phone selection (section 10)

Retries are unchanged — literally the same shared client
(`sendWhatsAppTemplateMessage`) both Part 2 and Part 3 call: exactly one
retry, only for a genuine network-level failure, never for any received
HTTP response. Phone selection reuses Part 2's EXACT fallback chain, no
new rules: `Order.customerWhatsapp` (checkout-time snapshot) preferred,
`Order.customerMobile` as fallback, skip (logged, never a crash) if
neither is present. Never `Customer.whatsappPhone` (the customer's
current, mutable profile). Both reused verbatim from the ORDER the
`ReturnRequest` belongs to — a return/exchange has no phone data of its
own, and none was invented.

## Template architecture (section 11)

Seven dedicated environment variables, one per implemented event, never
overlapping an OTP or Order-notification template name (proven directly
— a dedicated test asserts all 7 return/exchange template env vars are
distinct from each other AND from every Part 2 order-notification
variable and the OTP variable):

| Event                | Env var                                       |
| -------------------- | --------------------------------------------- |
| `RETURN_REQUESTED`   | `WHATSAPP_RETURN_REQUESTED_TEMPLATE_NAME`     |
| `RETURN_APPROVED`    | `WHATSAPP_RETURN_APPROVED_TEMPLATE_NAME`      |
| `EXCHANGE_APPROVED`  | `WHATSAPP_EXCHANGE_APPROVED_TEMPLATE_NAME`    |
| `RETURN_REJECTED`    | `WHATSAPP_RETURN_REJECTED_TEMPLATE_NAME`      |
| `ITEM_RECEIVED`      | `WHATSAPP_RETURN_ITEM_RECEIVED_TEMPLATE_NAME` |
| `RETURN_COMPLETED`   | `WHATSAPP_RETURN_COMPLETED_TEMPLATE_NAME`     |
| `EXCHANGE_COMPLETED` | `WHATSAPP_EXCHANGE_COMPLETED_TEMPLATE_NAME`   |

If a specific event's template isn't configured, `notifyReturnEvent`
logs a clear skip and returns — never a crash, never a fallback to a
different event's template, identical to Part 2's own behavior.

## Provider architecture — reusing Part 2's sender selection, not a second engine (section 1)

`src/server/whatsapp/notification-sender.ts` (NEW this phase) —
`NotificationSender`, `ConsoleNotificationSender`, `RealNotificationSender`,
and `getNotificationSender()` were EXTRACTED out of
`notification-service.ts` (Part 2) into this shared module, purely so
BOTH `notifyOrderEvent` (Part 2) and `notifyReturnEvent` (Part 3) call
the exact same sender-selection function — proven as a pure,
zero-behavior-change extraction: every one of Part 2's own
`notification-service.test.ts` assertions still passes unmodified after
the refactor. This is the concrete meaning of "reuse the existing
notification infrastructure, do NOT create a second notification
engine" (section 1): one Meta client (`client.ts`, Part 2, untouched),
one transport config resolver (`config.ts`, Part 2, untouched), one
sender-selection function (`notification-sender.ts`, newly extracted but
behaviorally identical), and the SAME `NOTIFICATION_PROVIDER` environment
variable — deliberately NOT a third, `RETURN_NOTIFICATION_PROVIDER`
toggle. Enabling real WhatsApp sending for order notifications and
enabling it for return/exchange notifications are the same switch,
correctly, since both are "customer notifications," distinct only from
OTP (`OTP_PROVIDER`, its own, still-independent toggle, unchanged).

`return-notification-service.ts` and `return-notification-events.ts`
are new, dedicated modules — logically separate from
`notification-service.ts`/`notification-events.ts` (Part 2), mirroring
exactly how Part 2 kept OTP and Order notifications separate while
sharing transport. A `ReturnRequestForNotification` is a different shape
than an `OrderForNotification` (adds `returnNumber`/`returnType`/
`rejectionReason`, omits `source`/`schoolName`) — reusing the SAME type
for both would have forced awkward optional fields onto one domain or
the other.

## Logging (section 12) & Security review (section 13)

Identical logging discipline to Part 2: the shared client logs only
`logLabel`/`phoneNormalized` on success and categorized failure
metadata (`httpStatus`/`metaErrorCode`/`metaErrorType`, or
`reason: "network"`) on failure — never a body parameter's actual value.
`notifyReturnEvent`'s own outer catch adds only `event`/`returnNumber`
context, never the rejection reason or any other message content —
proven directly: a dedicated test passes a deliberately sensitive-looking
rejection reason and asserts it never appears in any `console.error`
call. `adminNote` (the genuinely internal-only field) is never read by
this service at all. Recipient/phone selection is scoped entirely to
the SAME order the `ReturnRequest` belongs to (grep-confirmed — no
cross-customer data path exists). The tracking link reuses the
already-audited Phase 2 secure mechanism unchanged; no new token type or
access-control decision was introduced. No customer data leakage in
either the success or failure path — proven directly, mirroring Part
2's own verification.

## Tracking link (section 4/15) — no new secure mechanism introduced

There is no dedicated, shareable, secure return-status URL anywhere in
this codebase — the only place return/exchange status is visible is the
OTP-gated customer portal (`/track`), which requires a fresh session,
not a bare link. Building one would mean a new unguessable token column
on `ReturnRequest`, a new public route, and a new access-control
surface — real, out-of-scope infrastructure for a notification feature
that's supposed to "reuse the existing... mechanism." Instead,
`notifyReturnEvent` reuses the EXACT SAME `/order/{orderNumber}/{accessToken}`
link Part 2 already established, pointing the customer back to their
order. This is a smaller, more honest scope decision than inventing a
return-specific secure link would have been, and is why section 4's
"where appropriate" qualifier on the tracking link is read as "reuse
what already exists, don't build something new to satisfy this line."

## Testing (section 14, Part 3)

**633 tests passing** (586 from Phase 3.6 Parts 1–2 + 47 new for this
part):

- `src/server/whatsapp/__tests__/return-notification-events.test.ts`
  (new, 7 tests): the status+type → event mapping covers exactly
  APPROVED/COMPLETED split by type, with no entry for
  REQUESTED/REJECTED/RECEIVED/CANCELLED; all 7 template env var names
  are distinct from each other and from every Part 2/OTP variable; no
  `EXCHANGE_READY` entry exists.
- `src/server/whatsapp/__tests__/return-notification-service.test.ts`
  (new, 20 tests): all 7 events send via their own correct
  template with the correct context (type-aware "return"/"exchange"
  wording for REQUESTED, rejection-reason inclusion and its generic
  fallback for REJECTED, fulfillment-aware "ready for collection"/
  "completed" wording for EXCHANGE_COMPLETED); Return Number and Order
  Number are passed as two distinct parameters; the tracking link is
  built from the order's own access token; the rejection reason never
  appears in any log line; phone selection prefers `customerWhatsapp`,
  falls back to `customerMobile`, and skips (logging why) when neither
  is present; a missing template configuration is skipped gracefully; a
  real delivery failure and a missing-transport-configuration failure
  are both swallowed without rejecting; the retry policy is exercised
  end to end; the development console default is confirmed outside
  production, and confirmed to share the SAME `NOTIFICATION_PROVIDER`
  toggle as order notifications.
- `src/server/commerce/__tests__/returns-notifications.test.ts` (new, 6
  tests, real Postgres, `notifyReturnEvent` mocked): `RETURN_REQUESTED`
  fires exactly once with correct data for a genuine creation; fires for
  an EXCHANGE request too, with the correct `returnType`; fires for a
  Counter-linked order (no source exclusion); does NOT fire when
  creation fails validation; does not roll back the created request when
  the notification rejects.
- `src/server/commerce/__tests__/admin-returns-notifications.test.ts`
  (new, 8 tests, real Postgres, `notifyReturnEvent` mocked): RETURN-type
  approval fires `RETURN_APPROVED`; EXCHANGE-type approval fires the
  distinct `EXCHANGE_APPROVED`; rejection fires `RETURN_REJECTED` with
  the reason passed through, for both types; `CANCELLED` never
  notifies; a repeat call to an already-approved status does not
  notify again; a genuine concurrent double-approval results in exactly
  one notification; the request's own status change is unaffected when
  the notification rejects.
- `src/server/commerce/__tests__/return-fulfillment-notifications.test.ts`
  (new, 8 tests, real Postgres, `notifyReturnEvent` mocked): a RETURN
  receive fires `ITEM_RECEIVED` then `RETURN_COMPLETED`, in that order,
  exactly once each; an EXCHANGE receive fires `ITEM_RECEIVED` then
  `EXCHANGE_COMPLETED`; a duplicate (rejected) receive attempt and a
  genuinely concurrent double-receive both result in exactly 2 total
  calls, never 4; inventory reconciliation and status completion succeed
  even when both notification calls reject; a failure in the FIRST call
  does not prevent the SECOND from being attempted; the order's
  `fulfillmentType` is correctly passed through for
  `EXCHANGE_COMPLETED`'s fulfillment-aware wording.

Section 14's full list (Requested/Approved/Rejected/Received/Completed/
Exchange Ready/Exchange Completed, failure handling, retry, duplicate
prevention, walk-in parity, correct phone selection) is covered above —
"Exchange Ready" specifically by `EXCHANGE_COMPLETED`'s own
fulfillment-aware test and the manual verification script's scenario 2c
(below), per "Events"' documented resolution — plus the manual
verification script's own real, unmocked-module proof of the same
properties.

## Regression (section 15, Part 3)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 633/633 passing, run twice (live dev database, and
  a from-scratch database — see below) with identical results.
- `npm run build` — succeeds; confirms no `WHATSAPP_RETURN_*` or
  `WHATSAPP_EXCHANGE_*` template env var is read at module-import or
  build time, only lazily inside `notifyReturnEvent` at actual send
  time, exactly like every other WhatsApp env var in this codebase.
- **No new migration** — this part touches no schema (no new field, no
  new enum value). Re-verified per "protect every previous phase":
  created `shop_fresh_verify_p363`, applied all 14 existing migrations,
  confirmed **zero drift** (`prisma migrate diff --exit-code`), ran
  `prisma/seed.ts` and `prisma/create-admin.ts` successfully, ran the
  full 633-test suite against it (100% pass), then dropped the database.
  The real shared dev database's `orders` (8), `return_requests` (0),
  and `customers` (5) counts were confirmed unchanged before and after.
- Manual verification (no browser-automation tool in this environment):
  a real local HTTP server stood in for Meta's Graph API while the REAL
  `createReturnRequest`/`updateReturnRequestStatus`/`receiveReturnRequest`
  → `notifyReturnEvent` → `sendWhatsAppTemplateMessage` chain ran end to
  end with `NODE_ENV=production` genuinely set. Proved: (1) a real RETURN
  request → approve → receive fired `RETURN_REQUESTED` →
  `RETURN_APPROVED` → `ITEM_RECEIVED` → `RETURN_COMPLETED`, each exactly
  once, in order, with the correct template; (2) a real EXCHANGE request
  → approve → receive (with a real replacement variant) fired the
  EXCHANGE-specific templates, and the completion message correctly said
  "ready for collection at Milan Readymade & General Store" for a Store
  Pickup order; (3) a real rejection included the exact rejection reason
  text in the outgoing message; (4) a real return request against a
  Counter-linked order still sent a notification (no source exclusion);
  (5) a simulated Meta HTTP 500 during a live `APPROVED` transition left
  the request genuinely `APPROVED` in the database regardless — commerce
  unaffected. All 5 scenarios passed; the script and its temporary local
  server were closed and all script-created data was deleted afterward,
  confirmed via direct count against the shared dev database (unchanged
  before/after: 8 orders, 0 return requests, 5 customers).
- The long-running dev server was **not** restarted (no schema change;
  plain TypeScript module changes are picked up by `next dev`'s own
  file-watching/HMR).

## Known limitations (Part 3)

- **"Exchange Ready" has no dedicated template** — by design (see
  "Events" above), not an oversight: this system's admin flow issues the
  replacement item atomically with completion, so there is no genuine
  intermediate state to notify about. If a future phase introduces a
  real gap between "received back" and "replacement ready" (e.g. an
  exchange that requires ordering a replacement from elsewhere), THAT
  would be the point to introduce a true `EXCHANGE_READY` event backed
  by its own database state — not before.
- **`ITEM_RECEIVED` and the completion event are sent as two separate
  WhatsApp messages within the same admin action** — a deliberate
  choice (see "Events" above) to preserve two genuinely distinct pieces
  of customer-facing information, but it does mean a customer receives
  two messages in quick succession for what is, internally, one admin
  click. Revisitable if real usage ever shows this reads as redundant
  rather than informative.
- **No idempotency-key protection against a double-submitted
  `createReturnRequest` call** — this is a PRE-EXISTING property of
  Phase 3.5's own creation function (unlike checkout, `createReturnRequest`
  has no `idempotencyKey` parameter at all), not something Part 3
  introduces or is responsible for fixing. If a customer's double-click
  ever created two genuinely distinct `ReturnRequest` rows (each
  claiming available quantity), each would correctly receive its own,
  correctly-numbered `RETURN_REQUESTED` notification — accurate
  per-row behavior, not a duplicate-notification bug, but worth noting
  as a boundary of what this phase's duplicate-prevention claim covers
  (it prevents duplicate notifications for the SAME row, not duplicate
  rows).
- **Notification sending is awaited synchronously**, same disclosed
  limitation as Part 2, now with `receiveReturnRequest` awaiting TWO
  sequential attempts in the worst case.
- **No real WhatsApp Business templates approved or exercised against**
  — same disclosed limitation as Parts 1–2, now covering seven more
  templates.

## Architecture debt (Part 3)

- **No delivery-status webhook handling** — same as Parts 1–2.
- **No dashboard/metrics/alerting** — same as Parts 1–2, now covering a
  third message category (OTP, Order, Return/Exchange) through the same
  two plain log lines per attempt.

## Final Phase 3.6 Part 3 verdict

> Klasiq automatically sends production-ready WhatsApp notifications for
> Return and Exchange lifecycle events, reusing the existing
> notification architecture, preserving transaction integrity,
> preventing duplicate messages, supporting both online and walk-in
> returns, and never allowing messaging failures to affect commerce
> operations.

Demonstrated true, with evidence cited above: no second notification
engine was built — the same Meta client, transport config, and
sender-selection function (newly extracted into `notification-sender.ts`
but behaviorally unchanged) are shared with Part 2's order notifications,
distinguished only by their own dedicated templates and the same
`NOTIFICATION_PROVIDER` toggle; seven genuinely-existing lifecycle
events are covered, with "Exchange Ready" deliberately folded into
`EXCHANGE_COMPLETED`'s fulfillment-aware content rather than a fabricated
eighth state; every notification fires only after its authoritative
transaction has genuinely committed (proven with real rejected-mock
tests at every call site, and again against the unmocked, real service
in the manual verification script); Counter-linked orders are
deliberately NOT excluded (a documented divergence from Part 2, since
returns always have a genuine waiting period regardless of original
purchase source) and walk-in returns automatically receive identical
notifications with zero separate workflow code, since both paths share
the same underlying domain functions; duplicate notifications are
structurally prevented by reusing each function's own existing
idempotency/concurrency guarantees, with zero new state introduced; a
WhatsApp failure — real, network, or configuration — never affects the
underlying return/exchange/inventory operation, proven at every call
site including the two-sequential-notification case in
`receiveReturnRequest`; no sensitive content (rejection reasons, admin
notes) ever appears in any log line. Full test suite passes (633/633,
including a from-scratch database run); fresh-database verification
passes (14 migrations, zero drift, no new migration needed); production
build passes; documentation is complete.

Changes across Phase 3.1 through Phase 3.5 (all parts) and Phase 3.6
Parts 1–2 remain uncommitted together in the working tree, alongside
this part's changes, per instruction. Phase 3.6 Part 4 has not been
started — awaiting review.

## Part 4 — Production Acceptance

Date: 2026-08-08

This is the FINAL part of Phase 3.6. No new notification events, no new
templates, and no new domain logic were introduced this part — Parts
1–3 already built a complete WhatsApp platform (OTP, Order, Return,
Exchange). Part 4's job was to audit that platform end to end as a
single system, harden anything genuinely found wanting, and produce the
authoritative reference documentation. Two real gaps were found (both
test-coverage gaps, detailed below); both were closed. No production
code logic changed — only tests and documentation/configuration
comments.

## End-to-end journey audit (section 2)

Walked the exact journey in the brief, against the CURRENT code (not
assumptions), confirming every implemented lifecycle event is covered
exactly once and every intentional non-event is documented:

| Journey step                   | What happens                                                       | Notification?                                                                                                                                                                                                       |
| ------------------------------ | ------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Track Orders → Phone           | Customer submits mobile number (`requestOtpAction` → `requestOtp`) | **Yes** — WhatsApp OTP code (Authentication template, 1 body var)                                                                                                                                                   |
| WhatsApp OTP → Customer Portal | `verifyOtpAction` → `verifyOtp` → `createCustomerSession`          | No — authentication succeeding is reflected in the UI itself; there is no "you logged in" WhatsApp message, which would be redundant with the customer's own action and is not requested anywhere in Phases 3.4–3.6 |
| Order Placed                   | `placeOrderForBasket`, post-commit                                 | **Yes** — `ORDER_PLACED`                                                                                                                                                                                            |
| Order Confirmed                | `updateOrderStatus` → `CONFIRMED`                                  | **Yes** — `ORDER_CONFIRMED`                                                                                                                                                                                         |
| Preparing                      | `updateOrderStatus` → `PREPARING`                                  | **Yes** — `PREPARING`                                                                                                                                                                                               |
| Ready                          | `updateOrderStatus` → `READY_FOR_PICKUP`                           | **Yes** — `READY_FOR_PICKUP`                                                                                                                                                                                        |
| Delivered                      | `updateOrderStatus` → `DELIVERED`                                  | **Yes** — `DELIVERED`                                                                                                                                                                                               |
| Return Requested               | `createReturnRequest`, post-commit (portal or admin walk-in)       | **Yes** — `RETURN_REQUESTED`                                                                                                                                                                                        |
| Approved                       | `updateReturnRequestStatus` → `APPROVED`                           | **Yes** — `RETURN_APPROVED` (type RETURN) or `EXCHANGE_APPROVED` (type EXCHANGE)                                                                                                                                    |
| Rejected                       | `updateReturnRequestStatus` → `REJECTED`                           | **Yes** — `RETURN_REJECTED` (both types)                                                                                                                                                                            |
| Completed                      | `receiveReturnRequest`, post-transaction                           | **Yes** — `ITEM_RECEIVED` then `RETURN_COMPLETED` (type RETURN)                                                                                                                                                     |
| Exchange Completed             | `receiveReturnRequest`, post-transaction                           | **Yes** — `ITEM_RECEIVED` then `EXCHANGE_COMPLETED` (type EXCHANGE)                                                                                                                                                 |

**Events the brief's own journey diagram omits, that this audit
confirms are still correctly handled:**

- **`ITEM_RECEIVED`** fires in addition to what the diagram shows on the
  "Completed"/"Exchange Completed" steps — `receiveReturnRequest` stamps
  RECEIVED and COMPLETED atomically, and both are genuinely,
  independently persisted facts (see Part 3's own "Events" audit). Not a
  gap; a deliberate, previously-documented addition the simplified
  diagram doesn't depict.
- **`OrderStatus.PENDING`** — never a transition target (it's the
  creation default only), so `STATUS_TRANSITION_EVENT` has no entry and
  none is needed.
- **`OrderStatus.OUT_FOR_DELIVERY`** and **`OrderStatus.CANCELLED`** —
  intentionally unmapped since Part 2 (not in that phase's fixed event
  list); re-confirmed still correct and still deliberate, not an
  oversight carried forward silently.
- **`ReturnRequestStatus.CANCELLED`** — intentionally unmapped since
  Part 3, for the identical reason.
- **Payment status changes** (`updatePaymentStatus`) — never notify;
  confirmed by grep that `notifyOrderEvent`/`notifyReturnEvent` are
  called from exactly 4 commerce functions total
  (`placeOrderForBasket`, `updateOrderStatus`, `createReturnRequest`,
  `updateReturnRequestStatus`, `receiveReturnRequest` — five, not four;
  `updatePaymentStatus` is NOT among them), and no Server Action or API
  route imports either function directly (grep-confirmed) — there is no
  path by which a notification could fire outside these five audited
  call sites.

No invented events. No missing coverage.

## Architecture (recap — nothing new built this part)

The platform is exactly what Parts 1–3 built, now audited as one
system:

- **One Meta client** (`src/server/whatsapp/client.ts`) — every send, of
  every kind, goes through `sendWhatsAppTemplateMessage`.
- **One credential resolver** (`src/server/whatsapp/config.ts`) —
  `getWhatsAppTransportConfig()` is the only place
  `WHATSAPP_API_TOKEN`/`WHATSAPP_PHONE_NUMBER_ID`/`WHATSAPP_API_VERSION`
  are read.
- **One sender-selection function** (`src/server/whatsapp/notification-sender.ts`,
  extracted in Part 3) — shared by both notification services, governed
  by the single `NOTIFICATION_PROVIDER` variable.
- **Three logically separate domains**, each with its own template
  namespace and (for OTP) its own provider-selection variable:
  `src/server/otp/` (OTP, `OTP_PROVIDER`), `notification-service.ts`
  (Order events), `return-notification-service.ts` (Return/Exchange
  events) — the latter two share `NOTIFICATION_PROVIDER` deliberately,
  since both are "customer notifications," distinct only from OTP.

Confirmed via grep across the entire `src/` tree that no second Meta
client, no second credential resolver, and no second sender-selection
function exist anywhere.

## Environment configuration (section 3)

Confirmed by grep (every `process.env.WHATSAPP_*`/`OTP_PROVIDER`/
`NOTIFICATION_PROVIDER` read in `src/`) that every credential and
template name comes from an environment variable — zero hardcoded
tokens, phone number IDs, or template names anywhere in application
code. The full, authoritative set:

| Variable                                      | Required?                 | Purpose                                                                     |
| --------------------------------------------- | ------------------------- | --------------------------------------------------------------------------- |
| `WHATSAPP_API_TOKEN`                          | Yes (production)          | Meta System User access token — shared transport credential                 |
| `WHATSAPP_PHONE_NUMBER_ID`                    | Yes (production)          | Meta's opaque ID for the sending number — shared transport credential       |
| `WHATSAPP_API_VERSION`                        | No (defaults `v21.0`)     | Graph API version                                                           |
| `WHATSAPP_OTP_TEMPLATE_NAME`                  | Yes (production, for OTP) | OTP's own Authentication template                                           |
| `WHATSAPP_OTP_TEMPLATE_LANGUAGE`              | No (defaults `en_US`)     | OTP template's approved language                                            |
| `OTP_PROVIDER`                                | No (non-production only)  | Opt into real WhatsApp OTP sending outside production                       |
| `WHATSAPP_ORDER_PLACED_TEMPLATE_NAME`         | No — skipped if unset     | Order Placed template                                                       |
| `WHATSAPP_ORDER_CONFIRMED_TEMPLATE_NAME`      | No — skipped if unset     | Order Confirmed template                                                    |
| `WHATSAPP_ORDER_PREPARING_TEMPLATE_NAME`      | No — skipped if unset     | Preparing template                                                          |
| `WHATSAPP_ORDER_READY_TEMPLATE_NAME`          | No — skipped if unset     | Ready for Pickup template                                                   |
| `WHATSAPP_ORDER_DELIVERED_TEMPLATE_NAME`      | No — skipped if unset     | Delivered template                                                          |
| `WHATSAPP_RETURN_REQUESTED_TEMPLATE_NAME`     | No — skipped if unset     | Return Requested template                                                   |
| `WHATSAPP_RETURN_APPROVED_TEMPLATE_NAME`      | No — skipped if unset     | Return Approved template                                                    |
| `WHATSAPP_EXCHANGE_APPROVED_TEMPLATE_NAME`    | No — skipped if unset     | Exchange Approved template                                                  |
| `WHATSAPP_RETURN_REJECTED_TEMPLATE_NAME`      | No — skipped if unset     | Return/Exchange Rejected template                                           |
| `WHATSAPP_RETURN_ITEM_RECEIVED_TEMPLATE_NAME` | No — skipped if unset     | Item Received template                                                      |
| `WHATSAPP_RETURN_COMPLETED_TEMPLATE_NAME`     | No — skipped if unset     | Return Completed template                                                   |
| `WHATSAPP_EXCHANGE_COMPLETED_TEMPLATE_NAME`   | No — skipped if unset     | Exchange Completed template (fulfillment-aware wording)                     |
| `WHATSAPP_NOTIFICATION_TEMPLATE_LANGUAGE`     | No (defaults `en_US`)     | Shared language for every Order/Return/Exchange template                    |
| `NOTIFICATION_PROVIDER`                       | No (non-production only)  | Opt into real WhatsApp sending for Order/Return/Exchange outside production |

"No — skipped if unset" means: commerce is never blocked by a missing
template; `notifyOrderEvent`/`notifyReturnEvent` log a clear skip and
return, exactly as designed since Part 2.

**Business Account ID and Sender Number (section 3's explicit
callouts).** This codebase never reads or needs a WhatsApp Business
Account ID — only the per-number Cloud API message-send endpoint
(`POST /{phoneNumberId}/messages`) is ever called, which needs just the
access token and the phone number ID; a Business Account ID would only
be needed for Business-Manager-level APIs (e.g. template creation or
listing), which nothing in this codebase calls. There is deliberately no
unused `WHATSAPP_BUSINESS_ACCOUNT_ID` placeholder — an env var with no
reader would be dead configuration. If a future phase adds such a call,
its ID must be read from its own new env var, following this exact
pattern. Similarly, there is no literal "sender number" anywhere in
application code — Meta's Cloud API abstracts the actual sending number
behind the opaque `WHATSAPP_PHONE_NUMBER_ID`, and the application only
ever handles that ID, never a phone number string for its OWN identity.

**The production business number** (section 4): **8542843482**. This
value appears ONLY in this report and in a `.env.example` comment
explaining what `WHATSAPP_PHONE_NUMBER_ID` represents in production —
confirmed by grep across all of `src/` that it does not appear anywhere
in application code. The application continues to read the sender
identity exclusively from `WHATSAPP_PHONE_NUMBER_ID` at runtime.

## Template audit (section 5)

Twelve dedicated templates exist across the platform (1 OTP + 5 Order +
6 Return/Exchange — `EXCHANGE_APPROVED`/`RETURN_APPROVED` are two of the
six, `RETURN_REJECTED` is shared by both types rather than split in
two, per Part 3's own audited reasoning). Confirmed, by a dedicated test
in each phase's own event-mapping test file, that:

- No two events resolve to the same environment variable (all 12 env
  var names are pairwise distinct — proven by `Set` size checks in
  `notification-events.test.ts` and `return-notification-events.test.ts`).
- The OTP template is never one of the 11 non-OTP variables, and vice
  versa.
- Each template's body-parameter COUNT is fixed and documented per
  domain: OTP = 1 (the code); Order events = 4 (name, order number,
  status line, tracking link); Return/Exchange events = 5 (name, return
  number, order number, status line, tracking link) — never a variable
  count, never reused across domains with a different shape.

No template is reused for an unrelated purpose. `EXCHANGE_COMPLETED`'s
own content is fulfillment-aware (two wordings from ONE template, per
Part 3's documented "Exchange Ready" resolution) — this is intentional
content branching within a single approved template's copy, not
template reuse across unrelated purposes.

## Notification Matrix (section 6) — the authoritative reference

| Business Event           | Template (env var)                            | Triggered By                                              | Recipient                                                           | Retry Policy                         | Failure Behaviour                                                                                                                            |
| ------------------------ | --------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- | ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------- |
| OTP code delivery        | `WHATSAPP_OTP_TEMPLATE_NAME`                  | `requestOtp()` — Track Orders phone submit/resend         | Phone number just entered on the login form (not a stored snapshot) | 1 retry, network-level failures only | Surfaced to the customer as generic `PROVIDER_UNAVAILABLE` — login blocked until retried, since the customer cannot proceed without the code |
| Order Placed             | `WHATSAPP_ORDER_PLACED_TEMPLATE_NAME`         | `placeOrderForBasket`, post-commit                        | Order's `customerWhatsapp` ?? `customerMobile` snapshot             | 1 retry, network-level failures only | Logged, swallowed — checkout still succeeds                                                                                                  |
| Order Confirmed          | `WHATSAPP_ORDER_CONFIRMED_TEMPLATE_NAME`      | `updateOrderStatus` → `CONFIRMED`                         | Same snapshot                                                       | Same                                 | Logged, swallowed — status change still succeeds                                                                                             |
| Preparing                | `WHATSAPP_ORDER_PREPARING_TEMPLATE_NAME`      | `updateOrderStatus` → `PREPARING`                         | Same snapshot                                                       | Same                                 | Same                                                                                                                                         |
| Ready for Pickup         | `WHATSAPP_ORDER_READY_TEMPLATE_NAME`          | `updateOrderStatus` → `READY_FOR_PICKUP`                  | Same snapshot                                                       | Same                                 | Same                                                                                                                                         |
| Delivered                | `WHATSAPP_ORDER_DELIVERED_TEMPLATE_NAME`      | `updateOrderStatus` → `DELIVERED`                         | Same snapshot                                                       | Same                                 | Same                                                                                                                                         |
| Return Requested         | `WHATSAPP_RETURN_REQUESTED_TEMPLATE_NAME`     | `createReturnRequest`, post-commit (portal or walk-in)    | Parent order's snapshot                                             | Same                                 | Logged, swallowed — request still created                                                                                                    |
| Return Approved          | `WHATSAPP_RETURN_APPROVED_TEMPLATE_NAME`      | `updateReturnRequestStatus` → `APPROVED`, type `RETURN`   | Parent order's snapshot                                             | Same                                 | Logged, swallowed — approval still succeeds                                                                                                  |
| Exchange Approved        | `WHATSAPP_EXCHANGE_APPROVED_TEMPLATE_NAME`    | `updateReturnRequestStatus` → `APPROVED`, type `EXCHANGE` | Parent order's snapshot                                             | Same                                 | Same                                                                                                                                         |
| Return/Exchange Rejected | `WHATSAPP_RETURN_REJECTED_TEMPLATE_NAME`      | `updateReturnRequestStatus` → `REJECTED`, either type     | Parent order's snapshot                                             | Same                                 | Same                                                                                                                                         |
| Item Received            | `WHATSAPP_RETURN_ITEM_RECEIVED_TEMPLATE_NAME` | `receiveReturnRequest`, post-transaction, either type     | Parent order's snapshot                                             | Same                                 | Logged, swallowed independently — inventory reconciliation and the second (completion) notification both proceed regardless                  |
| Return Completed         | `WHATSAPP_RETURN_COMPLETED_TEMPLATE_NAME`     | `receiveReturnRequest`, post-transaction, type `RETURN`   | Parent order's snapshot                                             | Same                                 | Logged, swallowed — completion still succeeds                                                                                                |
| Exchange Completed       | `WHATSAPP_EXCHANGE_COMPLETED_TEMPLATE_NAME`   | `receiveReturnRequest`, post-transaction, type `EXCHANGE` | Parent order's snapshot                                             | Same                                 | Same                                                                                                                                         |

Every "Retry Policy" cell is the literal same code path
(`sendWhatsAppTemplateMessage`, `src/server/whatsapp/client.ts`): exactly
one retry, only for a genuine network-level failure (the request never
reached Meta); any real HTTP response, even a 5xx, is never retried.

The one structural asymmetry in this table, audited and confirmed
correct: **OTP is the only row where failure is surfaced to the
customer.** Every other row is swallowed. This is not an inconsistency
— OTP delivery failing means the customer literally cannot proceed
(there is no code to enter), so telling them is the only honest option;
a commerce/notification failure means the underlying business
transaction already succeeded, and telling the customer would only
create confusion about an order/return that is, in fact, fine.

## Failure audit (section 7)

| Failure mode                                                  | Where it's caught                                                                                                                                                    | Verified behavior                                                                                                                     |
| ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| Provider outage (Meta down, connection refused)               | `isNetworkLevelFailure` in `client.ts` (`err instanceof TypeError`)                                                                                                  | Retried once, then swallowed (notifications) or surfaced generically (OTP)                                                            |
| Network timeout                                               | Same path — `fetch` timeouts surface as the same `TypeError` class                                                                                                   | Same                                                                                                                                  |
| Meta HTTP error (4xx/5xx, incl. invalid recipient)            | The `response.ok` check in `client.ts` — never retried, since a real response means the request definitely reached Meta                                              | Logged with `httpStatus`/`metaErrorCode`/`metaErrorType`, then swallowed (notifications) or surfaced generically (OTP)                |
| Configuration error (missing token/phone number ID/template)  | `getWhatsAppTransportConfig()` throws before any `fetch`; both notification services and `createWhatsAppOtpProviderFromEnv` treat this identically to a send failure | Same as above per domain — never a raw config error reaching a customer or a log line                                                 |
| Invalid recipient (malformed phone, never even a valid E.164) | `normalizePhoneNumber()` — checked BEFORE any Meta call, in both notification services and `requestOtp`/`verifyOtp`                                                  | Never attempted — logged as a skip (notifications) or returned as `INVALID_PHONE` (OTP); Meta is never called with a malformed number |

**Commerce always succeeds independently — proven, not assumed.**
Every one of the five commerce call sites (`placeOrderForBasket`,
`updateOrderStatus`, `createReturnRequest`, `updateReturnRequestStatus`,
`receiveReturnRequest`) has a dedicated test that mocks the relevant
notification call to REJECT and asserts the underlying order/return/
inventory state is unaffected. `receiveReturnRequest` additionally has a
test proving a failure in the FIRST of its two sequential notification
calls never prevents the second from being attempted.

## Duplicate audit (section 8)

Every protection already documented in Parts 2/3, re-verified against
the current code, not re-invented:

| Source of possible duplication          | Protection                                                                                                                       | Where                                                                     |
| --------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Retry                                   | Never retries a real HTTP response (only network-level failures)                                                                 | `client.ts`                                                               |
| Refresh (re-viewing a page)             | No notification is ever triggered by a read/render — only by the 5 write-path commerce functions                                 | Structural — confirmed by grep, no notify call outside those 5 functions  |
| Repeated admin clicks                   | Idempotent early-return (`status === newStatus`) before any notification                                                         | `updateOrderStatus`, `updateReturnRequestStatus`                          |
| Concurrent requests                     | Guarded `updateMany` keyed to the status just read — the losing side never reaches the notification line                         | Same two functions, plus `receiveReturnRequest`'s own transactional guard |
| Idempotent operations (checkout replay) | `placeOrderForBasket`'s existing idempotency-key / already-`CONVERTED`-basket short-circuits return before the notification line | `placeOrderForBasket`                                                     |
| Two atomic sub-events in one action     | `ITEM_RECEIVED` and the completion event are two DIFFERENT events (not the same one twice) — not a duplicate, by definition      | `receiveReturnRequest`                                                    |

No new idempotency key, flag, or "notification sent" column exists
anywhere in this platform — every guarantee is reused from a
transaction/status-write guard that already existed for a business
reason unrelated to messaging.

## Security audit (section 9)

- **OTP never leaks**: the OTP code is passed only as a template body
  parameter, never logged (`client.ts` logs only `phoneNormalized`/
  `logLabel` on success, categorized Meta error metadata on failure —
  never a body parameter's value) — proven directly by tests asserting
  deliberately sensitive-looking parameter values never appear in any
  `console.*` call.
- **Secrets never logged**: `WHATSAPP_API_TOKEN` is read once
  (`config.ts`) and passed only as an `Authorization` header value —
  grep-confirmed it is never passed to `console.log`/`console.error`
  anywhere.
- **Tokens never exposed**: the order `accessToken` used in tracking
  links is the SAME intentionally-shareable Phase 2 secret already
  audited for that purpose — never a new token type, never the raw
  internal `Order.id`/`ReturnRequest.id` (grep-confirmed across every
  WhatsApp file).
- **Customer numbers handled correctly**: every recipient resolution is
  scoped to the specific order/return being notified about — no
  cross-customer lookup path exists (grep-confirmed).
- **No sensitive payload logging**: rejection reasons, admin notes, and
  every template body parameter are excluded from every log line by
  construction — proven directly by tests.
- **No template injection**: template NAMES are resolved exclusively
  from environment variables, never from any customer- or admin-supplied
  input — a customer can never influence which template is selected.
  Body parameters (including customer-supplied `customerName`) are sent
  as structured `{type: "text", text: value}` JSON fields, never
  string-concatenated into the request URL, headers, or the template
  name itself — there is no code path by which a parameter value could
  alter which template fires or where the request is sent.
- **No unauthorized notification trigger**: all 5 notification call
  sites live inside commerce functions that are only ever reached
  through an already-authorized Server Action (`getAdminSession()` for
  every admin mutation, the verified customer session for portal
  actions) — confirmed by grep that no Server Action or API route
  imports `notifyOrderEvent`/`notifyReturnEvent` directly, so there is
  no path for a client to trigger a notification without first passing
  through the authorization the underlying business action already
  requires.

## Observability (section 10)

**Intentionally logged** (operational, non-sensitive): `logLabel`
(which event/purpose), `phoneNormalized` (not itself a secret in this
codebase — see Phase 3.1's own phone-handling precedent), `httpStatus`,
`metaErrorCode`/`metaErrorType` (coarse failure category), and
`event`/`orderNumber`/`returnNumber` context added by each service's
outer catch.

**Intentionally NOT logged**: OTP codes, any template body parameter's
actual value (customer name, order/return context line, tracking URL),
rejection reasons, admin notes, the raw Meta response body, and
`WHATSAPP_API_TOKEN`. This list is proven, not just declared — every
item has a dedicated test asserting it never appears in any
`console.log`/`console.error` call across both success and failure
paths.

## Performance review (section 11)

- **Notification dispatch** is awaited synchronously inline in each
  commerce function — a disclosed, deliberate simplification since Part
  2 (matches this codebase's own pre-existing best-effort synchronous
  side-effect precedent), not revisited this phase since nothing in the
  audit showed it causing a real problem.
- **Shared Meta client**: exactly one function
  (`sendWhatsAppTemplateMessage`) issues every outbound request, of
  every kind — no duplicated request-building logic to keep in sync.
- **Connection reuse**: Node's global `fetch` (undici) maintains its own
  keep-alive connection pool per origin automatically; this codebase
  creates no per-call `Agent` and does nothing to defeat that pooling —
  confirmed by reading `client.ts` end to end, no manual work was
  needed or added.
- **Retry behavior**: bounded to exactly one retry with a fixed 400ms
  delay — a deliberately small, fixed cost, not a backoff schedule,
  since network-level failures needing a retry are the rare case, not
  the common one.

No speculative optimization was added — no request batching, no queue,
no connection-pool tuning, no caching layer. Nothing in this audit
surfaced a real performance problem to justify any of that.

## Accessibility / message wording review (section 12)

Re-read every `buildContextLine`/`buildReturnContextLine` branch
(`notification-service.ts`, `return-notification-service.ts`) against
plain-language criteria: no enum values are ever spoken verbatim (e.g.
never "STORE_PICKUP" — always "pickup at {store}"), no internal IDs or
technical terms appear, and every sentence is a single, short, plain
statement of status plus (where applicable) the next expected action —
e.g. "Your order has been placed and is being processed," "Your
exchange is ready for collection at Milan Readymade & General Store."
No changes were needed; this was already the design established in
Parts 2/3 and holds up under a fresh, dedicated read.

## Test review (section 13) — two genuine gaps found and closed

Audited coverage against every row of the Notification Matrix above.
Every event already had: a service-level test for its own template/
content, a wiring-level test proving its call site fires it correctly
and exactly once, and (for the 5 commerce-layer events with atomicity
concerns) a failure-handling and concurrency test. Two genuine,
narrow gaps were found — both the same shape, in the two notification
services — and closed, nothing else:

- Neither `notification-service.test.ts` nor
  `return-notification-service.test.ts` had a test for the "phone on
  file but MALFORMED" branch (`normalizePhoneNumber(...).valid ===
  false`) — only the "no phone at all" (null) branch was tested. This
  is real, reachable code (a distinct `console.error` message,
  "invalid phone on file") that was previously unverified. Added one
  test per file; both pass.

No other gap was found to be genuine enough to justify a new test —
in particular, "invalid recipient" at the Meta-response level was
already fully covered by the existing "never retries a real HTTP
response" tests (an invalid-recipient rejection from Meta is just one
instance of that same, already-tested class of failure), and
speculative scenarios not reachable by any real code path were not
added.

**Total: 635 tests** (633 from Parts 1–3 + 2 new this part).

## Regression (section 14)

- `npx tsc --noEmit` — clean.
- `npx eslint .` — clean.
- `npx vitest run` — 635/635 passing, run twice (live dev database, and
  a from-scratch database — see below) with identical results.
- `npm run build` — succeeds.
- **No new migration** — this part touches no schema. Re-verified per
  "protect every previous phase": created `shop_fresh_verify_p364`,
  applied all 14 existing migrations, confirmed **zero drift**
  (`prisma migrate diff --exit-code`), ran `prisma/seed.ts` and
  `prisma/create-admin.ts` successfully, ran the full 635-test suite
  against it (100% pass), then dropped the database. The real shared
  dev database's `orders` (8) and `return_requests` (1 — a real return
  request created via manual browser testing earlier in this session,
  correctly left untouched, not test residue) counts were confirmed
  unchanged before and after this verification round.
- The long-running dev server was restarted earlier in this session (at
  the user's request) and remains up; no further restart was needed for
  this audit-only, no-schema-change part.

## Production checklist (section 15)

Before enabling real WhatsApp sending in production, an operator needs:

1. A Meta WhatsApp Business Account with the sending number
   (**8542843482**, per this report — reference only, never hardcoded)
   verified and connected.
2. A permanent System User access token with
   `whatsapp_business_messaging` permission → `WHATSAPP_API_TOKEN`.
3. That number's Phone Number ID from Meta's API Setup page →
   `WHATSAPP_PHONE_NUMBER_ID`.
4. Twelve templates submitted and APPROVED in Meta Business Manager: 1
   Authentication-category template (OTP, 1 body variable) and 11
   Utility/Marketing-category templates (5 Order + 6 Return/Exchange,
   4 or 5 body variables per this report's own documented shape) — each
   template's approved name recorded in its own `.env` variable per the
   table in "Environment configuration" above.
5. `NODE_ENV=production` set in the deployment environment — this is
   the hard, non-overridable switch that makes both OTP and
   notifications always use the real WhatsApp provider (never the
   console stand-in), per Parts 1/2's own established invariant.
6. A monitoring/alerting hookup on the two plain log lines this
   platform already emits per attempt (`whatsapp-client: message
   delivered` / `... message delivery failed`) — this codebase does not
   ship a dashboard itself (see "Architecture debt" below), so an
   operator must wire log-based alerting through whatever platform this
   deploys to.

No code change is required to go live — only supplying the above
configuration.

## Known limitations (Part 4)

Everything disclosed in Parts 1–3 remains true and is not repeated in
full here; nothing new was found this part beyond:

- **Twelve templates must all be independently approved by Meta before
  first production use** — this platform cannot function with fewer;
  a still-pending template for any one event degrades gracefully (that
  event is skipped, logged, commerce unaffected) but does mean partial
  rollout is possible and safe, not all-or-nothing.
- **The two-message-per-receive design (`ITEM_RECEIVED` + completion)
  remains a deliberate choice, not revisited this phase** — see Part
  3's own disclosure for the reasoning and the option to collapse it
  later if real usage shows it reads as redundant.

## Architecture debt (Part 4)

Unchanged from Parts 1–3, carried forward rather than repeated:

- No delivery-status webhook handling (only the synchronous
  accept/reject of the send request itself is known).
- No dashboard/metrics/alerting shipped in-app — two plain log lines
  per attempt are the full observability surface; real
  aggregation/alerting is an operational, not a code, concern (see
  "Production checklist" above).

Neither item blocks production use — they bound what this platform
observes about deliveries AFTER Meta accepts the send request, not
whether commerce or the send request itself succeeds.

## Final acceptance

Every one of Phase 3.6's four parts is demonstrated complete against
its own definition of done, re-verified together as one system in this
part:

- **Part 1 — Production WhatsApp OTP**: real Meta-backed OTP delivery,
  environment-driven provider selection with a non-overridable
  production invariant, OTP never logged.
- **Part 2 — Order Notifications**: 5 lifecycle events, fired only
  after commit, Counter sales deliberately excluded (documented
  reasoning), commerce never blocked by messaging.
- **Part 3 — Return & Exchange Notifications**: 7 genuinely-existing
  lifecycle events (an 8th, "Exchange Ready," correctly folded into
  `EXCHANGE_COMPLETED` rather than invented), Counter-linked orders
  deliberately INCLUDED (a documented, reasoned divergence from Part 2),
  walk-in and online returns notify identically with zero separate
  workflow code.
- **Part 4 — Production Acceptance**: the complete platform audited as
  one system end to end; two genuine test-coverage gaps found and
  closed; zero application-code logic changed; the Notification Matrix
  above is now the authoritative reference for every event this
  platform sends.

Klasiq has a production-ready WhatsApp platform providing secure OTP
authentication and transactional notifications for Orders, Returns, and
Exchanges through one shared Meta Cloud API integration, with complete
documentation, environment-only production configuration, 635 passing
tests (including a from-scratch database run), strong, proven security
guarantees, and zero dependency of commerce operations on messaging
success — demonstrated, not merely asserted, at every one of the 5
notification call sites and the OTP delivery path.

## PHASE 3.6 — COMPLETE

Changes across Phase 3.1 through Phase 3.5 (all parts) and Phase 3.6
(all four parts) remain uncommitted together in the working tree, per
instruction. Phase 3.7 has not been started — awaiting review.
