# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Primary: households in the store's own neighbourhood buying everyday groceries and household essentials — atta, rice, dal, oil, masale, snacks, dairy, personal care, cleaning and pooja items — who want to order from a shop they already know and have it ready for pickup or delivered, instead of walking over or calling. Many are repeat buyers of the same staples, often on a mid-range Android phone.

Secondary: store staff and the owner, using the admin panel for the day-to-day running of the shop — counter sales (walk-in billing, the busiest surface), online order fulfilment, stock and supplier purchases, returns, and KhataBook (the udhaar/credit ledger for regular customers who run a tab). Admin is a separate surface with its own, denser needs.

## Product Purpose

Klasiq lets a neighbourhood customer find what they need — by product or brand — pick the right pack size, and place an order for store pickup or local delivery without creating an account: just a name and phone number, paying cash or UPI on pickup/delivery. Behind the counter, the same system bills walk-in sales, keeps stock honest across online and counter sales, and tracks who owes what. Success is a customer reordering their staples in under a minute, and staff never having to reconcile two separate systems.

## Positioning

The neighbourhood kirana store, online — not an anonymous quick-commerce app. The differentiator is the store itself: the shop people already buy from, with its own counter, its own staff and the credit relationship regulars rely on. Convenience (no account, cash/UPI on delivery, WhatsApp updates, pickup or delivery from the shop down the road) supports that, it doesn't replace it.

## Operating Context

- **Customer storefront**: anonymous, cookie-based basket (no login) → checkout with name + mobile number only → Store Pickup or Local Delivery → cash/UPI payment on pickup/delivery. No online payment gateway.
- **Customer identity/order tracking**: OTP-based phone verification (no password, no persistent account) for "Track Orders" — order history, order detail, invoice download, and return requests.
- **Fulfillment**: Store Pickup and Local Delivery (route-distance-based delivery fee, free within a radius or above an order threshold), scoped to the store's own serviceable area.
- **Notifications**: WhatsApp order-lifecycle and return-lifecycle messages.
- **Admin/staff operations** (`/admin`): counter sale (walk-in billing, can include negotiated discounts and partial payment onto the customer's khata), order management, inventory, supplier purchases/payments/returns, category management, returns processing, and KhataBook.
- **Both channels share one stock pool**: an online order and a counter sale draw from the same inventory, and must never oversell it.

## Capabilities and Constraints

- Products are sold in **pack sizes** (e.g. "500 g", "1 kg", "Pack of 4") — each pack size is its own variant with its own price, stock and SKU. Loose goods are sold as fixed pack sizes; there is no sell-by-weight.
- Each pack size can carry an optional **MRP**; the selling price may never exceed it. Only when the price is genuinely lower, the storefront strikes the MRP through beside the price and shows a "₹X OFF" badge.
- Products have an optional **brand** (plain text). Customer search and counter-sale search both match on brand.
- Categories are fully dynamic and admin-managed (not hardcoded). The default set is eight aisles: Atta, Rice & Dal · Oil, Ghee & Masale · Dairy, Bread & Eggs · Snacks & Packaged Food · Tea, Coffee & Drinks · Personal Care · Cleaning & Household · Pooja Samagri.
- No customer accounts or passwords anywhere — OTP phone verification is the only identity mechanism, and it is optional.
- No online payment gateway — cash/UPI on pickup/delivery, by design.
- No GST/HSN on products or invoices — explicitly out of scope for now.
- No expiry/batch tracking.
- Product imagery is often absent; the product experience must degrade gracefully (no broken images, no invented photography) when a photo doesn't exist.
- Server-authoritative pricing/stock/delivery-fee — the client is never trusted as a source of truth for any of these.

## Brand Commitments

- Name: **Klasiq** (running text), **KLASIQ** (all-caps wordmark/logo treatment only). The name is a play on "classic."
- Tagline: "Classic quality, modern shopping."
- Typography (storefront): Archivo throughout. The admin panel keeps Fraunces + Plus Jakarta Sans.
- **Visual standard (owner's explicit choice):** the storefront follows the quick-commerce category standard — Blinkit and Zepto are the craft bar — in **Klasiq red and black**: red app header with a sticky search, ADD buttons that turn into in-place steppers, swipeable shelves, a floating cart bar. Positioning stays "the neighbourhood store"; the look is deliberately the familiar app pattern customers already know.
- Homepage has no visible headline (owner's choice) — it opens straight onto the banners. Banner copy is built only from live store config (delivery radius/threshold, pickup, payment) — never invented offers, discounts or delivery times.
- **To confirm for this store** (carried over from the original Klasiq fork, not yet verified for the kirana store — do not treat as fact): the heritage line "Serving local families for around 30 years", the backing store names "Milan Readymade & General Store" and "Shubham Vashtralaya", and the store phone number / Maps link in `STORE_CONTACT`.

## Evidence on Hand

- Seed data (`prisma/seed.ts`) is illustrative demo data flagged `isDemo: true` — prices, MRPs and stock are not the real store's. It uses real consumer brand names only so the catalogue looks realistic in development.
- No customer testimonials, press, or benchmark data exist or should be invented.
- Most product photography is absent — treat this as a known gap, not evidence that real photography is unwanted.

## Product Principles

1. Reordering staples must be fast: search (by product or brand) and pack-size selection are the core storefront interactions.
2. The counter is as important as the storefront — counter-sale speed and accuracy are never traded away for storefront polish.
3. Server-authoritative commerce data (price, MRP rule, stock, delivery fee) is never a place for UI convenience to quietly introduce client-side trust.
4. Missing product photography is expected and permanent for some items — design the fallback as a first-class state.
5. Local trust is the asset — reference the real store, never invent proof.

## Accessibility & Inclusion

General web accessibility good practice (semantic HTML, keyboard navigation, sufficient colour contrast, accessible names on interactive elements). Large tap targets and legible type on small, budget Android screens matter more than usual for this audience. Hindi/bilingual labels are a likely future need and not yet built.
