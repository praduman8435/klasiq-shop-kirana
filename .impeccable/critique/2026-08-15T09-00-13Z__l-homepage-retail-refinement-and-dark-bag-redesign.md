---
target: Final homepage retail refinement + dark Bag redesign
total_score: 33
max_score: 36
na_heuristics: 10
p0_count: 0
p1_count: 0
timestamp: 2026-08-15T09-00-13Z
slug: l-homepage-retail-refinement-and-dark-bag-redesign
---
Method: dual-agent (A: general-purpose design-review sub-agent · B: general-purpose detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Bag badge count, item-count line, and quantity `aria-live` region all update correctly. |
| 2 | Match Between System and Real World | 4 | "Your Bag," "Proceed to Checkout," "Continue shopping" all read naturally; ₹ formatting and pluralization correct. |
| 3 | User Control and Freedom | 4 (was 3) | A single-tap, icon-only remove action previously had no recovery path. Now shows a "Removed [item]. Undo" toast that re-adds the item via the same `addToBasket` action a customer already used to put it there — re-validates price/stock fresh, exactly like a new add. |
| 4 | Consistency and Standards | 4 (was 3) | Two seams closed this round: the mobile sticky bar and in-content "Proceed to Checkout" no longer show simultaneously (see Priority Issues), and the Bag's quantity stepper now matches the Product Detail page's exact `h-11`/`w-9` footprint instead of a shorter, inconsistent `size-10`. |
| 5 | Error Prevention | 3 | Stock/price-change/unavailable states handled inline; quantity clamped to stock. |
| 6 | Recognition Rather Than Recall | 4 | Everything needed to complete checkout is visible with no memorization required. |
| 7 | Flexibility and Efficiency of Use | 3 | Keyboard operable throughout; no bulk actions, proportionate to cart scale. |
| 8 | Aesthetic and Minimalist Design | 4 (was 3) | The one real ding — two red "Checkout"-labeled buttons simultaneously visible across ~85% of the page's scroll range, confirmed by both independent assessments and one exact scroll position where their bounding boxes literally overlapped — is fixed: the in-content button is now hidden below `sm`, leaving the sticky bar as the sole mobile checkout mechanism. |
| 9 | Help Users Recognize/Recover from Errors | 4 (was 3) | Every other line-item state (unavailable/exceeds-stock/price-changed) already got specific inline messaging; the one outlier — an irreversible remove with zero recovery — now gets the same care via the Undo toast. |
| 10 | Help and Documentation | n/a | Not applicable to a cart surface at this scope. |
| **Total** | | **33/36 (92%)** | **Excellent** |

## Design Specificity Verdict

**High, and measured, not assumed.** Both assessments independently confirmed — via computed style, not visual impression — that the homepage, PDP, and Bag wrapper elements render bit-for-bit identical `lab()` background/foreground values. This is one continuous design-system instance, not three components that merely look similar. The "no card-in-card" Bag structure is a genuine structural echo of the PDP's own stated precedent (computed `border-width: 0`, `background: transparent` on both the item list and the order-summary container, confirmed at both mobile and desktop), not a generic dark-mode skin over the old light layout.

## Overall Impression

Both the homepage simplification and the Bag redesign land exactly as intended: the hero is measurably lighter (verified: "Shop by category" now renders at y≈269-301px instead of the prior ~400px+, with nothing added back in place of the removed copy), and the Bag is a genuine dark-first cart that feels like the same product as the homepage and PDP rather than a bolted-on inversion. The one real defect this round's critique surfaced — a sustained, sometimes-overlapping duplicate checkout CTA — was found independently by both assessments with matching evidence, and is now fixed and reverified live.

## What's Working

1. **Cross-surface token fidelity, measured not assumed.** Identical computed `lab()` values across homepage/PDP/Bag wrappers, and the mobile nav drawer opened from `/bag` correctly carries its own `.dark` class through to a portaled dialog.
2. **The hero cut is precise.** No paragraph, no duplicate heading pair, and — critically — nothing was added back in their place; the removed-copy code comment's own claim ("nothing replaces the removed copy") was verified true against the live DOM.
3. **Graceful edge-case handling carried through.** A long product name wraps cleanly with zero overflow at 272px; a 3-item cart with a Low Stock item renders every state correctly at all seven required mobile viewports.

## Priority Issues Found This Round (fixed within it)

**[P2 — FIXED] Mobile sticky checkout bar and in-content "Proceed to Checkout" were simultaneously visible, and briefly overlapped.** Both assessments independently found this: a scroll-position sweep at 294x584 with a multi-item cart showed both CTAs visible together across roughly 85% of the scrollable range, with one exact scroll position where their bounding boxes literally intersected (the fixed bar's `z-40` stacking sat on top of the in-content button there) — visible even without any scrolling at all on a standard 390x844 viewport with 3 items. Fixed by hiding the in-content "Proceed to Checkout" below `sm`, mirroring the Product Detail page's own established precedent for the identical class of problem; "Continue shopping" stays visible everywhere since it isn't duplicated anywhere else. Reverified via an automated scroll sweep (every 100px from 0 to full document height): zero scroll positions now show more than one checkout-labeled control on screen.

**[P2 — FIXED] Destructive remove had no confirmation or undo.** A single-tap, icon-only action sitting directly beside the quantity stepper permanently removed an item with zero recovery path — an outlier given how much inline care the rest of this component already puts into unavailable/exceeds-stock/price-changed messaging. Fixed with a "Removed [item]. Undo" toast; clicking Undo re-adds the item via the same `addToBasket` server action already used for every other add, so price/stock re-validate fresh rather than trusting stale client state. Reverified end-to-end: remove → toast with visible Undo action → click → item restored, confirmed via page reload.

**[P3 — FIXED] Bag's quantity-stepper buttons were a different footprint than the Product Detail page's identical control.** Measured: Bag's `size-10` (40×40px) vs. PDP's `h-11 w-9` (44px tall) — the one place the "same product" feeling had a measurable seam. Standardized the Bag's stepper (and bumped the remove button to `size-11`) to match PDP exactly.

**[P3 — investigated, not changed] Focus-ring opacity on Bag's new focus-visible states.** One assessment measured the ring at ~22.5% opacity and flagged it as comparatively faint. On investigation this is the exact same `focus-visible:ring-3 ring-ring/50` recipe already used system-wide (the shared `Button` component, the PDP's own controls) — not a defect introduced this round, and changing it here alone would create a NEW inconsistency rather than fix one. Left as-is; the system-wide ring treatment is a separate, out-of-scope question if the team ever wants to revisit it everywhere at once.

## Persona Red Flags

**Casey (distracted, thumb-only, buying 2-3 items right now):** no blocking issues; item → bag → checkout is fast and thumb-reachable. The soft flag from the pre-fix dual-CTA moment (two similarly-styled red buttons within a second of scrolling, which could read as "did I already tap something?") is resolved.

**Riley (deliberate stress-tester):** long product names, a 3+ item cart, and Bag→Checkout→browser-back all held up cleanly (cart state survived real back-navigation intact). The one thing Riley would have flagged as inconsistent with the rest of this surface's evident care — an unrecoverable remove — is now consistent with it.

## Minor Observations

- Header/nav overflow at exactly 768px width is pre-existing on `/` and unrelated to either change this round — out of scope, not touched.
- The mobile nav drawer's `bg-popover` tone on `/bag` is intentionally a shade lighter than the base `bg-background` — a deliberate token distinction, not a bug.
- Both `/bag` empty and populated states, and `/checkout` (deliberately left on the original light theme per this round's explicit scope boundary), were independently confirmed correct.

## Questions to Consider

- Now that Bag and PDP share an identical stepper footprint, is it worth extracting a shared `QuantityStepper` component so a future change to one can't silently drift from the other again?
- The system-wide `ring-ring/50` focus treatment reads faint on the darkest surfaces specifically (near-black background) — worth a dedicated, standalone contrast pass across every dark-route control at once, rather than adjusting it piecemeal per component.
