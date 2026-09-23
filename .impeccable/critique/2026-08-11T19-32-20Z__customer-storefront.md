---
target: customer storefront
total_score: 31
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 0
timestamp: 2026-08-11T19-32-20Z
slug: customer-storefront
---
Method: dual-agent (A: a0ed7c946b87ff157 · B: a9d1a3122306ced52)

This is a follow-up critique after fixing all 5 priority issues from the previous run (28/36) plus a same-pass polish round. Both assessments independently re-verified the storefront from scratch (not a diff review) and additionally confirmed, with file:line evidence, that all 5 original fixes are genuinely landed — not cosmetic.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 4 | Debounced search spinner, `aria-live` qty steppers, submit-button state text all confirmed present and working. |
| 2 | Match Between System and Real World | 3 | Vocabulary is right, but the "trusted, decades-old family-run store" half of the positioning barely reaches the customer — `BRAND.heritageLine` is defined but never rendered anywhere in the storefront. |
| 3 | User Control and Freedom | 3 | Good exits/undo throughout checkout; the Bag's remove button has no undo step, a minor gap. |
| 4 | Consistency and Standards | 4 | Pill-shaped size selection confirmed genuinely unified across ProductCard, ProductDetail, SchoolSearch, and the checkout fulfillment tabs — this was the core P1, and it landed cleanly, verified independently by both assessments. |
| 5 | Error Prevention | 4 | Checkout blocking gate, idempotency key, stale-quote re-fetch all confirmed still intact and untouched. |
| 6 | Recognition Rather Than Recall | 3 | Selected size/stock/price stay visible; a tablet-width header gap (see below, now fixed) had been a recall burden. |
| 7 | Flexibility and Efficiency of Use | 3 | Keyboard nav in the school combobox, shareable query-string URLs. |
| 8 | Aesthetic and Minimalist Design | 3 | Product card compactness confirmed; a loading-skeleton/real-grid mismatch (see below, now fixed) was undercutting the polished feel with real layout shift. |
| 9 | Error Recovery | 4 | Stock-issue and delivery-quote-stale messaging confirmed still specific and actionable. |
| 10 | Help and Documentation | n/a | Still genuinely inapplicable to this low-complexity, cash-only, no-account flow — a missing phone number is a trust-copy gap, not a help/documentation gap, and is tracked separately below rather than folded into this score. |
| **Total** | | **31/36** | **Good** |

(Previous run: 28/36. Both assessments scored independently from scratch, not by diffing against the old report — the following per-heuristic deltas are as-scored: #1 +1 (stronger evidence of feedback states this pass), #2 −1 (a genuinely new finding: heritage copy invisible to customers), #4 +2 (the pill-consistency fix, confirmed), #7 +1. Heuristics #3, #5, #6, #8, #9 held steady.)

## Verification of the 5 Previously-Fixed Issues — all CONFIRMED RESOLVED

1. **Hardcoded `/uniforms` fallback links** — confirmed gone from all 3 flagged files; `pickBrowseFallbackCategory()` verified in use in `school/[slug]/page.tsx`, `school/[slug]/not-found.tsx`, and the homepage's signature-tile logic; `school-search.tsx`'s own fallback now points at `/search`.
2. **Pill-shaped size selection** — confirmed unified: `ProductCard`'s `SelectTrigger` and `ProductDetail`'s size buttons are both `rounded-full border-2`, matching `SchoolSearch`'s input and the checkout fulfillment tabs. Live-DOM `border-radius` measurements on both controls confirmed effectively fully-rounded, not the prior ~12px rectangle.
3. **One Red Rule / Gold Is Rare Rule tile violation** — confirmed fixed. Tile-by-tile computed-style sampling of all 5 homepage category tiles found exactly 2 distinct treatments: one signature tile (Uniforms) with the primary/red badge, the other 4 sharing one identical neutral badge — down from 3 rotating colors. One assessment noted the hero's own decorative blur elements (not the tiles) put red/gold each at ~2 appearances page-wide before counting a single tile; both are ambient decoration, not "act here" CTAs, so this doesn't violate the rule's letter — left as-is by design judgment, not re-opened as a defect.
4. **Missing school context on Bag/Checkout** — confirmed working exactly as designed, live-tested with real baskets: a single-school basket shows "Shopping for Demo Sunrise Public School" on both Bag and Checkout; a mixed basket (one school-exclusive + one generic item) and a two-different-schools basket both correctly show nothing, never guessing.
5. **`text-[11px]` type-ramp deviations** — confirmed gone; CLI detector scan of the customer-storefront scope returned 0 findings (down from 2), and a full-repo sanity scan found only out-of-scope admin-panel/global-error/icon findings, none newly introduced.

## What's Working (confirmed this pass)

1. The 5 fixes are real engineering, not surface-level — `getBasketSchoolContext()`'s "only when every line traces to the same school" rule and `pickBrowseFallbackCategory()`'s graceful multi-level fallback were both independently verified live, including edge cases (renamed category, hidden category, mixed-school basket).
2. Error/edge-case handling in Bag and Checkout remains unusually mature — deactivated variants, stock drops, price changes, and stale delivery quotes are all still explicitly modeled with specific, non-generic copy.
3. The placeholder-image fallback is confirmed genuinely gapless — zero broken-image icons rendered anywhere despite known-missing seed assets; every failure correctly swaps to the category-icon placeholder pattern.

## New Findings From This Pass — all fixed immediately, same pass

**[P2] Loading-skeleton/real-grid mismatch causing real layout shift — FIXED.** `[categorySlug]/loading.tsx` and `search/loading.tsx` had drifted to a different column count (`sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4`, `rounded-2xl`/`p-4`/`aspect-4/3` cards) than the real `CategoryProductGrid` (`grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5`, compact `rounded-xl`/`aspect-square` `ProductCard`s) — every category/search page load reflowed at every breakpoint. `product/[slug]/loading.tsx` was also `max-w-4xl` against the real page's `max-w-5xl`. All three now match their real counterparts' container width and grid classes exactly.

**[P2] No school-search affordance in the header between 768–1023px — FIXED.** The compact header search was `hidden ... lg:flex` (≥1024px only) while the mobile hamburger (containing the same search) was `md:hidden` (hidden ≥768px) — a genuine dead zone on tablet-width viewports where the storefront's core "search your school" action had no header entry point at all. Changed the search wrapper to `md:flex` (matching the category nav's own breakpoint) with a `min-w-40` floor so it degrades by letting the category nav's pre-existing `overflow-x-auto` scroll, rather than collapsing the search input to an unusable sliver — verified visually at 768/900/1023/1024px, no horizontal overflow at any of them.

**[P2] "Track Orders" link had no accessible name at the 640–767px band — FIXED.** Between `sm` (link becomes visible) and `md` (its text label appears), the link rendered with only an `aria-hidden` icon and no name at all. Added `aria-label="Track Orders"` to the `Link`, matching the pattern already used correctly on `BagLink`.

## Remaining, Deliberately Not Fixed This Pass

- **[P3] `BRAND.heritageLine` ("Serving local families for around 30 years") is defined but never rendered on the customer storefront** — only the more clinical "Backed by Milan Readymade & General Store and Shubham Vashtralaya" appears, in the footer's smallest text. This is a real trust-copy gap for a cash-only, no-account, no-payment-gateway site, but it's a content-placement decision (where and how to surface a brand claim), not a bug — left for the user to decide rather than unilaterally added.
- **[P3] No phone number or physical address anywhere in the customer-facing storefront.** Same reasoning — a deliberate content addition, not a narrow fix, left for the user.
- **Minor:** Bag's remove button has no undo step — low severity, a UX enhancement rather than a defect, left as-is given this pass's narrow scope.

## Persona Red Flags

**The skeptical/trust-first parent** (anonymous checkout, cash-on-delivery, no payment gateway): still has almost no way to verify this is a real, established local business before committing — no phone number, no address, heritage line unused. This is the one place where "polish" alone can't close the gap; it needs a content decision.

**The tablet-width shopper (768–1023px)**: previously lost the header's search entirely — now fixed and verified working with graceful nav-scroll degradation under space pressure.

**The keyboard/screen-reader user checking "Track Orders"**: previously hit a nameless link at one viewport band — now fixed with an explicit `aria-label`.

## Questions to Consider

- Now that the 5 originally-flagged issues are confirmed fixed and 3 more were caught and closed in the same pass, is surfacing the heritage line and a phone number worth a small, separate follow-up, given how directly they support this specific product's "trusted local store" positioning?
- The loading-skeleton drift happened silently over multiple phases despite a doc comment explicitly claiming parity — would it be worth a lint rule or shared constant so the real grid and its skeleton can't drift apart again?
