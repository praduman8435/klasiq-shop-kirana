---
name: Klasiq Storefront
description: The neighbourhood kirana, shown the way each pack declares itself, in Klasiq red and black.
colors:
  declaration-black: "oklch(0.19 0.004 270)"
  klasiq-red: "oklch(0.54 0.21 27)"
  pack-white: "oklch(1 0 0)"
  shelf-grey: "oklch(0.965 0.003 250)"
  shelf-grey-recessed: "oklch(0.945 0.004 250)"
  shelf-grey-deep: "oklch(0.93 0.004 250)"
  fine-print-grey: "oklch(0.42 0.012 275)"
  hairline-grey: "oklch(0.84 0.005 260)"
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
    height: "44px"
  button-outline:
    backgroundColor: "{colors.shelf-grey}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "48px"
  button-added:
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.pack-white}"
    rounded: "{rounded.none}"
    height: "44px"
  header-band:
    backgroundColor: "{colors.declaration-black}"
    textColor: "{colors.pack-white}"
    height: "56px"
  bag-tab:
    backgroundColor: "{colors.shelf-grey}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "40px"
    padding: "0 12px"
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
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.pack-white}"
    typography: "{typography.price}"
    rounded: "{rounded.sticker}"
    padding: "6px 8px"
  price-sticker-sold-out:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.sticker}"
    padding: "6px 8px"
  savings-stamp:
    textColor: "{colors.declaration-black}"
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
  aisle-tab:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 12px"
  aisle-tab-current:
    backgroundColor: "{colors.declaration-black}"
    textColor: "{colors.pack-white}"
    rounded: "{rounded.none}"
    height: "44px"
    padding: "0 12px"
  floating-bag-bar:
    backgroundColor: "{colors.declaration-black}"
    textColor: "{colors.pack-white}"
    rounded: "{rounded.none}"
    height: "56px"
    padding: "0 12px 0 16px"
  qty-stepper:
    backgroundColor: "{colors.pack-white}"
    textColor: "{colors.declaration-black}"
    rounded: "{rounded.none}"
    height: "40px"
---

# Design System: Klasiq Storefront

## Overview

**Creative North Star: "The Pack Declaration Panel"**

Every product is shown the way its own pack states it: brand in small condensed caps, the product name, and a ruled box of NET QTY and MRP in black declaration print, exactly as printed on the back of an Indian pack. On top of that the shop slaps its own red price sticker, a little crooked, the way a kirana owner's price gun leaves it. The page is a sheet of these pack panels: pack-white board on a cool shelf-grey ground, divided by 1px black rules into boxed fields, square everywhere, under a solid black brand band.

The palette is pinned to the brand: Klasiq red and black. Black does the work, carrying structure, type and every action. Red is the brand's voice and is spent sparingly: on prices, on the bag's running count and total, on the momentary "Added" confirmation, on the wordmark's full stop, and on focus. Hierarchy comes from rules, weight and Archivo's condensed width axis, not from extra colours, shadows or rounding.

The storefront is built phone-first for a neighbourhood customer on a budget Android phone, often in daylight: thumb-reach controls, a floating bag bar once the bag has items, swipeable aisle tabs, and tap targets of 40px or more. It deliberately refuses two neighbours: the quick-commerce tile grid (floating rounded cards, pastel category bubbles, discount badges) and the cream-serif "artisan grocer." Light only.

**Scope.** This file covers the customer storefront only: everything inside the `.store-theme` scope, which the `(site)` layout applies and which portaled popups (mobile menu sheet, select popups, toasts) re-apply themselves. The admin panel (`/admin`) is a separate, unchanged system, with its own `.admin-theme` and `.dark` token blocks in `globals.css` and Fraunces with Plus Jakarta Sans. Nothing here applies to it, and storefront tokens must never leak into it.

**Key Characteristics:**
- A solid black header band with the white KLASIQ wordmark and a red full stop.
- Pack-white panels on shelf-grey ground, boxed by 1px declaration-black rules.
- Square corners throughout (radius 0); the price sticker alone has 3px.
- One typeface, Archivo, whose width axis carries condensed caps labels and headings.
- One red price sticker per product, rotated -3deg, always with white text.
- A black-outline "SAVE ₹X" stamp, rotated -2deg, only when the price is genuinely under MRP.
- Phone-first: floating black bag bar, swipeable aisle tabs, 40px+ tap targets.
- One authored motion: the price-gun stamp when an item lands in the bag.

## Colors

Two brand colours on a near-monochrome print ground: black ink and structure, with red kept for price and the brand mark.

### Primary
- **Declaration Black** (`declaration-black`): all text, all 1px box rules, the header band, the floating bag bar, and the only "act here" fill: Add to Bag, Search, Proceed to Checkout, the selected pack size, the current aisle tab. Also the savings stamp's ink.

### Secondary
- **Klasiq Red** (`klasiq-red`): the brand red, carrying white text at 5.6:1. It is spent only on the price sticker (on panels, on the product page and in its purchase bar), the bag-count sticker, the total on the floating bag and checkout bars and in the bag summary, the 1.4-second "Added" fill on a product card's CTA, the red full stop after the wordmark, and focus rings.

### Neutral
- **Pack White** (`pack-white`): the board every panel is printed on (product panels, hero name panel, aisles table, bag list and summary, footer cells, inputs, toasts), and the text colour on red stickers and black buttons.
- **Shelf Grey** (`shelf-grey`): the page ground. Also the fill of the outline button and of the bag tab, and the near-white ink of the wordmark, links and labels on the header band and floating bars.
- **Shelf Grey Recessed** (`shelf-grey-recessed`): the photo slot of a product with no photograph, and every hover or press wash (`hover:bg-muted`).
- **Shelf Grey Deep** (`shelf-grey-deep`): secondary surfaces from the shared component library; rare on storefront pages.
- **Fine-print Grey** (`fine-print-grey`): secondary text: brand labels, descriptions, pack size in bag rows, fact values, placeholders, the breadcrumb.
- **Hairline Grey** (`hairline-grey`): the global default border colour inherited by shared components and toasts. Storefront boxes use Declaration Black instead (see The Black Rule Rule).

### Status
- **In Stock Green** (`status-in-stock`), **Low Stock Amber** (`status-low-stock`), **Error Red** (`status-error`): stock-status text and inline errors only, never fills. Error Red is a slightly darker red of the same hue as Klasiq Red. It stays distinct because it only ever appears as small text, never as a sticker or fill.

### Named Rules
**The One Action Colour Rule.** Declaration Black is the only fill that means "press this." Red is never a button colour; the "Added" fill is a confirmation, not a control.

**The Red Is Spent Rule.** Klasiq Red appears only on prices, the bag's count and total, the "Added" confirmation, the wordmark's full stop and focus. Anything else in red is wrong, however small.

**The Stamp Means Saving Rule.** The black-outline SAVE stamp renders only when price is strictly below MRP, and nothing takes its place otherwise.

## Typography

**Display Font:** Archivo (with ui-sans-serif, system-ui, sans-serif), loaded with its `wdth` axis as `--font-archivo`
**Body Font:** Archivo
**Label Font:** Archivo at `wdth` 72, uppercase

**Character:** One grotesque does every job, the way a pack's legal panel does. Headings are narrowed to `wdth` 80 and set heavy and tight. Labels are narrowed further to `wdth` 72 in small spaced caps. Body text stays at normal width. The narrow cut is what makes it read as print on a pack rather than a web app.

### Hierarchy
- **Display** (800, 36px mobile to 60px desktop, line-height 0.95, `wdth` 80): the homepage name-panel headline only, capped at about 14ch.
- **Headline** (800, line-height 1, `wdth` 80): page titles at 30px to 36px (category, product, bag, track); section titles at 24px to 30px ("Aisles", "Everyday essentials"); panel titles at 20px ("Order summary").
- **Title** (600, 14px, line-height 1.375, `wdth` 80): product names on panels, clamped to two lines. Aisle names use 700 at 14px on phones and 16px from 640px. Bag-row names use 600 at 16px.
- **Body** (400, 14px; 16px in inputs, chips and bar labels; line-height 1.5): descriptions, fact values, footer copy.
- **Label** (700, 11px, letter-spacing 0.06em, uppercase, `wdth` 72): NET QTY, MRP, STOCK, PACK SIZE, PICKUP, CUSTOMER CARE, brand names, header aisle links, the item count on the bag bars, the SAVE stamp.
- **Wordmark** (800, 24px, letter-spacing 0.02em, `wdth` 72): KLASIQ plus a red full stop, white on the header band and black in the footer.
- **Price** (800, `wdth` 75, tabular figures): 18px on panels and bars, 30px to 36px on the product page, 12px in the bag count.

### Named Rules
**The Declaration Label Rule.** Every field name in a boxed field is a Label: condensed, bold, 11px, spaced caps, with the value under it in semibold at body size. Never sentence-case a field name, and never use the Label style for anything other than field names, brands, aisle links, counts and the stamp.

**The Tabular Money Rule.** Every rupee amount (price, MRP, saving, line total, total) uses tabular figures, so prices align like a printed table.

## Layout

The page is a single centred column capped at 72rem (`max-w-6xl`), with a 16px gutter that widens to 24px from 640px. Homepage sections stack 32px apart (48px from 640px). The header is a sticky 56px black band, with 8px side padding on phones.

**Phone first.** Below 768px:
- **Floating bag bar.** Once the bag has items, browse pages carry a black bar pinned 12px in from the sides and bottom, clear of the safe area. An in-flow spacer of the same height keeps content and the footer clear of it. The bag page's checkout bar has the same form. The product page, checkout, order and track pages don't show the browse bar.
- **Aisle rail.** Category pages open with a swipeable row of aisle tabs that bleeds to the screen edges and scrolls itself so the current aisle is centred. A trailing fade shows there are more to swipe.
- **Header search row.** On product pages only, a second header row holds the search, because the homepage, category and search pages already lead with their own search box.
- **Aisles table.** On the homepage the aisles are a two-column ruled table at every width. Dotted leaders and arrows appear only from 640px.

Products sit in a **product sheet**: 2 columns on phones, 3 from 640px, 4 from 1024px and 5 from 1280px. Panels share one 1px rule instead of floating with gaps. Each panel draws its own full box and is pulled 1px up and left, so neighbouring edges merge and an incomplete last row simply ends.

Inside a panel the rhythm is tight: 10px padding (12px from 640px), 6px in declaration-table cells, 8px between blocks. From 640px the product page splits into two columns (image, then the declaration panel) with a 40px to 64px gap.

**Tap targets.** The pack-size select on panels is 32px, the one compact exception. Everything else is at least 40px: header controls, quantity steppers and bag-row remove buttons at 40px; card Add to Bag and aisle tabs at 44px; homepage aisle rows at 56px on phones; product-page chips and actions at 48px; the hero search at 52px; the floating bars at 56px.

Horizontal rows that can overflow (the header's aisle links, aisle tabs, pack-size chips) scroll in place rather than wrap, with a short fade at the trailing edge.

## Elevation & Depth

Flat. Depth follows the print metaphor: black band over white board over grey shelf, with black rules boxing fields. Panels, buttons, inputs and popups cast no shadow. Only the things that sit on top of the page lift: the price sticker, which is stuck on the pack, and the floating bag bar, which hovers over the content.

### Shadow Vocabulary
- **Sticker lift** (`box-shadow: 0 1px 1px oklch(0.19 0.004 270 / 18%), 0 3px 8px -2px oklch(0.19 0.004 270 / 22%)`): every price sticker, including the bag count and bar totals.
- **Floating bar lift** (`box-shadow: 0 6px 20px -6px oklch(0.19 0.004 270 / 55%)`): the floating bag and checkout bars only.

### Named Rules
**The Only Stuck-on Things Lift Rule.** A shadow means "this sits on top of the page": the sticker or the floating bar. Anything else with a shadow loses it; separation comes from a rule or a change of surface.

## Shapes

Everything is square to the grid. `--radius` is 0 inside the storefront scope, so every `rounded-*` utility resolves to a hard corner. The price sticker alone has 3px corners, like a die-cut label.

Rotation is reserved for things applied to the pack after printing: the price sticker at -3deg and the savings stamp at -2deg. Everything else stays square.

Rules carry meaning through their style:
- **Solid 1px Declaration Black:** the outer edge of every box: panels, declaration tables, inputs, the hero panel, aisles table, bag list, bag summary, quantity steppers, aisle tabs, footer cells, outline buttons.
- **1px black at 15-20%:** row dividers inside a box (aisle rows, bag rows, mobile-menu rows).
- **1px white at 40%:** outline controls on the black band (Track Orders), turning solid white on hover.
- **2px dotted black at 35%:** leaders between an aisle name and its arrow (640px and up), like a printed contents table.
- **Dashed black at 40-50%:** absence: an out-of-stock CTA, an empty search result, an empty bag.

### Named Rules
**The Black Rule Rule.** A box's edge is 1px Declaration Black, never Hairline Grey. Lighter rules appear only as dividers inside a box that already has a black edge.

**The Dashed Absence Rule.** A dashed rule means "nothing here" or "not available." Never use it for decoration or for an active control.

## Components

### Buttons
Blunt and printed: a black slab with white bold type, with no rounding and no shadow.
- **Shape:** square corners (0).
- **Primary:** Declaration Black fill, Pack White text, bold 14px (16px on the product page), full width in panels. 44px tall on panels, 48px on the product page, 52px for the hero Search.
- **Hover / Active / Focus:** hover lightens the fill to 85% black, press nudges it down 1px, and focus shows a 3px Klasiq Red ring.
- **Outline:** 1px black rule on shelf grey with black bold text and a grey hover wash (Buy Now, clear search).
- **Added state (card CTA):** Klasiq Red fill with white text and a check icon for 1.4s, then back to primary.
- **Out of stock:** dashed 40% black rule, Fine-print Grey text, not pressable.
- **Ghost:** Fine-print Grey text with a grey wash on hover ("Continue shopping").

### Price Sticker (signature)
The shop's own price, stuck on the pack: Klasiq Red, white 800-weight condensed tabular figures, 3px corners, rotated -3deg, with the sticker lift. It sits over the bottom-right of the product image on panels, above the declaration table on the product page (large size), beside the actions in the product page's purchase bar, as the total in the bag summary and floating bars, and as the bag count. There is one per product, never more. When sold out it turns blank Pack White with a black rule and reads SOLD OUT, like an empty shelf tag.

### Savings Stamp (signature)
A batch-stamp mark: "SAVE ₹X" in the Label style, black text inside a 1px black box, rotated -2deg. It renders only when price is strictly under MRP.

### Pack Panel (product card)
- **Background:** Pack White inside the product sheet's shared black rules, with no radius and no shadow.
- **Image slot:** 5:4, full-bleed to the panel edge, with the price sticker pinned bottom-right.
- **Content order:** brand (Label, grey), name (Title, two lines max, underlined on hover), the declaration table, a stock-and-savings line, then the full-width black Add to Bag (44px).
- **Declaration table:** a 1px black box split 3:2 by a black rule into NET QTY and MRP cells, each a Label over a semibold value. With several pack sizes, the NET QTY value becomes an inline, borderless 32px select. A missing MRP prints an em dash.
- **Product page version:** the same logic at a larger size: a three-cell NET QTY | MRP | STOCK table, the large sticker, and the stamp beside it.

### No-photo Placeholder
This is a designed state, not a fallback, because most of the catalogue has no photograph. On panels and bag rows it is the category's line icon (1.25 stroke, Fine-print Grey at 75%) centred on Shelf Grey Recessed. On the product page it becomes a pack front: a large category mark drawn at 1 stroke on white inside the black-ruled image box, with a boxed NET QTY label and the selected size in heavy condensed print. Never an invented photo, never a broken-image glyph.

### Chips and Tabs
- **Pack size (product page):** 48px tall, at least 56px wide, 1px black rule, square, semibold 16px. The selected chip is filled Declaration Black with white text, unselected chips are Pack White with a grey hover wash, and unavailable sizes are struck through at 50% opacity. Behaves as a single-choice radio group.
- **Aisle tabs (phones, category pages):** 44px, 1px black rule, category icon plus a semibold 14px name, 8px apart. The current aisle is filled black with white text; the others are Pack White with a grey press wash.

### Inputs / Fields
- **Style:** Pack White, 1px Declaration Black rule, square corners, a grey leading search icon, Fine-print Grey placeholder. 40px compact (including on the black band), 44px in-page, 52px hero.
- **Hero search:** the field runs straight into a black Search button with no gap and no rule between them, so the two read as one boxed field.
- **Quantity stepper (bag):** a 40px square black-ruled box holding a 40px minus button, a bold tabular count and a 40px plus button.
- **Focus:** 3px Klasiq Red ring, with no border-colour shift.
- **Error:** Error Red text beneath, set in medium weight.

### Navigation
- **Header band:** a sticky 56px Declaration Black band. From left: the menu button (phones), the white KLASIQ wordmark with a red full stop, then from 768px the aisles as Label-style links in white at 70% (full white on hover; the current aisle is a white tab with black text), a compact search, and a Track Orders outline in white at 40%. The browser theme colour matches the band (#151518).
- **Bag tab:** a shelf-grey tab on the band with black bold text, the bag icon, and a red count sticker that replays the price-gun stamp whenever the count changes.
- **Mobile menu:** a left sheet titled "Aisles," with search on top and 48px full-width rows between black top and bottom rules. Rows are divided at 15% black, and the current aisle is filled black.
- **Aisles table (home):** a white, black-ruled two-column contents table with an icon and a bold aisle name, plus dotted leaders and an arrow that nudges right on hover from 640px.

### Floating Bag Bar (signature, phones)
A 56px Declaration Black bar floating 12px in from the screen edges and bottom, with the floating bar lift. Left: the item count as a white 70% Label over a bold 16px action ("View bag" on browse pages, "Proceed to checkout" on the bag page). Right: the total on a red price sticker, then an arrow. On browse pages the sticker replays the price-gun stamp when the count changes.

### Bag
The line items sit in one Pack White box with a black rule, divided at 20% black. Each row has a 64px thumbnail, the brand label, a 16px semibold name, the pack size in grey, the quantity stepper, a bold tabular line total and a 40px remove button. The order summary is a separate black-ruled white panel: grey Subtotal and Delivery rows, a solid black rule, then Total with the amount on the red price sticker.

### Fact Strip and Back Panel
The hero's bottom strip and the footer use the same ruled-cell pattern: equal cells split by 1px black rules, each a Label over a short value. The footer is the pack's back panel, with a KLASIQ "marketed by" cell, a CUSTOMER CARE cell and a search cell. Only facts backed by live config appear.

### Toasts
Pack White with a Hairline Grey border and square corners, inside the storefront scope, lifted 88px on phones to clear the bottom bars.

### Motion
The price-gun stamp (320ms, `cubic-bezier(0.16, 1, 0.3, 1)`: rotate -9deg at scale 1.35, overshoot to -2deg at 0.94, settle at -3deg) plays when an item lands in the bag, on the bag count and the floating bar's total. All other motion is colour transitions, a 1px press and a 2px arrow nudge. Everything collapses under reduced motion.

## Do's and Don'ts

### Do:
- **Do** box every field group in 1px Declaration Black on Pack White, with Label-style field names over semibold values.
- **Do** give each product exactly one price sticker: Klasiq Red, white text, 3px corners, -3deg.
- **Do** print "SAVE ₹X" in the black-outline stamp only when price is strictly below MRP.
- **Do** keep every action Declaration Black with white text.
- **Do** set every rupee amount in tabular figures.
- **Do** keep phone tap targets at 40px or more (the 32px pack-size select on panels is the one exception) and keep the bag reachable from the thumb zone.
- **Do** treat the no-photo placeholder as the main case: a category mark on shelf grey, or the pack-front panel on the product page.
- **Do** keep motion to colour transitions, a 1px press, and the price-gun stamp; everything collapses under reduced motion.

### Don't:
- **Don't** use Klasiq Red for anything outside prices, the bag's count and total, the "Added" confirmation, the wordmark's full stop and focus: no red buttons, icons, headings, borders or section fills.
- **Don't** introduce a third brand colour; the palette is Klasiq red and black on white and shelf grey.
- **Don't** round corners on anything but the price sticker.
- **Don't** add shadows to panels, buttons, inputs or popups; only the sticker and the floating bar lift.
- **Don't** float products as separate rounded cards with gaps; they share one rule in the product sheet.
- **Don't** introduce a second typeface or a serif; Archivo's width axis carries the contrast.
- **Don't** rotate anything except the sticker (-3deg) and the stamp (-2deg).
- **Don't** add a second authored animation; the price-gun stamp is the one moment.
- **Don't** invent photography, testimonials or store facts to fill space.

## Known Gaps

These are recorded honestly and are not rules.
- **Focus ring contrast:** the ring is Klasiq Red at 60% alpha. It measures about 1.8:1 against the black header band and bag bars, and about 2.9:1 on shelf grey, both under the 3:1 needed for non-text contrast. It needs to be solid, or doubled with a white inner ring on the black band.
- **Stray red:** the order-confirmation page tints a bookmark icon Klasiq Red, which is outside the spent-red list.
- **Two bottom-bar forms:** the product page's phone purchase bar is still a docked white bar with a black top rule, not the floating black bar used on browse pages and the bag.
- **Footer copy and contact:** the "Backed by…" line and the store phone number and Maps link are carried over from the original fork and are unverified for this store (PRODUCT.md, "To confirm").
- **Product photography** is mostly absent. The placeholder is the designed state; real photos, when added, sit square in the same slots.
