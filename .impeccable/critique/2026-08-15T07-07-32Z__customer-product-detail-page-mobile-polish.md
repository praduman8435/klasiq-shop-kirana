---
target: Product Detail Page mobile responsive polish
total_score: 35
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-15T07-07-32Z
slug: customer-product-detail-page-mobile-polish
---
Method: dual-agent (A: general-purpose design-review sub-agent · B: general-purpose detector/browser-evidence sub-agent)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Toast + inline "Added"/"Adding…" states + live quantity region are strong; nothing new this round moved this. |
| 2 | Match Between System and Real World | 4 | ₹ currency, plain stock labels, "Pay at store or cash on delivery" — unchanged, still excellent. |
| 3 | User Control and Freedom | 3 | Free size/quantity changes, arrow-key size nav; no quick "view bag" link from the inline success state. |
| 4 | Consistency and Standards | 4 (was 3) | Mobile sticky bar's success state previously showed a raw "Added ✓" text glyph while the desktop button used a proper `aria-hidden` icon — now both use the identical `<Check aria-hidden />` + "Added" pattern. Fixed and reconfirmed live. |
| 5 | Error Prevention | 3 | Quantity clamped via disabled +/- at bounds; out-of-stock sizes remain selectable (pre-existing, not this round). |
| 6 | Recognition Rather Than Recall | 4 | Price always visible in the sticky bar; the size row's scroll-affordance fade (new this round) makes "more sizes exist" recognizable rather than a matter of accidental pixel math. |
| 7 | Flexibility and Efficiency of Use | 4 | Arrow-key size nav, horizontally-swipeable size row, single unambiguous mobile purchase mechanism. |
| 8 | Aesthetic and Minimalist Design | 4 | Tight adherence to DESIGN.md's dark, hairline-divided, single-accent system; shorter mobile image ratio reads as intentional, not cropped. |
| 9 | Error Recovery | 3 | Inline `role="alert"` + toast pattern (from an earlier round) verified still present; the live network-failure path wasn't re-exercised this round (already verified in the prior PDP critique cycle). |
| 10 | Help and Documentation | 3 | N/A-appropriate for this surface; fulfillment list provides sufficient context. |
| **Total** | | **35/40** | **Good** |

## Design Specificity Verdict

**High, and specifically now mobile-considered rather than mobile-shrunk.** Both independent assessments confirmed the mobile composition reads as intentionally designed: a shorter 4:3 image (not a squeezed desktop square), a single unambiguous purchase mechanism (the sticky bar), and a size selector that scrolls within itself rather than wrapping or forcing page-level overflow. Deterministic scan (`detect.mjs`) returned zero findings against all three touched files, both before and after the two post-critique fixes.

## Overall Impression

This round found and fixed four genuine, evidence-confirmed bugs (duplicate mobile purchase actions, oversized mobile image, wrapping size selector reintroducing page overflow, and a mobile-nav dark-theme portal leak), then the critique itself surfaced two further real, smaller issues — one accessibility inconsistency and one missing discoverability cue — both fixed and reverified live in the same round.

## What's Working

1. **The duplicate-button fix is genuinely structural, not cosmetic.** Verified via computed `display` (not just screenshots) at every tested width including the exact `sm` breakpoint boundary (640px): the in-page pair and the sticky bar are never both visible at once, at any width from 272px to 1440px.
2. **The `<fieldset>` overflow regression was caught and correctly root-caused.** An initial attempt at the size-selector scroll fix accidentally reintroduced page-level horizontal overflow on high-variant products, because `<fieldset>` carries a browser-default `min-width: min-content` that ordinary flex/grid `min-width:0` overrides on ancestors don't reach. Both assessments independently confirmed the real fix (`min-w-0` directly on the `<fieldset>`) resolves this at the DOM level, not just visually.
3. **The mobile-nav dark-theme fix reuses a single source of truth.** Rather than duplicating "which routes are dark" logic, `MobileNav` now imports the same `isDarkRoute()` function `RouteThemeScope` already uses — verified correct in both directions (dark on `/product/[slug]`, light on `/uniforms`).

## Priority Issues (found by this critique round, fixed within it)

**[P1 — FIXED] Size-selector scroll affordance was invisible, dependent on accidental pixel math.** At some viewport widths the visible size pills happened to end flush with the container's clipped edge, giving zero visual cue that more sizes existed past it — a shopper could easily miss carried sizes. Fixed by adding a trailing edge-fade (`bg-gradient-to-l from-background to-transparent`), rendered only when the row's own `scrollWidth` exceeds its `clientWidth` (tracked via `ResizeObserver`, not a fixed viewport-width guess). Reverified live: absent on the 3-variant product (nothing to scroll to), present on the 8-variant product.

**[P2 — FIXED] Inconsistent, screen-reader-unfriendly success-state between the two Add to Bag implementations.** The desktop inline button already rendered a proper `<Check aria-hidden />` icon plus "Added" text; the mobile sticky bar — the sole purchase mechanism on mobile — rendered the literal string `"Added ✓"` with the glyph exposed directly in the accessible text, which screen readers commonly vocalize as "check mark." Fixed by reusing the identical icon+text pattern in the sticky bar. Reverified: the button's accessible text is now exactly "Added," with no raw glyph.

**[P3 — not fixed, pre-existing, out of this round's scope] Out-of-stock sizes remain selectable via click and arrow-key nav.** Selecting one correctly disables the purchase buttons, so it's not a functional bug, but there's no distinct disabled/error affordance beyond dimming + a label suffix. This predates the current mobile-polish round; noted as a documented remaining limitation, not fixed here to keep this pass scoped to mobile responsiveness.

**[P3 — not fixed, no confirmed failure] Sticky-bar content is measured tight at 272px** (~245px of content within ~240px available) with no dedicated test under OS-level text-size scaling (200% zoom). Not observed to break in this round's testing; flagged as a follow-up worth a dedicated zoom-specific test, not treated as a confirmed defect.

## Persona Red Flags

**Casey (distracted, thumb-only mobile shopper)**: price + both purchase actions are always reachable in the sticky bar without scrolling; the new size-row fade means she'll now notice when a product carries more sizes than fit on screen, rather than assuming it doesn't.

**Sam (accessibility-dependent, keyboard/screen-reader user)**: roving-tabindex and arrow-key navigation on the size selector confirmed correct end-to-end, including scrolling the focused option into view on an 8-variant product. The one real friction point this round found — the mobile-only "Added ✓" glyph exposed to the accessibility tree, on the one page where Sam has no alternate desktop button to fall back to — is now fixed.

## Minor Observations

- The sticky purchase bar remains fixed and visible while scrolling through the unrelated global site footer — a widely-accepted mobile-commerce pattern, not a defect.
- Focus rings on size pills are clearly legible against the dark surface at every tested width.
- The `<fieldset>` `min-width: min-content` gotcha is now documented inline in the component's own code comment, so a future contributor extending this pattern elsewhere won't rediscover it the hard way.

## Questions to Consider

- Now that the mobile sticky bar is the PDP's sole mobile purchase mechanism, is it worth formalizing as a named, reusable DESIGN.md pattern for any future purchase-style mobile surface, rather than living only in this one component?
- Should the size-row's scroll-affordance fade become a shared utility (a small hook or component) given any future horizontally-scrolling selector — sizes, colors, variants — would benefit from the identical cue?
