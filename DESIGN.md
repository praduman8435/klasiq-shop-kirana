---
name: Klasiq Storefront
description: The neighbourhood kirana, shown the way each pack declares itself, with the shop's own price sticker on top.
colors:
  declaration-black: "oklch(0.19 0.004 270)"
  pack-white: "oklch(1 0 0)"
  shelf-grey: "oklch(0.965 0.003 250)"
  shelf-grey-recessed: "oklch(0.945 0.004 250)"
  shelf-grey-deep: "oklch(0.93 0.004 250)"
  fine-print-grey: "oklch(0.42 0.012 275)"
  hairline-grey: "oklch(0.84 0.005 260)"
  sticker-yellow: "oklch(0.887 0.182 95.3)"
  inkjet-violet: "oklch(0.45 0.19 280)"
  status-in-stock: "oklch(0.508 0.118 165.612)"
  status-low-stock: "oklch(0.555 0.163 48.998)"
  status-error: "oklch(0.52 0.2 27)"
typography:
  display:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "clamp(2.25rem, 6vw, 3.75rem)"
    fontWeight: 800
    lineHeight: 0.95
    letterSpacing: "-0.01em"
    fontVariation: "\"wdth\" 80"
  headline:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "-0.01em"
    fontVariation: "\"wdth\" 80"
  title:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.375
    fontVariation: "\"wdth\" 80"
  body:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
  label:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.6875rem"
    fontWeight: 700
    lineHeight: 1
    letterSpacing: "0.06em"
    fontVariation: "\"wdth\" 72"
  wordmark:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.5rem"
    fontWeight: 800
    lineHeight: 1
    letterSpacing: "0.02em"
    fontVariation: "\"wdth\" 72"
  price:
    fontFamily: "Archivo, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.125rem"
    fontWeight: 800
    lineHeight: 1
    fontFeature: "\"tnum\""
    fontVariation: "\"wdth\" 75"
rounded:
  none: "0px"
  sticker: "3px"
spacing:
  cell: "6px"
  panel-sm: "10px"
  panel: "12px"
  gutter: "16px"
  gutter-sm: "24px"
  section: "32px"
  section-sm: "48px"
components:
  button-primary:
    backgroundColor: "{colors.declaration-black}"
    textColor: "{colors.pack-white}"
    typography: "{typography.title}"
    rounded: "{rounded.none}"
    height: "40px"
  button-outline:
    backgroundColor: "{colors.shelf-grey}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "48px"
  button-added:
    backgroundColor: "{colors.sticker-yellow}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "40px"
  input-search:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "40px"
  input-search-hero:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "52px"
  price-sticker:
    backgroundColor: "{colors.sticker-yellow}"
    textColor: "{colors.declaration-black}"
    typography: "{typography.price}"
    rounded: "{rounded.sticker}"
    padding: "6px 8px"
  price-sticker-sold-out:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.sticker}"
    padding: "6px 8px"
  savings-stamp:
    textColor: "{colors.inkjet-violet}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "4px 6px"
  pack-panel:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    padding: "10px"
  size-chip:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "48px"
    padding: "0 16px"
  size-chip-selected:
    backgroundColor: "{colors.declaration-black}"
    textColor: "{colors.pack-white}"
    rounded: "{rounded.none}"
    height: "48px"
  nav-aisle-active:
    backgroundColor: "{colors.declaration-black}"
    textColor: "{colors.pack-white}"
    typography: "{typography.label}"
    rounded: "{rounded.none}"
    padding: "8px"
---

# Design System: Klasiq Storefront

## Overview

**Creative North Star: "The Pack Declaration Panel"**

Every product is shown the way its own pack states it: brand in small condensed caps, the product name, and a ruled box of NET QTY and MRP in black declaration print, exactly as printed on the back of an Indian pack. On top of that the shop slaps its own fluorescent price sticker, a little crooked, the way a kirana owner's price gun leaves it. The page is a sheet of these pack panels: pack-white board laid on a cool shelf-grey ground, divided by 1px black rules into boxed fields, with square corners everywhere.

The system is dense, legible and literal. It borrows its whole vocabulary from things the customer already reads in the shop (the declaration table, the price sticker, the violet inkjet batch stamp, the customer-care box on the back panel) and adds nothing decorative on top. Hierarchy comes from rules, weight and the condensed width axis, not from colour, shadow or rounding. Black is the only colour that asks you to act; yellow only tells you a price; violet only tells you what you save.

It deliberately refuses two neighbours: the quick-commerce tile grid (floating rounded cards, pastel category bubbles, discount badges) and the cream-serif "artisan grocer" look. Light only, because the use scene is a budget Android phone, often in daylight.

**Scope.** This file covers the customer storefront only: everything inside the `.store-theme` scope, which the `(site)` layout applies and which portaled popups (mobile menu sheet, select popups, toasts) re-apply themselves. The admin panel (`/admin`) is a separate, unchanged system: its own `.admin-theme` and `.dark` token blocks in `globals.css`, with Fraunces and Plus Jakarta Sans. Nothing here applies to it, and storefront tokens must never leak into it.

**Key Characteristics:**
- Pack-white panels on shelf-grey ground, boxed by 1px declaration-black rules.
- Square corners throughout (radius 0); the price sticker alone has 3px.
- One typeface, Archivo, with its width axis carrying condensed caps labels and headings.
- One yellow price sticker per product, rotated -3deg, always black text.
- A violet inkjet "SAVE ₹X" stamp, rotated -2deg, only when the price is genuinely under MRP.
- Flat: no shadows except the sticker's own paper lift.
- One authored motion: the price-gun stamp on the bag count.

## Colors

A near-monochrome print palette (black ink on white board on grey shelf) with exactly two spot inks, each bound to one meaning.

### Primary
- **Declaration Black** (`declaration-black`): all text, all 1px box rules, and the only "act here" fill: Add to Bag, the hero Search button, the bag link, the selected pack size, the active aisle in the header. Also the sticker's and stamp's text colour.

### Secondary
- **Sticker Yellow** (`sticker-yellow`): the shop's fluorescent price sticker. It appears on prices, on the header bag count, and, for 1.4 seconds, as the fill of a product card's CTA in its "Added" state. Always with Declaration Black text on it; never used as a text colour on white (it would fail contrast), never on a border, never as a section background.

### Tertiary
- **Inkjet Violet** (`inkjet-violet`): the batch-stamp ink. It prints the "SAVE ₹X" stamp (1px violet box, violet text) and, at 55% alpha, every focus ring on the storefront. Intended also for order numbers; not yet applied there (see Known Gaps).

### Neutral
- **Pack White** (`pack-white`): the board every panel is printed on: product panels, header, footer, hero name panel, aisles table, inputs, toasts.
- **Shelf Grey** (`shelf-grey`): the page ground the panels sit on. Also the outline button's fill.
- **Shelf Grey Recessed** (`shelf-grey-recessed`): the photo slot of a product with no photograph, and every hover wash (`hover:bg-muted`) on nav rows, chips and outline controls.
- **Shelf Grey Deep** (`shelf-grey-deep`): secondary surfaces from the shared component library; rare on storefront pages.
- **Fine-print Grey** (`fine-print-grey`): secondary text: brand labels, descriptions, fact values, placeholders, the breadcrumb. Passes AA on both white and shelf grey.
- **Hairline Grey** (`hairline-grey`): the global default border colour inherited by shared components and toasts. Storefront boxes do not use it; they use Declaration Black (see The Black Rule Rule).

### Status
- **In Stock Green** (`status-in-stock`), **Low Stock Amber** (`status-low-stock`), **Error Red** (`status-error`): stock-status text and inline errors only, never fills. Set in semibold at label or body size.

### Named Rules
**The One Action Colour Rule.** Declaration Black is the only fill that means "press this." A yellow, violet or grey button does not exist.

**The Sticker Means Price Rule.** Sticker Yellow marks what the customer pays (and the bag count, which is the running tally of it). If a yellow surface is not a price, the count, or the momentary "Added" confirmation, it is wrong.

**The Stamp Means Saving Rule.** Inkjet Violet prints savings against MRP and focus. It never decorates, and a SAVE stamp renders only when price is strictly below MRP.

## Typography

**Display Font:** Archivo (with ui-sans-serif, system-ui, sans-serif), loaded with its `wdth` axis as `--font-archivo`
**Body Font:** Archivo
**Label Font:** Archivo at `wdth` 72, uppercase

**Character:** One grotesque doing every job, the way a pack's legal panel does: headings narrowed to `wdth` 80 and set heavy and tight, labels narrowed further to `wdth` 72 in small spaced caps, body at normal width. The narrow cut is what makes it read as print on a pack rather than a web app.

### Hierarchy
- **Display** (800, 36px mobile to 60px desktop, line-height 0.95, `wdth` 80): the homepage name-panel headline only, capped at about 14ch.
- **Headline** (800, 30px to 36px for page titles, 24px to 30px for section titles, line-height 1, `wdth` 80): category, product, track and empty-bag titles; "Aisles", "Everyday essentials".
- **Title** (600, 14px, line-height 1.375, `wdth` 80): product names on panels, clamped to two lines. Aisle names use 700 at 16px.
- **Body** (400, 14px; 16px in inputs and chips; line-height 1.5): descriptions, fact values, footer copy. Product descriptions cap at about 28rem.
- **Label** (700, 11px, letter-spacing 0.06em, uppercase, `wdth` 72): NET QTY, MRP, STOCK, PACK SIZE, PICKUP, CUSTOMER CARE, brand names, header aisle links, the SAVE stamp.
- **Wordmark** (800, 20px to 24px, letter-spacing 0.02em, `wdth` 72): KLASIQ in the header and footer.
- **Price** (800, `wdth` 75, tabular figures): 18px on panels, 30px to 36px on the product page.

### Named Rules
**The Declaration Label Rule.** Every field name on a boxed field is a Label: condensed, bold, 11px, spaced caps. Field values sit under it in semibold at body size. Never sentence-case a field name; never use Label style for anything that is not a field name, brand, aisle link or stamp.

**The Tabular Money Rule.** Every rupee amount (price, MRP, saving, total) uses tabular figures so columns of prices align like a printed table.

## Layout

A single centred column capped at 72rem (`max-w-6xl`) with a 16px gutter, 24px from 640px up. Homepage sections stack with 32px gaps (48px from 640px). The header is a sticky 56px white bar ruled off by one black line.

Products sit in a **product sheet**: a grid of 2 columns on phones, 3 from 640px, 4 from 1024px, 5 from 1280px. Panels share a single 1px rule instead of floating with gaps: each panel draws its own full box and is pulled 1px up and left, so neighbouring edges merge and an incomplete last row simply ends.

Inside a panel the rhythm is tight: 10px padding (12px from 640px), 6px padding in declaration-table cells, 8px between blocks. The product page uses a two-column split from 640px (image, then declaration panel) with a 40px to 64px gap.

Tap targets follow the budget-phone scene: compact controls are 40px tall, form fields and icon buttons 44px, product-page chips and actions 48px, the hero search 52px. Below 640px, the product page and bag carry a fixed bottom purchase bar and hide their in-page duplicates.

Horizontal rows that can overflow (header aisle links, pack-size chips) scroll in place rather than wrap, with a short fade to the panel colour at the trailing edge only when they actually overflow.

## Elevation & Depth

Flat. Depth is the print metaphor: white board over grey shelf, and black rules boxing fields. Panels, buttons, inputs and popups do not cast shadows. The single exception is the price sticker, which carries a small paper-lift shadow so it reads as stuck on top of the pack rather than printed on it.

### Shadow Vocabulary
- **Sticker lift** (`box-shadow: 0 1px 1px oklch(0.19 0.004 270 / 18%), 0 3px 8px -2px oklch(0.19 0.004 270 / 22%)`): the price sticker only.

### Named Rules
**The Only Sticker Lifts Rule.** If something that is not the price sticker has a shadow, remove it. Separation comes from a rule or a surface change.

## Shapes

Square to the grid. `--radius` is 0 inside the storefront scope, so every `rounded-*` utility resolves to a hard corner. The price sticker alone has 3px corners, like a die-cut label.

Rotation is reserved for things applied to the pack after printing: the price sticker at -3deg and the savings stamp at -2deg. Everything else stays square to the grid.

Rules carry meaning by style:
- **Solid 1px Declaration Black**: the outer edge of every box: panels, declaration tables, inputs, the hero panel, the aisles table, the footer's back-panel cells, outline buttons.
- **1px black at 15-20%**: row dividers inside a box (aisle rows, mobile-menu rows).
- **2px dotted black at 35%**: leaders between an aisle name and its arrow, like a printed contents table.
- **Dashed black at 40-50%**: absence: an out-of-stock CTA, an empty search result, an empty bag.

### Named Rules
**The Black Rule Rule.** A box's edge is 1px Declaration Black, never Hairline Grey. Grey appears only as a lighter divider inside a box that already has a black edge.

**The Dashed Absence Rule.** A dashed rule means "nothing here / not available." Never use it for decoration or for an active control.

## Components

### Buttons
Blunt and printed: a black slab with white bold type, no rounding, no shadow.
- **Shape:** square corners (0).
- **Primary:** Declaration Black fill, Pack White text, bold 14px (16px on the product page), full-width in panels; 40px tall on panels, 48px on the product page, 52px for the hero Search.
- **Hover / Active / Focus:** hover lightens the fill to 85% black; active nudges down 1px; focus shows a 3px Inkjet Violet ring at 55%.
- **Outline:** 1px black rule on shelf grey, black bold text, grey hover wash (Buy Now, clear-search, Track Orders).
- **Added state (card CTA):** Sticker Yellow fill with black text and a check icon for 1.4s, then back to primary.
- **Out of stock:** dashed 40% black rule, Fine-print Grey text, not pressable.

### Price Sticker (signature)
The shop's own price, stuck on the pack. Sticker Yellow, black 800-weight condensed tabular figures, 3px corners, rotated -3deg, with the sticker lift shadow. Sits over the bottom-right of the product image on panels and above the declaration table on the product page (large size), and beside the actions in the mobile purchase bar. One per product, never more. Sold out, it turns blank Pack White with a black rule and reads SOLD OUT, like an empty shelf tag.

### Savings Stamp (signature)
The violet inkjet batch stamp: "SAVE ₹X" in Label style, Inkjet Violet text inside a 1px violet box, rotated -2deg. Renders only when price is strictly under MRP; otherwise nothing takes its place.

### Pack Panel (product card)
- **Background:** Pack White, inside the product sheet's shared black rules; no radius, no shadow.
- **Image slot:** 5:4, full-bleed to the panel edge, with the price sticker pinned bottom-right.
- **Content order:** brand (Label, grey), name (Title, two lines max, underline on hover), the declaration table, a stock-and-savings line, then the full-width black Add to Bag.
- **Declaration table:** a 1px black box split 3:2 into NET QTY and MRP cells by a black rule; each cell is a Label over a semibold value. With several pack sizes, the NET QTY value becomes an inline, borderless select. A missing MRP prints an em dash.
- **Product page version:** same logic at larger size: a three-cell NET QTY | MRP | STOCK table, the large sticker, and the stamp beside it.

### No-photo Placeholder
A designed state, not a fallback: most of the catalogue has no photograph. On panels it is the category's line icon (1.25 stroke, Fine-print Grey at 75%) centred on Shelf Grey Recessed. On the product page it becomes a pack front: a large 1-stroke category mark on white inside the black-ruled image box, with a boxed NET QTY label and the selected size in heavy condensed print. Never an invented photo, never a broken-image glyph.

### Chips (pack size)
- **Style:** 48px tall, at least 56px wide, 1px black rule, square, semibold 16px.
- **State:** selected fills Declaration Black with white text; unselected is Pack White with a grey hover wash; unavailable sizes are struck through at 50% opacity. Behaves as a single-choice radio group.

### Inputs / Fields
- **Style:** Pack White, 1px Declaration Black rule, square corners, grey leading search icon, Fine-print Grey placeholder. 40px compact, 44px in-page, 52px hero.
- **Hero search:** the field butts directly into a black Search button with no gap and no rule between them, reading as one boxed field.
- **Focus:** 3px Inkjet Violet ring at 55%; no border colour shift.
- **Error:** Error Red text beneath, set in medium weight.

### Navigation
- **Header:** sticky white bar with one black bottom rule; KLASIQ wordmark left; aisles as Label-style links at 75% black, grey wash on hover, solid black with white text when active; compact search; an outline Track Orders button; the black Bag button.
- **Bag count:** a small price sticker inside the black Bag button, replayed with the price-gun stamp (320ms, `cubic-bezier(0.16, 1, 0.3, 1)`) whenever the count changes. This is the world's single authored motion.
- **Mobile:** a left sheet titled "Aisles" with search on top and full-width 48px rows between black top and bottom rules, 15% dividers, and a black fill on the active aisle.
- **Aisles table (home):** a white, black-ruled contents table (two columns from 640px): icon, bold aisle name, dotted leader, arrow that nudges right on hover.

### Fact Strip and Back Panel
The hero's bottom strip and the footer both use the ruled-cell pattern: equal cells split by 1px black rules, each a Label over a short value. The footer is the pack's back panel: a KLASIQ "marketed by" cell, a CUSTOMER CARE cell, and a search cell. Only facts backed by live config appear.

### Toasts
Pack White with a Hairline Grey border and square corners, inside the storefront scope; lifted 88px on mobile to clear the purchase bar.

## Do's and Don'ts

### Do:
- **Do** box every field group in 1px Declaration Black on Pack White, with Label-style field names over semibold values.
- **Do** give each product exactly one price sticker: Sticker Yellow, black text, 3px corners, -3deg.
- **Do** print "SAVE ₹X" in the violet stamp only when price is strictly below MRP.
- **Do** keep every action Declaration Black with white text, and every focus ring Inkjet Violet at 55%.
- **Do** set every rupee amount in tabular figures.
- **Do** treat the no-photo placeholder as the main case: category mark on shelf grey, or the pack-front panel on the product page.
- **Do** keep tap targets at 40px minimum, 48px for primary product-page controls.
- **Do** keep motion to colour transitions, a 1px press, and the price-gun stamp; everything collapses under reduced motion.

### Don't:
- **Don't** round corners on anything but the price sticker.
- **Don't** use Sticker Yellow as text, borders, section fills, or for anything that is not a price, the bag count, or the momentary "Added" confirmation.
- **Don't** add shadows to panels, buttons, inputs or popups; only the sticker lifts.
- **Don't** float products as separate rounded cards with gaps; they share one rule in the product sheet.
- **Don't** introduce a second typeface or a serif; Archivo's width axis does the contrast.
- **Don't** rotate anything except the sticker (-3deg) and the stamp (-2deg).
- **Don't** add a second authored animation; the price-gun stamp is the one moment.
- **Don't** invent photography, testimonials or store facts to fill space.

## Known Gaps

Recorded honestly; these are not rules.
- **Order numbers** do not yet carry the violet inkjet stamp the world intends for them.
- **Footer copy and contact:** the "Backed by…" line and the store phone number and Maps link are carried over from the original fork and are unverified for this store (PRODUCT.md, "To confirm").
- **Product photography** is mostly absent. The placeholder is the designed state; real photos, when added, sit square in the same slots with no radius.
- **Bag page** still carries pre-world details: a semibold, tight-tracked title instead of the heavy condensed headline, grey hairline dividers instead of black rules, and a frosted, translucent mobile checkout bar. These are drift to correct, not part of the system.
