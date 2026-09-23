---
name: Klasiq Storefront
description: The neighbourhood kirana store as a production quick-commerce app — Blinkit/Zepto craft bar — in Klasiq red and black.
colors:
  klasiq-red: "oklch(0.54 0.21 27)"
  klasiq-red-deep: "oklch(0.44 0.18 27)"
  klasiq-red-soft: "oklch(0.96 0.028 25)"
  klasiq-red-tint: "oklch(0.955 0.03 25)"
  ink: "oklch(0.2 0.006 270)"
  card-white: "oklch(1 0 0)"
  ground: "oklch(0.975 0.003 250)"
  muted-fill: "oklch(0.96 0.004 250)"
  muted-ink: "oklch(0.47 0.012 270)"
  hairline: "oklch(0.91 0.005 260)"
  status-in-stock: "oklch(0.508 0.118 165.612)"
  status-low-stock: "oklch(0.555 0.163 48.998)"
  status-error: "oklch(0.52 0.2 27)"
typography:
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  headline-lg:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1.1
    letterSpacing: "-0.015em"
  section:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1.25
  banner:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.25rem"
    fontWeight: 800
    lineHeight: 1.25
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.4
  input:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.5
  price:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 800
    fontFeature: "\"tnum\""
  caption:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 600
    lineHeight: 1.25
  badge:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 800
    lineHeight: 1
  wordmark:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 900
    lineHeight: 1
    letterSpacing: "-0.01em"
rounded:
  control: "8px"
  field: "12px"
  card: "16px"
  panel: "24px"
  pill: "9999px"
spacing:
  gutter: "16px"
  gutter-sm: "24px"
  tile-gap: "12px"
  section: "28px"
  section-sm: "40px"
components:
  header:
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.card-white}"
  search-bar:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.field}"
    height: "44px"
  add-button:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.klasiq-red}"
    rounded: "{rounded.control}"
    height: "36px"
  add-stepper:
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.control}"
    height: "36px"
  product-tile:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.card}"
    padding: "10px"
  discount-badge:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.card-white}"
    typography: "{typography.badge}"
  category-tile:
    backgroundColor: "{colors.klasiq-red-soft}"
    textColor: "{colors.klasiq-red-deep}"
    rounded: "{rounded.card}"
  cart-bar:
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.card}"
    height: "56px"
  button-primary:
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.field}"
    height: "48px"
---

# Design System: Klasiq Storefront

## Overview

The customer storefront is built to the quick-commerce category standard — Blinkit and Zepto are the craft bar — in Klasiq red and black. This is the owner's explicit choice (recorded in PRODUCT.md): customers already know this app pattern, so the storefront speaks it fluently rather than inventing a new one. What stays specific to Klasiq is the brand colour, the neighbourhood-store copy, and a strict truth rule: nothing on screen promises an offer, discount or delivery time the store's own data doesn't back.

Scope: everything inside the `.store-theme` class (applied by `src/app/(site)/layout.tsx` and re-applied on portaled popups, the mobile menu sheet and toasts). The admin panel is a separate, unchanged system (`.admin-theme` + `.dark` in `src/app/globals.css`, Fraunces + Plus Jakarta Sans) and is not documented here.

Mobile first: the reference device is a ~390px Android phone in daylight. Light theme only.

### Key characteristics

- A solid Klasiq-red app header with the KLASIQ wordmark and a sticky rounded search bar on every page.
- White rounded product tiles on a near-white ground; an ADD button that becomes an in-place − n + stepper.
- Swipeable rows (banners, shelves, aisle chips) with native scroll-snap and the next item peeking in.
- A floating red cart bar in the thumb zone once the bag has items.
- Red is the one action colour; near-black ink carries all text.

## Colors

### Brand

- **Klasiq Red** (`klasiq-red`, `--primary`): the header band, ADD button outline/text, the filled stepper, the cart bar, every primary button, the current aisle chip, "See all" links, focus rings (at 45%). White text on it passes AA.
- **Klasiq Red Deep** (`--brand-deep`): icons and text on the soft red tiles.
- **Klasiq Red Soft** (`--brand-soft`): category tiles, footer icon tiles, the soft banner.
- **Klasiq Red Tint** (`--accent`): hover fill of the ADD button, the selected pack-size chip on the product page, the order page's "save this link" note.

### Neutrals

- **Ink** (`--foreground`): all text; the discount badge and the dark banner.
- **Card White** (`--card`): tiles, the search field, panels, the footer.
- **Ground** (`--background`): the page.
- **Muted Fill / Muted Ink**: image placeholders, pack-size chips, secondary text (brand, MRP, captions).
- **Hairline** (`--border`): 1px tile and panel borders.

### Status

In Stock green, Low Stock amber and Error red are text colours only (stock labels, inline errors), never fills.

### Rules

**The One Action Colour Rule.** Klasiq Red means "tap here" or "this is the brand". Secondary actions are white with a hairline border; there is no second action colour.

**The Truth Rule.** Banners are the store's own words, written and scheduled by the owner in /admin/banners (the three starting banners describe real fulfilment facts). Discount badges and struck-through MRPs appear only when a pack's price is genuinely below its MRP. No invented delivery ETAs, ratings or offers.

## Typography

Archivo throughout (loaded as `--font-archivo`, mapped to `--font-sans`/`--font-heading` inside `.store-theme`), at default width.

- **Headline** (800, 24px; 30px from 640px): page titles (the homepage has no visible headline — its heading is screen-reader-only).
- **Section** (800, 18px; 20px from 640px): "Shop by category", shelf titles.
- **Banner** (800, 20px): banner titles.
- **Body** (400, 14px) and **caption** (600, 12px): tile names are 14px/600, brand and pack size 12px.
- **Price** (800, 16px, tabular figures) on tiles; 30px on the product page.
- **Input** (16px): the search field — 16px so iOS never zooms on focus.
- **Badge** (800, 11px): "₹15 OFF".
- **Wordmark** (900, 24px): KLASIQ plus a full stop in ink (header) or red (footer). Always the all-caps wordmark, never lowercased.

## Layout

A centred column capped at 72rem with 16px gutters (24px from 640px). The homepage stacks: banner carousel → category grid → one shelf per aisle, with 28px section gaps (40px from 640px).

- **Banner carousel**: 86%-wide slides with scroll-snap on phones (the next slide peeks), dots below that follow the visible slide; a static 3-column row from 640px.
- **Category grid**: 4 columns on phones, 8 from 640px; square soft-red tiles with a 32–40px icon and a 2-line label.
- **Shelves**: horizontal scroll-snap rows of ~156px tiles (176px from 640px), bleeding to the screen edge on phones.
- **Category and search pages**: 2-column tile grid on phones, up to 5 on wide screens; category pages open with a swipeable aisle-chip rail that centres the current aisle.

Any scroller that contains a pack-size select must be `position: relative`: the select renders a hidden absolutely-positioned input that otherwise escapes the scroller and widens the whole phone page.

## Elevation & Depth

Mostly flat: tiles and panels use a 1px hairline border on the ground. Shadows are small and purposeful: the search field and header bag tab (1–3px soft), the ADD button (1px), the filled stepper and cart bar (soft red glow), the product page's mobile purchase bar (soft upward shadow).

## Shapes

Rounded, friendly corners: 8px controls (ADD/stepper), 12px fields and buttons, 16px tiles and the cart bar, 24px large panels (empty bag, track form, product image), full pills for aisle chips and the count badge.

## Components

### Header (`src/components/site/header.tsx`)

Solid red band, sticky. Row 1: menu (phones), the KLASIQ wordmark alone, Track Orders, and a white Bag tab with an ink count badge that pops when the count changes. Row 2 on phones (inline on desktop): the search bar.

### Search bar (`search-bar.tsx`)

White, 44px, 12px radius. A GET form to `/search` (works without JavaScript). The placeholder cycles through real product names (`Search "Toor Dal"`) every 2.6s, pausing on focus or input and staying still under reduced motion.

### Product tile (`product-card.tsx`)

White 16px tile: square image slot (photo or category-icon placeholder), discount badge top-left when priced under MRP, ADD / stepper riding the image's bottom-right edge, then pack size (a select chip when there are several), name (2 lines), brand, and price with the MRP struck through. Out of stock: greyed image, "Sold out" button, red "Out of stock" note.

### ADD / stepper (`src/components/basket/add-stepper.tsx`)

Outlined red ADD; once in the bag, a filled red − n + stepper in the same spot. Optimistic (`useOptimistic`); the `setVariantQuantity` server action revalidates the layout, which re-supplies true quantities via `BasketQuantitiesProvider`. Stock and the 20-per-line cap are enforced server-side; + disables at the limit.

### Banners (`promo-carousel.tsx`, `promo-banner-card.tsx`, `/admin/banners`)

Managed from the admin panel: title, optional text, colour (red, black, light), a corner picture (delivery, store, payment, offer, festival, fresh), an optional button that links to a page on this store, show/hide, order, and an optional India-time schedule. The homepage shows every live banner in admin order and hides the row when there are none. `PromoBannerCard` is shared by the storefront and the admin preview, so the preview is exact. Text keeps clear of the corner picture at every width.

### Cart bar (`mobile-bag-bar.tsx`, and the bag page's checkout bar)

Phones only. Red 56px bar floating 12px above the bottom safe area: bag icon, item count and total on the left, "View bag ›" (or "Checkout ›" on the bag page) on the right. Hidden where a page owns the bottom of the screen (product, checkout, order, track).

### Aisle rail (`aisle-rail.tsx`)

Pill chips with icons; the current aisle is filled red and auto-centred.

## Motion

Small and functional: the bag count "pops" (280ms) when it changes, search suggestions rise into place, tiles and buttons press down slightly on tap. Everything collapses under `prefers-reduced-motion`.

## Do's and Don'ts

- **Do** keep red for actions and brand moments only.
- **Do** keep banner copy to things the store actually offers — banners are written by the owner in /admin/banners.
- **Do** keep 44px+ tap targets for primary actions and 16px input text.
- **Don't** add a second search box to a page — the header search is always there.
- **Don't** lowercase or restyle the KLASIQ wordmark.
- **Don't** put a pack-size select inside a scroller that isn't `position: relative`.

## Known gaps

- Product photography is mostly absent; the category-icon placeholder is the designed fallback.
- The checkout form and order confirmation inherit the tokens but haven't had a dedicated quick-commerce pass.
- The footer's "Backed by…" line and the store phone/Maps link are unverified for this store (PRODUCT.md "To confirm").
- `.impeccable/design.json` (the design sidecar) predates this document and should be regenerated with `/impeccable document`.
