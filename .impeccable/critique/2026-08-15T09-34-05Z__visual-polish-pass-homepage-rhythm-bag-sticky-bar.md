---
target: Final visual polish pass (homepage rhythm + product card + Bag sticky bar)
total_score: 38
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-15T09-34-05Z
slug: visual-polish-pass-homepage-rhythm-bag-sticky-bar
---
Method: dual-agent (A: general-purpose design-review sub-agent · B: general-purpose detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Bag badge count updates live, `aria-live` on quantity, toasts on add/remove/undo. |
| 2 | Match Between System and Real World | 4 | Plain-language stock states, ₹ formatting, "cash on delivery" copy. |
| 3 | User Control and Freedom | 4 | Undo-on-remove, quantity clamps, breadcrumbs. |
| 4 | Consistency and Standards | 4 (was 3) | Stepper shape now pixel-identical between Bag and PDP (both `border-radius: 3.35544e+07px`, confirmed by both assessments). The mobile sticky bar's "Checkout" label — flagged as inconsistent with the desktop "Proceed to Checkout" button — is now the same text on both, since the bar's new full-width layout removed the horizontal-space reason to abbreviate it. |
| 5 | Error Prevention | 4 | Disabled states for out-of-stock/max-qty, exceeds-stock warnings. |
| 6 | Recognition Rather Than Recall | 4 | Size/price/stock always visible on card, no hidden state. |
| 7 | Flexibility and Efficiency | 3 | Good breakpoint adaptation; no saved-address/quick-reorder shortcuts (out of scope for a cart). |
| 8 | Aesthetic and Minimalist Design | 4 | Restrained dark theme; the product card's shorter single-column image ratio measurably shifts visual weight toward the info block without adding new copy or controls. |
| 9 | Error Recovery | 4 | Inline + toast for failed add, price-changed/unavailable-item messaging. |
| 10 | Help and Documentation | 3 | No help affordance, but the flow is simple enough that none is obviously missing. |
| **Total** | | **38/40** | **Excellent** |

## Design Specificity Verdict

**High, and unusually precise.** All four claimed fixes this round were stated in the code's own comments as exact measured pixel/percentage values (48px→24px gap, ~58%→47.6% image ratio, ~69px→101px bar height) — both independent assessments reproduced every one of these numbers almost exactly on the live production build, not approximately. This is measurement-driven polish, not a vibe pass.

## Overall Impression

This was a narrowly-scoped, four-item polish pass, and all four items land cleanly with zero regressions across 60+ overflow/console-error checks spanning every affected route at every specified viewport (including the 294×584 pair explicitly called out as the worst offender in the prior round's screenshots). The one loose end the critique surfaced — a checkout-button label mismatch between the sticky bar and the desktop in-content button — was a natural side-effect of the stacked-bar redesign removing the space constraint that justified the abbreviation, and is now resolved.

## What's Working

1. **All three numeric before/after claims reproduce almost exactly on the live build.** Homepage gap: 24px at both 294px and 390px (was ~48px). Product-card image ratio: 47.6%-53.2% at single-column widths, confirmed still reverting to a true square (equal width/height) at 2+-column widths (768px, 1024px) — the fix is correctly scoped, not applied everywhere. Sticky bar: 101px total height, Checkout button spanning 100% of the bar's inner width.
2. **The Bag/PDP stepper unification is computed-style identical, not just visually similar.** Both assessments independently measured `border-radius: 3.35544e+07px` (Tailwind's `rounded-full` max value) on both surfaces' stepper wrappers.
3. **Zero regression across the full route/width matrix.** 60+ checks (mobile pairs 272×584 through 430×932, desktop 768-1440) on `/`, `/uniforms`, `/product/black-pant`, `/bag`, `/checkout`, `/track` all show zero horizontal overflow and zero non-404 console errors, both before and after this round's fixes.

## Priority Issues Found This Round (fixed within it)

**[P3 — FIXED] Checkout button label mismatch between mobile sticky bar and desktop in-content button.** The sticky bar said "Checkout" while the equivalent desktop button said "Proceed to Checkout" — never shown simultaneously (so severity was cosmetic only), but a genuine seam in an otherwise unified system. Now that the bar is stacked (full-width button, no longer sharing a row with the subtotal), there's no remaining horizontal-space reason to abbreviate it — updated to "Proceed to Checkout" on both. Reverified: fits without clipping even at 272px width (238px text in a 240px available button width).

**[P3 — FIXED, documentation only] DESIGN.md's "Dark Variant" section was stale.** It stated the Bag "stays on the light system," contradicted by the Bag's own dark-cart redesign from a prior round (already reflected correctly in `route-theme-scope.tsx`'s own code comment, just not in DESIGN.md's separate documentation). Corrected, and the Bag→Checkout light/dark boundary is now explicitly documented as an intentional tonal seam at a transaction boundary, not an oversight.

**[P2 — investigated, out of scope, not changed] Bag→Checkout dark-to-light hard cut.** Flagged as the most visible remaining "seam" when judging whether the whole storefront feels like one brand. This is pre-existing, explicitly scoped out of both the Bag redesign round and this polish round (checkout was deliberately left light both times), not something introduced or touched by any change under review here — left as a documented, intentional boundary rather than something to fix unprompted.

## Persona Red Flags

**Casey (distracted, thumb-only mobile shopper):** none found. The full-width "Proceed to Checkout" button is unmissable at a glance; Add button and stepper both clear the 44px+ touch-target norm; the shorter single-column product card still surfaces price/stock/size without a second tap.

**Riley (deliberate stress-tester):** a 2-product cart (Black Pant + School Bag) at 294px rendered subtotal, line items, and stepper correctly with no truncation; 272px (the narrowest tested width) showed no overflow on any of the three touched pages.

## Minor Observations

- A `fullPage` Playwright screenshot of the Bag visually duplicates the fixed sticky bar mid-scroll — the same known Chromium full-page-capture artifact with `position:fixed` elements documented in prior rounds, not a real bug (confirmed via live viewport screenshots and real scroll + `getBoundingClientRect()`).
- The product card's "Add" label (vs. the PDP's "Add to Bag") remains an intentional, already-documented difference — a full-column-width mobile card still needs the shorter label to avoid its own truncation risk at the narrowest single-column widths, unlike the now-full-width checkout button which had genuine room to spare.

## Questions to Consider

- Now that the Bag/PDP stepper is pixel-identical, is it worth extracting a shared `QuantityStepper` component so a future change to one can't silently drift from the other again (raised in a prior round too)?
- Is there a case for the Bag→Checkout transition getting a deliberate, designed hand-off treatment (e.g. a brief transitional accent) rather than a hard cut, given how carefully every other transition in this storefront has been unified? This is a genuine open design question, not a defect — checkout was explicitly kept out of scope for both the original Bag redesign and this round.
