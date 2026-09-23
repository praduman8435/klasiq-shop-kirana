---
target: customer storefront
total_score: 31
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 0
timestamp: 2026-08-14T19-10-10Z
slug: customer-storefront
---
Method: dual-agent (A: a149705a9b2166b4b · B: a5f7f22a43f6c88dc)

Follow-up to the full-journey critique that scored 28/40 and found 5 issues (1 P0, 2 P1, 1 P2, 1 P3), all just fixed. Both assessments independently re-verified the current state from scratch (not a diff review) and additionally confirmed, with live-rendered evidence and file:line citations, that all 5 fixes are genuinely landed with no regressions.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | OTP flow, tracking timeline, and checkout blocking-issue banner all give clear real-time feedback. |
| 2 | Match Between System and Real World | 3 | Plain retail language throughout; the phone number displays as raw unformatted digits rather than a locally-conventional grouping. |
| 3 | User Control and Freedom | 3 | Good exits and OTP resend/change-number controls; no self-service order-cancellation path anywhere (see P2 below). |
| 4 | Consistency and Standards | 4 | `STORE_CONTACT` is a single source of truth reused identically (same values, same link attributes) across all 5 surfaces — verified byte-for-byte matching. |
| 5 | Error Prevention | 3 | Checkout blocks on stock issues before the form renders; proactive geoapify-down and stock-drop handling. |
| 6 | Recognition Rather Than Recall | 3 | Labels accompany icons almost everywhere; "Track Orders" drops to icon-only with no visible label between `sm` and `md`. |
| 7 | Flexibility and Efficiency of Use | 2 | A deliberately single, linear path — appropriate for the audience, but no shortcuts or saved-details reuse. |
| 8 | Aesthetic and Minimalist Design | 4 | The order-detail hierarchy fix gives that page an actual focal point it lacked before; flat-card discipline holds throughout. |
| 9 | Error Recovery | 4 | The generic error page is now a complete, non-dead-end recovery path (message + reference code + retry/home + a real phone number). |
| 10 | Help and Documentation | 2 | Still no FAQ/help center — fine for a shop this size, but genuinely thin by the rubric's own definition. |
| **Total** | | **31/40** | **Good** (up from 28/40) |

Heuristics that actually moved: #1 (WhatsApp confirmation closes an open question at the highest-stakes moment), #8 (order-detail hierarchy fix), #9 (the error-recovery loop is now genuinely complete, not just well-worded).

## Verification of the 5 Fixes — all CONFIRMED, zero regressions

1. **Store contact info (`STORE_CONTACT`)** — confirmed present and byte-identical across the footer, checkout's Store Pickup note and Local-Delivery geoapify-down warning, the order-confirmation page, and the order-detail page. Both assessments independently verified the exact same phone number and Maps URL (with `target="_blank" rel="noopener noreferrer"`) at every location, live-rendered, with no horizontal overflow or text wrapping at 390px.
2. **Save-link callout** — confirmed positioned above the Items card (measured: callout top 313px vs. Items top 435px on desktop), uses the accent/gold token distinctly from surrounding cards, and the old bottom-of-page duplicate sentence is confirmed fully removed (exactly one occurrence of "Save this page" in the entire rendered page and the entire codebase).
3. **WhatsApp confirmation line** — confirmed correctly conditional; live-tested against a real order with an empty-string `customerWhatsapp` value and confirmed it correctly renders nothing rather than broken copy ("We'll send updates to WhatsApp at ."). This is exactly the kind of edge case that's easy to miss and it holds.
4. **Order-detail hierarchy** — confirmed only the "Order Status" section received the `bg-secondary/30` + `text-lg` treatment; no other section was accidentally elevated or lost its own styling.
5. **Error page contact** — confirmed present and consistent with the same `STORE_CONTACT` pattern.

## Design Specificity Verdict

Still genuinely authored for this business, not a generic template — the real phone number and real Maps pin, tied to the actual named store, is exactly the "genuine local-trust asset" the brand brief calls for. One thing worth naming: gold/accent now marks three different kinds of moment across the journey (the homepage trust badge, the school page's demo-school disclaimer, and the new save-link callout). None collide on-screen today, but it's a quiet drift away from "one deliberate highlight" worth watching as more gold moments potentially get added later.

## What's Working

1. Defensive conditional rendering on the WhatsApp line was verified live against a real empty-value edge case and holds correctly — not just claimed, actually tested.
2. Checkout's non-happy-path states remain unusually complete (empty-bag-but-already-converted redirect, explicit "nothing has been changed for you" reassurance on stock blocks).
3. The order-detail hierarchy fix measurably improved the peak-end arc: the page now has a clear "you've arrived" moment instead of 7 co-equal cards.

## Remaining Issues

**[P2] No self-service order cancellation anywhere in the customer portal.** The tracking timeline knows how to *display* a cancelled state but nothing lets a customer trigger one, and no copy anywhere frames the new phone number as usable for that purpose (it's only ever framed as "call to arrange delivery" or "call to collect"). Lower-stakes than the original P0 (this is COD, not a paid order), but a real, still-open user-control gap.
Suggested command: `/impeccable clarify`

**[P3] Gold/accent is drifting from "one deliberate highlight" toward a general-purpose notice tint**, now used for 3 unrelated things across the journey (trust badge, demo disclaimer, save-link callout).
Suggested command: `/impeccable polish`

**[P3] The phone number displays as raw unformatted digits everywhere** (`8542843482`) rather than a locally-conventional grouping (e.g. `85428 43482`) — reads less like a real, memorable number.
Suggested command: `/impeccable clarify`

No P0 or P1 remain. Also noted, not new: `/track`'s cold-state has two near-duplicate intro sentences (word order swapped) — confirmed still present from before, not part of this round's scope; and the storefront-wide 404 page doesn't carry a phone number the way `error.tsx` now does, a minor inconsistency in the "always leave a way to reach a human" pattern. The CLI detector's two pre-existing findings (`src/components/ui/button.tsx`, `src/server/commerce/invoice-pdf.ts`) are unchanged from the prior pass — not touched by this round's fixes, not new.

## Persona Red Flags

**Jordan (first-timer)**: mostly resolved now — the confirmation page proactively answers "will they text me?" and "how do I get back here?" before having to ask. One gap remains: if an OTP never arrives, the `/track` phone-entry screen itself has no "or call us" fallback, unlike checkout/confirmation/error which all got the phone-number fix.

**Casey (distracted mobile)**: the bookmark callout is a genuine, measured win — someone closing the tab on a bus now gets an explicit, visually distinct save-the-link instruction before the moment passes, not a footnote already scrolled past.

**Riley (stress tester)**: probed the empty-`customerWhatsapp` edge case specifically — it holds correctly, and the pre-existing "Guest customer" fallback for empty name/mobile also holds.

## Questions to Consider

- Should "call the store" be framed as usable for order changes/cancellation, or is that intentionally not the design (i.e., silent-until-ready is the model)?
- Now that gold marks three different kinds of moment, is a second reserved color worth considering before a fourth gets added?
- Should `/track`'s phone-entry screen get the same "or call us" fallback the other four surfaces just did?
