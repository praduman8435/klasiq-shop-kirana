---
target: Final mobile storefront QA + polish pass
total_score: 37
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-15T08-04-18Z
slug: final-mobile-storefront-qa-polish
---
Method: dual-agent (A: general-purpose design-review sub-agent · B: general-purpose detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Live stock badges, cart count, `aria-live` qty stepper; no loading skeleton on Add (toast-only), unrelated to this round. |
| 2 | Match Between System and Real World | 4 | Plain language, real fulfillment facts, ₹ formatting, no invented policy. |
| 3 | User Control and Freedom | 3 | Escape/scroll-lock work; drawer focus-trap has an apparent rare timing artifact in automated testing, self-corrected on retest — not treated as a real defect. |
| 4 | Consistency and Standards | 4 (was 3) | The header's own category nav silently clipped "Bags"/"kurtis" mid-word from 768-849px with zero scroll affordance, while the homepage rail already had one — now both share the identical trailing-fade treatment, confirmed via computed style at every width in that range. |
| 5 | Error Prevention | 4 | `isUnavailable`/`exceedsStock`/`priceChanged` bag-line logic proactively surfaces state changes. |
| 6 | Recognition Rather Than Recall | 4 | Persistent breadcrumbs, category icons, visible size/stock; the 375px category-rail affordance gap (a chip's peek was accidentally flush with the viewport edge at that one width) is now closed with a deterministic fade rather than depending on pixel luck. |
| 7 | Flexibility and Efficiency of Use | 4 | Add-from-grid without visiting PDP; PDP sticky mobile purchase bar. |
| 8 | Aesthetic and Minimalist Design | 4 (was 3) | Single-column product cards (now the correct layout below 400px) previously gave their image 62-71% of total card height around one small placeholder icon — tightened to a shorter `aspect-[4/3]` at that same range, reducing the "oversized empty panel" feel while keeping the square ratio once cards return to multi-column at 400px+. |
| 9 | Error Recovery | 4 | Clear inline "no longer available"/price-change copy, toast failure messages. |
| 10 | Help and Documentation | 3 | No formal help; self-explanatory flow with phone/directions adequate for scope. |
| **Total** | | **37/40** | **Excellent** |

## Design Specificity Verdict

**High, and unusually evidence-driven.** Every fix this round — the ~150px-per-card clipping floor, the 273px→269px bag-overflow floor, the 375px rail-peek gap, the 768-849px header-nav clip range — was measured directly via real DOM inspection, not guessed. Both independent assessments corroborated these exact numbers on their own re-measurement.

**Deterministic scan**: zero findings across all five touched files (`page.tsx`, `category-product-grid.tsx`, `basket-line-item.tsx`, `header.tsx`, `product-card.tsx`), both before and after the post-critique fixes.

## Overall Impression

The reported defect (clipped Add-to-Bag buttons at ~294px) is fully resolved, root-caused to a specific, now-documented CSS gotcha (a `flex-1` button's browser-default `min-width:auto`), and the same underlying pattern was proactively checked for and fixed in a second location (the bag line item) before it was ever reported there. The critique round then surfaced two further genuine gaps — one in a shared component (`header.tsx`) not explicitly named in the original bug report, and one purely by testing the exact width list the task specified rather than round numbers — both fixed and reverified live in the same round.

## What's Working

1. **The core clipping fix is real and thorough.** Zero clipped or invisible Add buttons across 11 widths on both `/` (5 cards) and `/uniforms` (7 cards, via the shared `CategoryProductGrid`), confirmed via computed `grid-template-columns` matching the claimed 1/2/3/5-column scheme exactly.
2. **Proactive, not just reactive, defect-hunting.** The bag line-item's own sub-pixel overflow at 272px was found and fixed as a natural extension of the ProductCard investigation, before any user report flagged `/bag` specifically — the same `min-width:auto` root cause, caught early by pattern-matching rather than waiting for a second bug report.
3. **Disciplined system execution held throughout.** One Red Rule and Gold Is Rare Rule remain intact; dark/light theming stayed correctly scoped on every route, including the portaled mobile-nav Sheet.

## Priority Issues Found This Round (all fixed within it)

**[P1 — FIXED] Header category nav clipped mid-word from 768-849px with zero scroll affordance.** Confirmed via bounding-rect measurement (331px of content in as little as 255px of visible box at 768px) — "Bags" and "kurtis" cut off mid-word, unlike the homepage rail's already-working peek pattern. Fixed by giving the header nav the identical trailing-fade treatment the homepage rail and PDP size selector already use. Reverified: nav still correctly scrolls internally (no page-level overflow introduced), fade renders at the correct 32px width and position at every width in the affected range.

**[P2 — FIXED] Single-column card image read as an oversized empty panel.** Measured at 62-71% of total card height at 272-390px, holding one small centered placeholder icon, repeated 5× on the homepage. Fixed with a shorter `aspect-[4/3]` ratio specifically at the single-column range (reverting to the established square once cards return to multi-column at 400px+). Reverified: image height dropped to ~60% of card height at 320px, still reads as intentional rather than cropped.

**[P2 — FIXED] 375px silently lost the category-rail "peek" scroll cue.** A precise per-width sweep found the natural chip-peek affordance present at every tested mobile width except exactly 375px (a common real device width — iPhone SE 2nd/3rd gen, 6/7/8) — a coincidental pixel alignment, not a designed behavior. Fixed by adding the same static trailing fade used elsewhere, making the cue deterministic rather than a matter of luck. Reverified: fade renders correctly and consistently across 272-430px.

**[P3 — investigated, not treated as a defect] Drawer focus-trap rare transient dead zone.** Found independently by both assessments in ~1 of 10 automated Tab-throughs; Assessment B's own retest with a longer settle delay between keypresses showed the trap holds perfectly every time, identifying the original finding as a timing artifact in the test tooling itself (reading `document.activeElement` before Base UI's async focus-redirect handler settles), not a real component defect. Not fixed, since there is nothing to fix — the underlying focus trap works correctly.

**[P3 — FIXED, documentation only] DESIGN.md was stale.** Its Layout section still stated "2 columns at mobile (375-390px)" for the product grid, contradicted by this round's single-column-below-400px fix. Corrected, and a new "Horizontal Scroll Fade" pattern entry added documenting the now-three-place-shared fade convention (homepage rail, header nav, PDP size selector).

## Persona Red Flags

**Casey (distracted, thumb-only)**: the Add button is now fully tappable at every width tested — no more clipped taps. The tightened single-column image ratio reduces (though doesn't eliminate) the "scroll past mostly-empty panels" cost of her fast-scroll behavior.

**Riley (deliberate stress tester)**: a long product name (4-line wrap) and an 8-size variant dropdown both held up cleanly at 272px with zero overflow. The 375px rail-peek gap and 768px header-nav clip were both found only by testing the task's own specified width list rather than round numbers — exactly the kind of gap Riley's methodology is built to catch, and both are now closed.

## Minor Observations

- Quantity-stepper buttons remain under the common 44×44 touch-target guideline — pre-existing, not introduced or touched by this round, left as a documented, out-of-scope observation.
- A `fullPage` Playwright screenshot of the PDP's sticky mobile bar appeared to overlap the fulfillment list — confirmed (again) to be the known Chromium full-page-screenshot stitching artifact with `position:fixed` elements, not a real bug; a real scrolled viewport screenshot plus `getBoundingClientRect()` showed no overlap.
- Checkout correctly stays single-column below `lg` and switches to the documented two-column sticky layout at 1024px+ — no regression from any change this round.

## Questions to Consider

- Now that the "trailing fade" scroll-affordance pattern is used in three places (homepage rail, header nav, PDP size selector) and formally documented, should it become a small shared utility class or component rather than three independent copies of the same markup?
- The single-column product-card breakpoint (400px) and the bag line-item's tightened gap (`gap-3`→`gap-2`) were both derived from measuring this specific codebase's current spacing tokens — worth a lightweight regression check (e.g. a Vitest/Playwright smoke test asserting zero horizontal overflow at a few key widths) so a future spacing change doesn't silently reintroduce either gap.
