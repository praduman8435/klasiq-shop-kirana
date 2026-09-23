---
target: Product Detail Page (/product/[slug])
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-14T21-12-03Z
slug: customer-product-detail-page
---
Method: dual-agent (A: general-purpose design-review sub-agent · B: general-purpose detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Adding/Added/toast/live-region feedback is strong, but a genuine thrown network failure gave zero graceful status pre-fix — it blanked the whole page. |
| 2 | Match Between System and Real World | 4 | Plain, domain-correct copy throughout ("Add to Bag," "Store Pickup available," "Pay at store or cash on delivery," real ₹ sizes). |
| 3 | User Control and Freedom | 3 | Add to Bag safely non-navigating; Buy Now clearly a separate committed path. No true "undo" once added, standard for this domain. |
| 4 | Consistency and Standards | 3 | One Red Rule respected (only Add to Bag is solid red); size-picker's focus ring broke the system's declared "3px ring on every button" rule pre-fix. |
| 5 | Error Prevention | 3 | Stock clamps and disabled/labeled out-of-stock sizes work well; the uncaught-exception gap (pre-fix) meant a transient failure wasn't contained. |
| 6 | Recognition Rather Than Recall | 4 | All 8 sizes visible at once, in/out-of-stock shown inline, nothing hidden behind a dropdown or memory demand. |
| 7 | Flexibility and Efficiency of Use | 2 | No numeric quantity entry (stepper-only), no shortcuts beyond the (excellent) arrow-key size nav. |
| 8 | Aesthetic and Minimalist Design | 4 | Genuinely restrained: single accent color, no ambient shadows, no decorative noise — matches DESIGN.md's Flat-By-Default and Compact Display rules. |
| 9 | Help Recognize/Diagnose/Recover from Errors | 2 pre-fix → 3 post-fix | The in-app decline path ("Only N left in this size") was already excellent; the uncaught-exception path (full-page crash) has since been fixed to use the same inline treatment. |
| 10 | Help and Documentation | 2 | No sizing guide or contextual help affordance — plausible for the category but genuinely absent. Declined as a fix: would require inventing sizing content the catalog doesn't have. |
| **Total** | | **30/40 → 31/40 post-fix** | **Good** |

## Design Specificity Verdict

**High.** Not a template PDP wearing a coat of paint. The Fraunces/Plus Jakarta Sans pairing, the rupee-denominated real school-uniform size range (22–36), "Exclusive to [School Name]," the pickup/delivery/cash-on-delivery fulfillment trio, and the two-Button hierarchy inherited from `ProductCard`'s established interaction model all read as authored for Klasiq specifically.

**Deterministic scan**: `node .claude/skills/impeccable/scripts/detect.mjs --json` against `product-detail.tsx`, the loading skeleton, and `route-theme-scope.tsx` returned **zero findings** (exit 0), confirmed with `--no-config` to rule out a suppressed rule set. No false positives to report — there was nothing to argue against.

## Overall Impression

The redesign delivers on its brief: a genuinely dark-first, card-less, breathing purchase panel with correct button-hierarchy reversal, real keyboard-accessible radiogroup semantics, and excellent contrast. The one real gap this round exposed was an untested failure path — an uncaught exception from the `addToBasket` server action (as opposed to its own graceful `{success:false}` decline) took the whole page down. That's now fixed and re-verified live.

## What's Working

1. **The button hierarchy reversal is real and correct.** Add to Bag is unambiguously solid Klasiq Red primary; Buy Now is unambiguously outline secondary — verified at every breakpoint including the mobile sticky bar, which now carries both actions plus price.
2. **The size-picker's keyboard semantics are genuinely correct, not just labeled correctly.** Live keyboard testing confirmed a real roving-tabindex radiogroup: Tab lands on exactly one stop (the checked size), ArrowRight/ArrowLeft move both focus and `aria-checked` together.
3. **Contrast is excellent across the board**: heading text 17.86:1, price 17.86:1, stock badge 10.39:1 — comfortably clears WCAG AA and mostly AAA, measured against the true nearest opaque ancestor background (not the light-mode `document.body`, a known measurement trap on this dark-scoped route).

## Priority Issues

**[P1 — FIXED] A thrown add-to-bag exception (network drop, server 500) crashed the whole page.**
What: Assessment A simulated an aborted request on Add to Bag; the page was replaced by the app's generic error boundary, wiping the selected size and quantity. The prior round's inline-error fix only covered `addToBasket`'s own `{success:false}` decline, not an uncaught exception from the call itself.
Fix applied: wrapped the `addToBasket` call in try/catch, routing any thrown failure through the same `setAddError`/toast path as a graceful decline. Re-verified live via an aborted-request Playwright test: page stays intact, selected size and quantity are preserved, both the inline alert and the toast render correctly.

**[P2 — FIXED] The size-picker's focus indicator didn't inherit the shared `Button` component's focus-visible ring.**
What: size-radio buttons are hand-styled rather than built on `Button`, so they didn't get DESIGN.md's declared 3px `ring-ring/50` focus-visible ring — confirmed via computed style showing only a faint 1px browser-default outline.
Fix applied: added `outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50` to match the shared Button treatment exactly. Re-verified via computed style: a clear 3px ring now renders on keyboard focus.

**[P2 — declined, conflicts with the explicit brief] No direct-entry path for quantity.**
What: quantity is stepper-only; reaching a high quantity takes many taps.
Why declined: the user's own PDP brief specified "Quantity: compact `[-] 1 [+]`" explicitly, matching `ProductCard`'s existing convention. Overriding an explicit brief requirement to satisfy a critique suggestion isn't in scope for this round; flagging as a documented remaining limitation instead.

**[P3 — declined, would require inventing content] No sizing-guide affordance.**
What: no "size chart" or fit help exists near the Size legend.
Why declined: the brief explicitly prohibits inventing content the catalog doesn't have, and no sizing-chart data exists in the schema. Documented as a remaining limitation rather than fabricated.

## Persona Red Flags

**Casey (distracted mobile user)**: price + Buy Now + Add to Bag are all present and thumb-reachable in the sticky bar (44×44px+ targets confirmed on every size chip and both sticky buttons). Pre-fix, a failed add on a flaky mobile connection — the single most Casey-realistic failure mode — would have wiped her entire page state; now she gets the same inline message a graceful decline shows.

**Sam (accessibility-dependent, keyboard/screen-reader user)**: the whole primary flow is keyboard-completable; radiogroup semantics are correct end-to-end (verified live); the failure alert uses `role="alert"` so it's announced without extra navigation. Pre-fix, the size selector's own focus ring was the weakest visual cue on the page despite being the control Sam relies on most; now it matches the system's declared standard.

## Minor Observations

- A 404 for `/demo/products/{slug}.svg` fires on every PDP load — handled gracefully by `ProductThumbnail`'s existing `onError` fallback; a missing-demo-asset gap, not a defect in this redesign.
- Quantity does not reset to 1 after a successful add (only variant switching resets it) — a deliberate-enough choice either way, not flagged as a defect.
- Breadcrumb stops at category, never adds a non-link product-name terminal crumb — common convention, not a gap given the `<h1>` sits immediately below it.

## Questions to Consider

- Now that both the homepage and Product Detail Page share the dark-first system, is it time to promote `RouteThemeScope`'s per-route allowlist into a documented "these routes are dark" convention in DESIGN.md itself, rather than leaving it implicit in code comments?
- The mobile sticky purchase bar and the fulfillment-info list are both new, reusable patterns this redesign introduced — worth formalizing as named DESIGN.md components before a third surface reinvents them differently?
