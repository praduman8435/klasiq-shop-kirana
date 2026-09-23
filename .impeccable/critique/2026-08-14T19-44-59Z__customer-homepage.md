---
target: customer homepage
total_score: 27
max_score: 32
na_heuristics: 7,10
p0_count: 0
p1_count: 0
timestamp: 2026-08-14T19-44-59Z
slug: customer-homepage
---
Method: dual-agent (A: aadc23f0ac855ae70 · B: a7a1515e123a880af)

First critique of the just-redesigned customer homepage (dark-first, compact, editorial). Both assessments independently found the redesign structurally disciplined (contrast-verified text colors, real product data, correctly-scoped theming) but surfaced a genuine gap between the stated "premium tonal hierarchy" intent and the shipped tokens, plus one real WCAG failure. All findings were fixed in this same pass.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Search shows a loading spinner; hover feedback on dark chips was nearly invisible before the tonal-ramp fix (see P1). |
| 2 | Match Between System and Real World | 4 | Plain retail language ("Shop by school," "Shop the essentials"). |
| 3 | User Control and Freedom | 3 | "Shop all" escape hatch present; no rail-scroll affordance indicator. |
| 4 | Consistency and Standards | 3 | Chip rail/product card follow the established rounded vocabulary; the hero's decorative glow was a pattern used nowhere else (fixed, see P3). |
| 5 | Error Prevention | 4 | Out-of-stock variants disabled + labeled, never silently hidden. |
| 6 | Recognition Rather Than Recall | 4 | Category icons + names, visible stock/price on every card. |
| 7 | Flexibility and Efficiency of Use | n/a | No power-user surface to evaluate on a persuade-mode homepage. |
| 8 | Aesthetic and Minimalist Design | 3 | Genuinely more minimal than the old 5-card layout; the flat tonal ramp undercut the "intentional" read before the fix. |
| 9 | Error Recovery | 3 | "No schools found" fallback exists; no other error states on this page. |
| 10 | Help and Documentation | n/a | Not expected on a persuade-mode marketing homepage. |
| **Total** | | **27/32** | **Good** |

## Design Specificity Verdict

The redesign is structurally disciplined, not decorative: text contrast is genuinely computed and passes AA throughout (17.5:1 body text, 6.8:1+ muted text), the One Red Rule and Gold Is Rare Rule are enforced in code (not just claimed), and the "Shop the essentials" section uses real, category-diversified database products rather than a decorative placeholder grid. But the first pass's dark tokens didn't deliver the "near-black → surface → elevated → border" hierarchy the design intended — card-vs-background and muted-vs-card were nearly indistinguishable, meaning elevation was being carried entirely by a thin translucent border rather than any real tonal step, and hover states on dark surfaces were close to invisible. The hero's two-blob glow decoration also read as a generic dark-SaaS-landing-page trope rather than something distinctly Klasiq's.

## Priority Issues — all fixed in this same pass

**[P1] Dark tonal hierarchy was nearly flat at the token level — FIXED.** `card` vs `background` measured ~1.09:1, `muted` vs `card` ~1.02:1 — visually indistinguishable fills, with `muted` even sitting slightly lighter than `card` (backwards from the usual recessed/raised convention). Rebuilt the ramp with real ~0.05-0.06 lightness steps and corrected the ordering: `background(0.13) < muted(0.17) < card(0.20) < secondary(0.23) < popover(0.25)`. Verified live: product cards and the header/footer now read as genuinely distinct surfaces against the page background, not a flat black box with outlines.

**[P2] Signature category chip's text contrast failed WCAG AA — FIXED.** The translucent `bg-primary/10 text-primary` treatment measured 3.63:1 (fails the 4.5:1 minimum for normal-size text) once properly alpha-composited against its actual dark backdrop. Switched to a solid `bg-primary text-primary-foreground` fill — the same "active state" recipe already established elsewhere in the system (the checkout fulfillment tabs) — verified live at 4.85:1, passing AA.

**[P2] Category rail touch targets sat at 34-38px — FIXED.** Bumped chip padding from `px-3.5 py-2` to `px-4 py-2.5`, closer to the 40-42px range, on this specific new homepage-only component (left `ProductCard`'s own established, previously-validated 36px controls untouched, since those are shared sitewide and were already accepted in an earlier critique pass).

**[P3] Hero's two-color glow decoration read as a generic dark-SaaS template pattern — FIXED.** Removed the primary-colored blob (which also stacked a second, non-CTA red instance on top of the signature chip) and replaced the two-blob composition with a single, softer gold glow centered behind the eyebrow badge — reads as a deliberate spotlight rather than a borrowed landing-page trope, and keeps gold's total appearances on the page at exactly one (down from two counting the removed blob, still within "Gold Is Rare").

**[P3] `muted` was lighter than `card`, inverted from the usual convention** — resolved as part of the P1 ramp rebuild.

## What's Working

1. Text contrast is genuinely computed and verified, not assumed — every text/background pairing checked passes AA, several by a wide margin.
2. The One Red Rule and Gold Is Rare Rule are enforced structurally, not just asserted: exactly one signature red chip (CTA meaning shared identically across the 5 repeated Add buttons, not a rule violation) and, after the fix, exactly one gold appearance.
3. Real, category-diversified product data powers the "Shop the essentials" section — a substantive decision, not a decorative placeholder.

## Route Isolation — confirmed clean

`/uniforms`, `/bag`, and `/checkout` all confirmed to have zero `.dark` ancestor and an unchanged light `background-color` — the homepage's dark theme has zero leakage onto any other route.

## Minor Observations

- Hero subcopy nearly duplicates the footer/meta description verbatim — not wrong, but a missed opportunity for the hero to say something distinct.
- `pickBrowseFallbackCategory` (used to choose the one "signature" red chip) is a heuristic, not a curated choice — worth confirming with the business that whichever category it lands on is actually the intended "hero" category.
- The gold hero badge copy ("Trusted local retail") is generic enough it could belong to any local retailer — given the brand's specific differentiator is the school-fit guarantee, this is a candidate for a future, more specific line, not a defect.

## Questions to Consider

- Now that the tonal ramp actually delivers visible elevation, does the page still feel appropriately "flat and controlled" per the Flat-By-Default Rule, or does it need a second look once real product photography replaces the placeholder pattern?
- Is the heuristically-chosen "signature" category the one the business actually wants highlighted in red on the homepage, or should this become an explicit admin-configurable choice?
