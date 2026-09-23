---
target: customer storefront
total_score: 28
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
timestamp: 2026-08-14T18-46-47Z
slug: customer-storefront
---
Method: dual-agent (A: a5f9bd6702af3def6 · B: ab84c543cbe4e462a)

This run broadens scope beyond the two prior critiques (28/36, then 31/36 after fixes — both focused on discovery→checkout). This pass covers the **entire** customer journey: homepage through checkout, plus order confirmation, account-less OTP order tracking, order history/detail, invoice, and return/exchange. Note on scoring: this run scores all 10 Nielsen heuristics (none marked n/a), where the two prior runs marked heuristic 10 n/a — the broader scope now surfaces a genuine, concrete Help-and-Documentation gap (see P0 below) that the narrower shopping-only scope didn't expose. The totals below are **not directly comparable** to the prior /36 scores; read the trend line at the bottom accordingly.

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|-----------|-------|-----------|
| 1 | Visibility of System Status | 3 | Good coverage (OTP resend countdown, `aria-live` steppers, tracking timeline) but delivery fee shows a bare "—" with no explanation while pending. |
| 2 | Match Between System and Real World | 3 | Plain, correct commerce language, but "Collect from: Milan Readymade & General Store" with no address breaks real-world match — a name alone isn't actionable. |
| 3 | User Control and Freedom | 3 | Good exits throughout (OTP "change number," "go back to your bag"); the invoice route's no-session redirect loses the specific order context. |
| 4 | Consistency and Standards | 4 | Pill-shaped selectors now genuinely unified across size pickers, fulfillment tabs, gender/class tabs, and return-type toggle — the strongest heuristic in the app. |
| 5 | Error Prevention | 3 | Checkout blocks on stock issues before the form renders; nothing prevents a customer choosing Store Pickup without ever learning where "the store" is. |
| 6 | Recognition Rather Than Recall | 2 | OTP recovery has no fallback if the customer forgets which number they used; the confirmation page's one unrecoverable-consequence sentence is easy to miss. |
| 7 | Flexibility and Efficiency of Use | 3 | Default-variant selection, idempotency keys, Buy-Now/Add-to-Bag duality are solid; no "remember this device" shortcut (plausibly a deliberate security tradeoff, not a gap). |
| 8 | Aesthetic and Minimalist Design | 3 | Shopping surfaces are clean and disciplined; the order-detail page stacks ~7 co-equal card sections with no visual priority. |
| 9 | Help Users Recognize/Diagnose/Recover from Errors | 3 | Stock issues, OTP wrong-code, stale delivery quotes all get specific, actionable copy; the generic error page is the exception (see P0/P3). |
| 10 | Help and Documentation | 1 | No help/FAQ/contact surface anywhere in the journey — "call us" and "contact support" are both instructions with nothing behind them to call or contact. |
| **Total** | | **28/40** | **Good** (70% — just inside the band; the P0 below matters more than the aggregate number) |

## Design Specificity Verdict

**The shopping path is genuinely authored; the post-purchase trust surfaces are not, and that's exactly backwards for this business.** The hero's ink/red/gold restraint, the school-specific "Recommended Complete Uniform" set card, and the demo-school disclosure badge all show real domain thinking. But the surfaces that should carry "decades-old family-run store you can trust" hardest — order confirmation, pickup instructions, the error page — read as generic transactional boilerplate, and in one case actively over-promise: the delivery note says **"choose Store Pickup, or call us"** and the order-detail page says **"Collect from: Milan Readymade & General Store"** with no phone number or address anywhere in the customer-facing app to act on either instruction. `BRAND.heritageLine` remains defined and unused (confirmed again, unchanged from the prior critique). The invoice — the one artifact a customer might print and keep — carries the brand wordmark and tagline but no store address or phone, despite the exact coordinates (`FULFILLMENT_CONFIG.shopLatitude/shopLongitude`) already existing server-side for delivery-radius calculations. The generic `error.tsx` tells a customer to "contact Klasiq support" with no channel given anywhere in the app. For an anonymous, cash-only, no-payment-gateway business whose entire trust model depends on being a real, reachable, physical local store, this is the single most consequential specificity gap in the app.

## Overall Impression

The commerce mechanics (stock/price/quantity handling, checkout blocking, OTP, returns) are unusually mature and consistent — this is a well-engineered system. The gap is almost entirely in the moments that should carry brand trust: nothing in the customer-facing app tells a person how to reach or find the physical store the whole positioning rests on. That's the fix that matters most here, more than any visual polish.

## What's Working

1. **Component-and-rule discipline.** ProductCard/ProductDetail deliberately share one interaction model, and the fulfillment/return/gender selectors all reuse one pill-tab pattern — confirmed genuinely unified this pass, not just claimed.
2. **The Return/Exchange flow is the most emotionally honest surface in the app.** Explicit, non-defensive copy about approval uncertainty ("We can't promise it will be approved, but you can check its status here anytime"), IDOR-safe not-found parity, and eligibility explanations that don't oversell — closer to the brand's stated tone than the order-confirmation page is.
3. **COD-only checkout removes the single biggest anxiety in anonymous e-commerce.** No payment gateway to distrust, explicit "Pay in cash when you collect" — the best-matched design decision to the actual business model in the whole app.

## Priority Issues

**[P0] The app instructs customers to "call us" and "collect at the store" but provides no phone number, address, or map link anywhere.**
Why it matters: `fulfillment-config.ts:69` ("call us"), the order-confirmation page ("Bring this order number when you collect your order at the store"), and the order-detail page ("Collect from: Milan Readymade & General Store") are all instructions a customer has no way to follow — verified by direct grep, there is no phone number constant anywhere in the codebase, and the store's exact coordinates (`FULFILLMENT_CONFIG.shopLatitude`/`shopLongitude`) already exist server-side but are never surfaced as a human address or map link. For a Store Pickup / no-payment-gateway model, this isn't polish — it's an instruction the product can't actually complete.
Fix: surface a real phone number and a human-readable address (or a map link built from the existing coordinates) on the footer, order confirmation, and order-detail pages.
Suggested command: `/impeccable harden`

**[P1] The confirmation page's one unrecoverable-consequence sentence is styled as a footnote.**
Why it matters: "Save this page's link — it's the only way to view this order again without verifying your number" is the load-bearing safety net for this entire no-account system, but it renders in small `text-muted-foreground` text below three other card blocks, while the order number itself gets a styled pill. A parent who doesn't screenshot this page has no recovery path except OTP, which itself requires recalling the exact number used.
Fix: give this line its own bordered callout near the top of the page, matching the visual weight of the order-number pill.
Suggested command: `/impeccable clarify`

**[P1] Order confirmation never confirms the WhatsApp promise it implied at checkout.**
Why it matters: checkout explicitly collects a WhatsApp number, and a working WhatsApp-send pipeline exists server-side, but the confirmation page never says "we'll message you on WhatsApp when it's ready" — the customer who just gave a second phone number gets no acknowledgment of why, and the page's generic "We'll have this ready for you soon" (no ETA, no brand warmth) undersells the single most important trust moment in the journey.
Fix: add one line connecting the WhatsApp number just collected to what happens next.
Suggested command: `/impeccable clarify`

**[P2] Order-detail page has no visual hierarchy across ~7 co-equal sections.**
Why it matters: Status, Items+Return, Fulfillment, Payment, Invoice, and Return History are all identical-weight `h2` card blocks. A customer arriving anxious about status has to hunt for it among six other equally-weighted cards instead of it visually leading the page.
Fix: give the status timeline a visually dominant treatment (larger, top-most, or a distinct background) relative to the secondary sections.
Suggested command: `/impeccable layout`

**[P3] The generic error page dead-ends into the same unreachable "contact support."**
Why it matters: same root cause as the P0 — fixing the phone/contact surface once (footer or a shared constant) resolves this simultaneously.
Suggested command: `/impeccable harden`

## Persona Red Flags

**Jordan (anxious first-timer, low trust in an unfamiliar local retailer)**: places a Store Pickup order, reads "bring this order number when you collect at the store," and has no way to find out where that is — the app assumes prior knowledge it never gave.

**Riley (returning customer without a bookmark habit)**: didn't save the confirmation link (the warning is buried), can't recall which of two phone numbers (primary vs. WhatsApp) was used at checkout, and has no human to call to sort it out — the OTP flow's only fallback is guessing again.

**Sam (parent handling a genuine return)**: has the best experience in the app — honest, specific return-eligibility copy — but if a return is rejected, there's still no path to a human to appeal or ask a follow-up question, the same dead-end as everywhere else.

## Minor Observations

- The `/track` cold-state has two near-duplicate sentences with swapped clause order ("no account or password" vs. "no password or account") in the intro paragraph and the input's helper text — worth consolidating to one.
- Homepage category tiles: mechanically confirmed exactly 2 treatments (1 signature red, 4 neutral) — the color-rule fix from the prior pass is holding. Also noticed: the "kurtis" tile label renders lowercase while its four siblings (Uniforms, Shoes, Socks, Bags) are capitalized — a data-casing inconsistency in the category name itself, not a template bug.
- "Klasiq Customer Reference: KL-xxxx" on the order-history welcome header reads like an internal system ID surfaced with no explanation of what a parent should do with it.
- The invoice correctly stays fixed to light "paper" colors regardless of theme (deliberate print-design instinct) — but still misses the same store address/phone gap as the rest of the app.
- CLI detector: 0 findings in the originally-scoped storefront paths, but a full-repo sanity scan found real storefront-relevant gaps just outside that scope: `src/components/ui/button.tsx` (a shared primitive used by nearly every storefront surface) and `src/server/commerce/invoice-pdf.ts` (feeds the customer-facing invoice) both have off-ramp values the narrower scan missed. Worth widening this skill's default scan paths for future storefront critiques.

## Questions to Consider

- If the entire trust model is "no account, verify by phone, decades-old family store," why does the one moment that requires a customer to physically show up (Store Pickup) never tell them where to go?
- The backend clearly has a working WhatsApp pipeline — is the confirmation page's silence about it an intentional under-promise, or a missed connective-copy pass between two pieces of otherwise-solid work?
- Would a screenshot-friendly "save/share this page" affordance (native share sheet, or a QR code) do more for real-world link recovery than a sentence in gray text ever could?
