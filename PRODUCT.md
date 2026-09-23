# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: parents (and, secondarily, students) shopping for their child's school uniform — the core case is finding the exact uniform, size, and school-specific essentials for a named school, without guessing or making a trip across town to compare. Secondary: the same shoppers browsing general everyday retail — footwear, bags, kurtis, and future categories (stationery, dresses, other clothing) — as a convenience once they're already in the store, not as the store's primary framing. Staff/admin users (in-store counter sale, inventory, order fulfillment, returns, KhataBook credit ledger) are a separate, secondary audience served by the admin panel, distinct in scope from the customer storefront.

## Product Purpose

Klasiq lets a parent search for their child's exact school and get the right uniform (correct size, correct approved variant) delivered or ready for pickup, without creating an account — just a name and phone number. It also serves as a general local retail storefront for footwear, bags, kurtis, and everyday essentials, both for families who came for a uniform and for anyone shopping locally. Success is a parent finding the right item quickly and trusting that what arrives matches what their child's school actually requires.

## Positioning

The core differentiator is the combination of an **exact school-fit guarantee** (search-your-school discovery surfaces only that school's approved uniform items, correct sizing, correct variant — never a guess) **backed by a trusted, decades-old, family-run physical store**, not an anonymous marketplace. A stranger's e-commerce listing can't promise "this is what your child's school actually requires"; Klasiq's local retail heritage and direct relationship with schools can. Convenience (no account, cash on pickup/delivery, WhatsApp order updates) supports this positioning but is not the primary claim — the school-fit guarantee and local trust are.

## Operating Context

- **Customer storefront**: anonymous, cookie-based basket (no login) → checkout with name + mobile number only → Store Pickup or Local Delivery → cash payment on pickup/delivery. No online payment gateway.
- **Customer identity/order tracking**: OTP-based phone verification (no password, no persistent account) for "Track Orders" — order history, order detail, invoice download, and return/exchange requests.
- **Fulfillment**: Store Pickup (collect at the physical store) and Local Delivery (route-distance-based delivery fee, free within a radius or above an order threshold), both explicitly scoped to the store's own serviceable area.
- **Notifications**: WhatsApp order-lifecycle and return/exchange-lifecycle messages (Order Placed/Confirmed/Preparing/Ready for Pickup/Delivered; Return/Exchange Requested/Approved/Rejected/Received/Completed).
- **Admin/staff operations** (separate surface, `/admin`): counter sale (in-store walk-in sales, can include price negotiation/discounts), order management, inventory/stock management, category management, school management, returns/exchange processing, and KhataBook (a customer credit ledger for local families who run a running tab).
- **Schools**: some are real partner schools (e.g. Ujala Public School) with their own assigned/exclusive uniform products; others are explicitly seeded demo schools for illustration.

## Capabilities and Constraints

- Product variants are size-only (no color or other attributes) — the schema does not model additional variant dimensions.
- Categories are fully dynamic and admin-managed (not hardcoded); today's set is Uniforms, Shoes, Socks, Bags, kurtis, with more expected over time (e.g. stationery, dresses).
- No customer accounts or passwords anywhere — OTP phone verification is the only identity mechanism, and it is optional (a customer can check out and never verify their number at all).
- No online payment gateway — cash on pickup/delivery only, by explicit design.
- Product imagery is often absent in current data; the product experience must degrade gracefully (no broken images, no invented photography) when a photo doesn't exist.
- Server-authoritative pricing/stock/delivery-fee — the client is never trusted as a source of truth for any of these, and this is a hard constraint on any future UI work.

## Brand Commitments

- Name: **Klasiq** (running text), **KLASIQ** (all-caps wordmark/logo treatment only). The name is a deliberate play on "classic."
- Tagline: "Classic quality, modern shopping." — deliberately brand-wide, not school-only.
- Heritage line: "Serving local families for around 30 years." — confirmed real, kept deliberately non-specific on an exact founding year.
- Backed by two real, named legacy physical stores: **Milan Readymade & General Store** and **Shubham Vashtralaya** — referenced sparingly (footer/trust areas), never as the primary on-screen brand.
- Typography: Fraunces (display/heading) paired with Plus Jakarta Sans (body) — an established, intentional pairing, not a placeholder.

## Evidence on Hand

- Real partner school: Ujala Public School (confirmed real, not demo).
- Seed/demo data exists alongside real data: "Demo Sunrise Public School" and "Demo Valley Academy" are explicitly illustrative seed schools, and the storefront footer explicitly discloses "product names, sizes and prices shown for demo schools are illustrative" — future work must preserve this distinction and never blur demo content into a claim about real inventory/pricing.
- No customer testimonials, press, case studies, or benchmark data exist or should be invented.
- Most current product photography is placeholder/absent — treat this as a known gap, not evidence that real photography is unwanted.

## Product Principles

1. The school-fit guarantee is the product's reason to exist — any redesign must keep "search your school → correct uniform" fast, prominent, and unambiguous, even as general retail grows alongside it.
2. Never let general-retail framing erase the school-specific trust story; the two coexist (parents-first, general-retail-second), they don't trade off against each other.
3. Server-authoritative commerce data (price, stock, delivery fee) is never a place for UI convenience to quietly introduce client-side trust.
4. Missing product photography is expected and permanent for some items — design for a graceful fallback as a first-class state, not an edge case.
5. Local, family-run trust (real store names, real heritage, real partner schools) is a genuine asset — reference it, don't dilute it with invented proof.

## Accessibility & Inclusion

No product-specific accessibility requirement has been formally established beyond general web accessibility good practice (semantic HTML, keyboard navigation, sufficient color contrast, accessible names on interactive elements) — already an active concern in recent storefront work, not yet a documented standard.
