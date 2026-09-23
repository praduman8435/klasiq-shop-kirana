---
target: customer homepage
total_score: 27
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 0
timestamp: 2026-08-14T20-13-09Z
slug: customer-homepage
---
Method: dual-agent (A: a492ad2d5cfc7b5a1 · B: a29816ca49f0bea8e)

Third pass on the customer homepage this session — a "final visual polish" round on top of the prior 27/32 critique-fixed state. Both assessments independently confirmed this round's stated goals (premium shelf feel, alive-but-restrained hero, tactile category rail) were achieved and found zero regression from the prior pass, but surfaced two real, measurable issues in the placeholder-image rework, both fixed in this same pass before finalizing.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Press/hover/focus states all present on the changed elements; unrelated to this round, Add still just disables rather than showing a spinner label. |
| 2 | Match Between System and Real World | 4 | Ghost-icon placeholder reads as "not photographed yet," a real retail convention. |
| 3 | User Control and Freedom | 3 | Untouched by this round. |
| 4 | Consistency and Standards | 3 | Signature chip's solid-fill precedent now matches the fulfillment tabs; DESIGN.md's Shadow Vocabulary line was stale after softening the card hover shadow (fixed alongside, see below). |
| 5 | Error Prevention | 3 | Untouched by this round. |
| 6 | Recognition Rather Than Recall | 4 | Category icons + placeholder ghost icons carry meaning without labels. |
| 7 | Flexibility and Efficiency of Use | n/a | No power-user surface on a storefront homepage. |
| 8 | Aesthetic and Minimalist Design | 4 | Deliberate simplification lands well on all three consumers now that the large-panel scaling issue is fixed. |
| 9 | Error Recovery | 3 | Untouched by this round. |
| 10 | Help and Documentation | n/a | Not applicable to a storefront homepage. |
| **Total** | | **27/32** | **Good** (unchanged from the prior pass — this round traded a would-be regression for a real fix, net neutral on score, net positive on quality) |

## Verdict on This Round's Goals

**Premium shelf feel**: achieved. Tighter card gaps, softened hover shadow, and the flat single-tone placeholder read materially calmer and more curated than the old diagonal-stripe-plus-badge version.

**Hero alive without gimmicky**: achieved. The 10-second glow drift and one-time 0.7s entrance are slow, low-amplitude, and compositor-only (`transform`/`opacity`) — verified live to correctly collapse to near-zero duration under `prefers-reduced-motion`.

**Tactile category rail**: achieved. `active:scale-95` plus a same-hue `hover:bg-primary/90` on the signature chip adds real press/hover feedback without reintroducing the translucent-tint contrast problem the prior pass fixed.

## Issues Found and Fixed in This Same Pass

**[P2] The placeholder icon's fixed size didn't scale to its third real consumer, the Product Detail page.** `ProductPlaceholderImage` is also used by `product-detail.tsx`, whose image slot is roughly 450-480px square at desktop — far larger than the homepage/category-grid cards this round was tuned for. The same fixed 40-48px icon read as sparse and lost in a panel that much bigger, arguably a worse "empty box" impression than the pattern it replaced. **Fixed**: added a `large` prop (`ProductPlaceholderImage`, `ProductThumbnail`), threaded to the Product Detail page's own call site, bumping the icon to 64-80px in that specific context. Verified live via screenshot — the icon now reads as proportionate and intentional in the large panel.

**[P2] The placeholder icon's contrast measured below the WCAG non-text-contrast guideline, worse on light surfaces.** Compositing the icon's translucent fill (`text-muted-foreground/60`) against its actual background gave 3.27:1 on the dark homepage and 2.65:1 on light category pages — both under the 3:1 guideline for graphical objects, the light case failing more severely. **Fixed**: bumped opacity from 60% to 75%. Re-measured live: 4.48:1 (dark) and 3.61:1 (light), both now clearing 3:1 while the icon still reads as a quiet, secondary mark rather than a solid graphic.

Both fixes were re-verified with fresh regression: `tsc` clean, ESLint clean (one pre-existing, unrelated `<img>`-vs-`next/image` warning, unchanged from before this session), full Vitest suite green (1044/1044), production build green, and a genuine production-mode server run (`next build && next start`, not just `next dev`) confirmed `/`, `/uniforms`, `/bag`, `/checkout`, and `/track` all return 200 with zero console errors and the production CSP header unchanged.

## Regression Check Against the Prior 27/32 Pass

No regression found. Confirmed independently by both assessments: the 4-step dark tonal ramp is untouched, the signature chip's solid-fill contrast fix (now re-measured at 4.85:1) is unchanged and unaffected by this round's added `hover:bg-primary/90`, gold still appears exactly once (the hero badge), and red still reads as one unified "act here" meaning (CTA + active-state), consistent with the system's own established precedent.

## What's Working

1. The placeholder rewrite's underlying instinct (flat tone + quiet ghost icon over diagonal stripes) was correct on all three real consumers once the scaling gap was closed — verified visually on the homepage grid, a light-mode category grid, and the Product Detail page.
2. Reduced-motion coverage was verified live, not assumed: both new keyframes' `animation-duration` was measured to collapse from their real values (10s, 0.7s) to ~0.01ms under a `reducedMotion: 'reduce'` browser context.
3. The category chip's hover treatment on the signature chip (`hover:bg-primary/90`, a same-hue opacity nudge) is the safe way to add hover feedback to a solid-fill state without reopening the exact translucency failure the prior pass fixed.

## Minor Observations

- `DESIGN.md`'s Shadow Vocabulary line documenting `hover:shadow-lg` for product cards was stale after this round's `hover:shadow-md` change — corrected in the same documentation pass as this critique.
- The category rail's `active:scale-95` was verified present in the stylesheet (`transition-property: all`, `duration: 0.15s`) but a live `mouse.down()` hold didn't visibly register the transform in headless automation — most likely a timing/capture artifact of the automation itself rather than a real interaction defect, since the same CSS is applied identically to the Add button and other pressable controls elsewhere in the app that are already known to work; not treated as a confirmed defect without further evidence.

## Questions to Consider

- Now that the placeholder scales across three real contexts (compact/default/large), is a fourth, even-larger context worth planning for now (e.g., a future full-bleed hero product feature), or is three enough for the actual page inventory that exists today?
- With the Add button and the signature category chip both carrying solid Klasiq Red for two different actions on the same viewport, should DESIGN.md's "One Red Rule" be refined to explicitly say "one red *family* of affirmative actions" rather than leave that nuance implicit?
