---
target: customer storefront
total_score: 28
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 2
timestamp: 2026-08-11T18-59-53Z
slug: customer-storefront
---
Method: dual-agent (A: aec042ce0adf6d773 · B: a4070b86c5a8622f7)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Loading states exist (school-search spinner, add-to-bag toast, delivery-quote refresh), but qty/size changes give no confirmation beyond an easily-missed toast, and a pending delivery fee shows a bare "—" with no explanation. |
| 2 | Match Between System and Real World | 4 | "Store Pickup"/"Local Delivery," "Pay at Store"/"Cash on Delivery," plain-language stock labels — vocabulary matches how a parent actually thinks about this errand. |
| 3 | User Control and Freedom | 3 | Bag lines fully editable; checkout blocks on stock issues with a clear path back. No section-jump inside the long checkout form, and the confirmation page's "this link is the only way back in" is a real loss-of-control moment. |
| 4 | Consistency and Standards | 2 | Two different size-selection patterns for the same concept (Select on card vs. button row on PDP) with two different corner radii; qty stepper is 36px on the card but 40px in the Bag line item. |
| 5 | Error Prevention | 4 | Idempotency key resent on retries; checkout blocks before order creation, not after; out-of-stock sizes are disabled, not silently orderable; stale delivery quotes are detected and re-fetched rather than resubmitted. |
| 6 | Recognition Rather Than Recall | 3 | Order summary stays visible/sticky through checkout. Nothing on Bag/Checkout reminds the shopper which school they're shopping for. |
| 7 | Flexibility and Efficiency of Use | 2 | No saved addresses or repeat-purchase shortcuts for a "buy the same uniform every term" use case; partially structural given the account-less model, but not fully excused by it. |
| 8 | Aesthetic and Minimalist Design | 3 | Product card is genuinely compact; hero honors its own 48px display cap. But the hero stacks two blurred glow orbs + a gold badge + red/gold-tinted tiles in one screen — busier than "flat-by-default, controlled" implies. |
| 9 | Error Recovery | 4 | Stock-issue and delivery-quote-stale states name the exact product/size/quantity or reason and hand the user a direct fix path, not a generic decline. |
| 10 | Help and Documentation | n/a | Genuinely inapplicable — a low-complexity, cash-only, no-account transactional flow with no implied help-center need. |
| **Total** | | **28/36** | **Good** |

## Design Specificity Verdict

**LLM assessment**: This is not a re-skinned template — there's real evidence of thinking about *this* business specifically. The heritage line is deliberately vague about a founding year rather than inventing one, the legacy-store names surface as trust signals, the demo-school disclaimer banner is the kind of honesty a generic template wouldn't bother with, and checkout copy ("No account needed," "Pay in cash when you collect") is written for this exact transaction, not boilerplate. `ProductPlaceholderImage`'s deliberate rejection of a literal "PLACEHOLDER" badge in favor of a patterned surface + category icon is a specific, considered reaction to a known catalog problem (frequently-missing photos), and `ProductThumbnail`'s hydration-race-safe `onError` handling is real engineering behind that design intent, not a half-implemented idea.

But the follow-through is uneven, and this is exactly where genericness leaks back in. DESIGN.md's own "signature component" claim — a pill-shaped Select that makes the size-picker feel authored rather than templated — isn't actually shipped that way: `SelectTrigger` (`select.tsx:44`) is `rounded-lg`, identical to every card and panel on the site, and `ProductDetail`'s size buttons (`product-detail.tsx:162`) are `rounded-lg` too. The only genuinely pill-shaped selectable control on the whole storefront is the checkout fulfillment tab. That's the exact kind of detail that separates "designed for us" from "default component library," and right now it isn't there. Three hardcoded `/uniforms` fallback links (in `school-search.tsx`, `school/[slug]/page.tsx`, `school/[slug]/not-found.tsx`) contradict PRODUCT.md's explicit "categories are fully dynamic, not hardcoded" principle — the exact failure mode the codebase's own `category-icons.ts` comments describe having already been burned by once.

**Deterministic scan**: CLI detector (`detect.mjs`, exit 2) found 2 findings, both rule `design-system-font-size`: `bag-link.tsx:26` and `product-card.tsx:117`, both literal `text-[11px]` — off DESIGN.md's type ramp (label scale is 12px), both genuinely customer-facing, neither a false positive. Browser evidence (code-only for Assessment A, live Playwright for Assessment B) additionally found: a skipped heading level on the category page (`<h1>"Uniforms"` → `<h3>"Black Pant"`, no `<h2>`), and a detector-flagged low-contrast hit on the hero subcopy (`text-background/70` over the dark hero band) that wasn't independently verified with a computed ratio — worth a precise check via `/impeccable audit`, not asserted as failing here. Two detector categories (`gradient-text`/`marquee`) were confirmed false positives via direct DOM/CSS inspection — no element in this codebase combines a background-clip gradient with marquee-style animation; the co-occurrence was two unrelated utility classes existing separately in the same compiled stylesheet.

One evidence-gathering confound surfaced and was resolved before this report was written: Assessment B found a live-editing script tag already injected into `src/app/layout.tsx` (left over from this session's own earlier `/impeccable live` boot-gate check) plus its background server still running on port 8400. That injection has been reverted and the server stopped — it was not a defect in the shipped product, and none of the reported findings above depend on it.

Product images 404 on `/uniforms` and every `/product/*` page (seed data at `prisma/seed.ts` references `/demo/products/*.svg` paths that were never placed under `public/`) — but this was verified NOT to be a user-visible defect: `ProductThumbnail`'s `onError` (plus its hydration-race `ref` check) correctly catches the failed load and swaps to the placeholder pattern every time. It's a data-hygiene footgun (an unnecessary failed network request per product, and a demo dataset that promises assets it doesn't ship), not a broken-image bug — downgraded to a minor observation below rather than a priority issue.

## Overall Impression

The bones are genuinely good — commerce logic, error states, and copy are specific and well-considered, well above what a template redesign usually produces. What's missing is enforcement: DESIGN.md's own named rules (pill selects, One Red Rule, Gold Is Rare) are written down clearly but aren't consistently followed in the code that shipped after it, and a few "fully dynamic" architectural principles have quiet hardcoded exceptions. The single biggest opportunity is closing that design-doc-to-implementation gap — the rules are already correct, they just need a pass to actually apply them everywhere they claim to.

## What's Working

1. **Stock/price-change reactive states** in `BasketLineItem` and `CheckoutForm` — four independently tracked conditions (unavailable, exceeds-stock, price-changed, low-stock), each with distinct, specific copy instead of one generic "stock changed" banner.
2. **`ProductThumbnail`'s hydration-race image-fallback handling** — a real, non-obvious fix (checking `complete && naturalWidth === 0` in a ref callback, in addition to `onError`) that makes the "never show a broken image" principle actually true, including for the seed data's currently-missing demo images.
3. **The hero's restraint on type size** — capping at 48px per DESIGN.md's own "Compact Display Rule" even where most redesigns would blow past it "just this once" for hero impact, while still using a real eyebrow label and dynamic category tiles instead of a giant static banner.

## Priority Issues

**[P1] Hardcoded `/uniforms` fallback links contradict the "fully dynamic categories" architecture.**
Why it matters: `school-search.tsx:161`, `school/[slug]/page.tsx:107`, and `school/[slug]/not-found.tsx:17` all hardcode a literal `/uniforms` link. PRODUCT.md states categories are admin-managed and fully dynamic; if an admin ever renames or removes that category, all three links 404 — for exactly the anxious, already-disappointed user who just got a "no schools found" result and clicked the one offered escape hatch.
Fix: resolve the fallback from `getHeaderCategories()` (matching the existing keyword-based approach in `category-icons.ts`) instead of a literal string, or fall back to `/search` if no such category exists.
Suggested command: `/impeccable harden`

**[P1] The signature "pill-shaped size Select" isn't a pill anywhere, and size-selection is visually inconsistent across surfaces.**
Why it matters: DESIGN.md calls out fully-rounded pills for "anything selectable," specifically naming the size picker. In the shipped code, `SelectTrigger` (`select.tsx:44`) and `ProductDetail`'s size buttons (`product-detail.tsx:162`) both use `rounded-lg`, the same radius as every other panel on the site. Only the checkout fulfillment tab actually ships as a pill. A stressed parent choosing a size sees three different shapes/interaction patterns for the same logical choice depending on which page they're on.
Fix: apply `rounded-full` to the product-card `SelectTrigger` and to `ProductDetail`'s size buttons, unifying the shape language the design doc already commits to.
Suggested command: `/impeccable layout`

**[P2] "One Red Rule" and "Gold Is Rare Rule" are both violated on the homepage's category grid.**
Why it matters: `TILE_TREATMENTS` in `page.tsx` cycles a primary-red option and an accent-gold option across every category tile. With a typical 6-10 category count, that puts 2-3 gold-tinted tiles plus the gold hero eyebrow badge on one screen (DESIGN.md: "at most once or twice per screen"), and spends red — the system's only "act here" color — decoratively on tiles with no actual call-to-action, diluting the one signal red is supposed to carry uniquely.
Fix: drop the primary-color option from the tile-treatment rotation (ink + one muted neutral is enough); reserve gold for one deliberate placement per screen.
Suggested command: `/impeccable colorize`

**[P2] No persistent school/category context through Bag and Checkout.**
Why it matters: once a parent reaches `/bag` or `/checkout`, nothing reminds them which school they were shopping for — both pages' `<h1>`s are just "Your Bag"/"Checkout." For a parent handling two children at two different schools in one sitting, this is a real, unmitigated working-memory tax, and it's also the surface where `Consistency and Standards` and `Recognition Rather Than Recall` lost the most points above.
Fix: surface the relevant school name as a one-line subtitle under the Bag/Checkout heading when the basket's items trace back to one.
Suggested command: `/impeccable clarify`

**[P3] Two literal 11px font sizes sit off the DESIGN.md type ramp.**
Why it matters: `bag-link.tsx:26` (the bag-count badge) and `product-card.tsx:117` (the stock-status label) both use `text-[11px]`, one pixel under the documented 12px Label scale — confirmed by the CLI detector, not a false positive, and small type at the smallest size on the page is exactly where an unplanned deviation is easiest to actually notice.
Fix: bump both to the existing 12px label token/class instead of a one-off arbitrary value.
Suggested command: `/impeccable typeset`

## Persona Red Flags

**Riley (stress-tester)**: Hits `school-search.tsx`'s no-results state on a slightly-misspelled school name (no fuzzy match visible in the search contract) and is offered only a flat link to `/uniforms` — a link that, per the P1 above, can 404 outright depending on admin category state, turning "stressed but coping" into "hard dead end" at the exact moment the product's core promise needed to work. Separately, if Geoapify is misconfigured during Local Delivery, every address field disables and the only instruction is a small amber "please call us" note with no phone number rendered inline in that block — forcing a search under time pressure.

**Casey (distracted mobile)**: At 390px, `CategoryProductGrid` renders 2 product cards per row, each packing image/name/price/Select/stepper/Add into half the screen width. The Select trigger is 36px tall and the stepper's +/- buttons are 32px wide — both under the commonly-cited 44px comfortable-tap guidance, in exactly the interaction a one-handed, distracted thumb is most likely to fumble.

**Sam (accessibility-dependent)**: Stock-status labels render at 11px in muted-foreground on a white card, with `line-through` on the out-of-stock state — small type at borderline contrast, and a decoration that itself can reduce legibility for some low-vision/dyslexic readers, stacked on top of each other in the one place stock status is communicated. Positively: `ProductCard`'s hidden duplicate image-link (`aria-hidden` + `tabIndex={-1}`) is a correct, non-obvious fix for double-announcement that most teams get wrong — a genuine Sam-positive worth preserving through any future changes.

## Minor Observations

- Bag/Checkout's quantity stepper is 40px while the Product Card's is 36px (matching DESIGN.md) — a small, fixable inconsistency in what's meant to be one reusable pattern.
- `track/page.tsx`'s login card carries a static `shadow-sm` with no hover/interactive trigger, a minor exception to the "Flat-By-Default" rule; `SchoolSearch`'s hero input does too, arguably justifiable as the page's primary anchor but worth naming as a deliberate exception rather than a silent one.
- Checkout's cash-only reassurance sits in the third of three stacked sections, visible only after scrolling past Contact and Fulfillment — for a flow whose biggest unstated anxiety is "will this ask for a card," that reassurance could live near the top instead.
- Product images 404 on `/uniforms` and every `/product/*` page because `prisma/seed.ts` references `/demo/products/*.svg` files that were never added under `public/` — verified NOT user-visible (the placeholder fallback engages correctly every time), but still an unnecessary failed request per product and a demo dataset promising assets it doesn't ship.
- Category page has a heading-level skip (`<h1>"Uniforms"` straight to `<h3>` product names, no `<h2>`) — flagged by live browser inspection, worth a quick semantic fix.
- A detector-flagged low-contrast hit on the hero subcopy (`text-background/70` over the dark hero band) wasn't independently computed to a ratio in this run — worth a precise check via `/impeccable audit` rather than treating it as confirmed here.

## Questions to Consider

- What if a "no schools found" result captured "request my school be added" (name + school + mobile) instead of just redirecting to a generic aisle — right now a failed core-differentiator search and a failed sock search look identically unremarkable.
- What if Klasiq Red usage were actually enforced (a lint rule, or even just a code-review convention) rather than only documented — would the homepage tile violation have shipped if something had made it visible at review time?
- The order-confirmation page already tells the customer "save this link, it's the only way back in" — and WhatsApp is already the product's chosen update channel. What if that same channel were also the one-tap recovery action for the link itself, instead of leaving it entirely on manual bookmarking discipline?
