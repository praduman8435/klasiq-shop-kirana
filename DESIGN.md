---
name: Klasiq
description: Classic quality, modern shopping — a bold, cinematic retail storefront built on an exact school-fit guarantee and decades of local trust.
colors:
  klasiq-red: "oklch(0.47 0.19 25)"
  klasiq-red-ink: "oklch(0.98 0.012 25)"
  marquee-gold: "oklch(0.8 0.15 85)"
  marquee-gold-ink: "oklch(0.24 0.05 70)"
  midnight-ink: "oklch(0.16 0.02 260)"
  parchment: "oklch(0.98 0.005 85)"
  paper: "oklch(1 0 0)"
  quiet-slate: "oklch(0.95 0.01 260)"
  quiet-slate-ink: "oklch(0.22 0.04 260)"
  soft-fog: "oklch(0.96 0.006 85)"
  fog-ink: "oklch(0.46 0.02 260)"
  hairline: "oklch(0.9 0.01 260)"
  alert-red: "oklch(0.5 0.2 20)"
typography:
  display:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
    fontSize: "48px"
    fontWeight: 600
    lineHeight: "48px"
    letterSpacing: "-1.2px"
  headline:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
    fontSize: "30px"
    fontWeight: 600
    lineHeight: "36px"
    letterSpacing: "normal"
  title:
    fontFamily: "Fraunces, ui-serif, Georgia, serif"
    fontSize: "20px"
    fontWeight: 600
    lineHeight: "28px"
    letterSpacing: "-0.5px"
  body:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
    lineHeight: "24px"
    letterSpacing: "normal"
  label:
    fontFamily: "Plus Jakarta Sans, ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    lineHeight: "16px"
    letterSpacing: "0.6px"
rounded:
  sm: "8px"
  md: "10px"
  lg: "12px"
  xl: "16px"
  2xl: "22px"
  full: "9999px"
spacing:
  xs: "8px"
  sm: "12px"
  md: "16px"
  lg: "24px"
  xl: "40px"
  2xl: "56px"
  3xl: "80px"
components:
  button-primary:
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.klasiq-red-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "0 10px"
  button-primary-hover:
    backgroundColor: "oklch(0.47 0.19 25 / 80%)"
    textColor: "{colors.klasiq-red-ink}"
  button-outline:
    backgroundColor: "{colors.parchment}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
  button-secondary:
    backgroundColor: "{colors.quiet-slate}"
    textColor: "{colors.quiet-slate-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
  input:
    backgroundColor: "transparent"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.lg}"
    height: "32px"
    padding: "4px 10px"
  card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.xl}"
    padding: "16px"
  product-card:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.xl}"
  badge-pill:
    backgroundColor: "{colors.klasiq-red}"
    textColor: "{colors.klasiq-red-ink}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  category-tile:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  select-trigger:
    backgroundColor: "{colors.paper}"
    textColor: "{colors.midnight-ink}"
    rounded: "{rounded.full}"
    height: "36px"
    padding: "4px 12px 4px 36px"
---

# Design System: Klasiq

## Overview

**Creative North Star: "Classic, Modernized"**

Klasiq's storefront plays the Klasiq/"classic" wordplay straight: a decades-old, family-run uniform counter rendered in a bold, cinematic, contemporary visual language. Near-black navy ink on warm parchment gives every screen the confidence of an established institution, while a single controlled red (Klasiq Red) and a sparing gold highlight (Marquee Gold) carry the "bold, energetic, cinematic" energy the brand wants without borrowing anyone else's iconography. The system is deliberately not soft or pastel — it reads as assured and a little theatrical, the way a well-run family store that's been getting it right for thirty years can afford to be.

Density stays tight and retail-native: product cards behave like compact shelf tags, not mini detail pages, so more of the catalog is visible at once on every breakpoint. Surfaces are flat by default — depth is earned by interaction, not stacked on by default — which keeps the cinematic color work from tipping into visual noise. This is explicitly not a superhero-branded skin: no comic iconography, no character likenesses, no halftone/ben-day-dot styling. It is also not a generic SaaS-template look (soft blue gradients, rounded-everything, timid contrast) and not a childish "back to school" theme — the general-retail half of the catalog (footwear, bags, kurtis) has to feel just as at home here as uniforms.

**Key Characteristics:**
- Near-black navy text on warm parchment surfaces, punctuated by one controlled red and one sparing gold
- Flat-by-default cards and tiles; shadow appears only as a response to hover/focus
- Fully rounded pills for badges, tabs, and the compact size-picker; softer rounded rectangles for cards and tiles
- Fraunces display serif for headings paired with Plus Jakarta Sans for everything functional
- Product cards are deliberately compact — shelf-tag density, not detail-page sprawl

## Colors

The palette is a small, deliberate set: one warm-neutral surface family carrying near-black navy text, one commanding red used as the system's only true call-to-action color, and one gold used only as a rare spotlight.

### Primary
- **Klasiq Red** (`oklch(0.47 0.19 25)`): the brand's one confident color — primary buttons, prices, active nav/tab states, the size-picker's selection ring. Never used as a background fill for large surfaces.
- **Klasiq Red Ink** (`oklch(0.98 0.012 25)`): the near-white text/icon color that sits on top of Klasiq Red.

### Secondary
- **Marquee Gold** (`oklch(0.8 0.15 85)`): a rare spotlight highlight — the hero's "Trusted local retail" eyebrow badge and similar single-use callouts. It is never a base or repeating UI color.
- **Marquee Gold Ink** (`oklch(0.24 0.05 70)`): the dark warm text that sits on top of Marquee Gold.

### Neutral
- **Midnight Ink** (`oklch(0.16 0.02 260)`): the system's near-black navy — default body and heading text on light surfaces.
- **Parchment** (`oklch(0.98 0.005 85)`): the warm off-white page background.
- **Paper** (`oklch(1 0 0)`): pure white — cards, popovers, product-card surfaces, sitting one step lighter than Parchment.
- **Quiet Slate** (`oklch(0.95 0.01 260)`): a cool pale neutral used for secondary chip/pill backgrounds (e.g. inactive fulfillment-tab pill).
- **Quiet Slate Ink** (`oklch(0.22 0.04 260)`): the text color paired with Quiet Slate.
- **Soft Fog** (`oklch(0.96 0.006 85)`): the mutest background step — disabled states, subtle section fills.
- **Fog Ink** (`oklch(0.46 0.02 260)`): muted/secondary text — captions, helper copy, stock-status subtext.
- **Hairline** (`oklch(0.9 0.01 260)`): the system's only border/divider color, used at 1px everywhere a border appears.
- **Alert Red** (`oklch(0.5 0.2 20)`): reserved for genuine errors and destructive actions (form validation, delete/destructive buttons) — never used decoratively, and never confused with Klasiq Red's CTA role.

### Named Rules
**The One Red Rule.** Klasiq Red is the system's only color allowed to mean "act here." If a screen has more than one element competing for that color, one of them is wrong.

**The Gold Is Rare Rule.** Marquee Gold appears at most once or twice per screen, always as a small badge or accent — never as a background fill, never repeated across a grid of items.

### Dark Variant (Homepage + Product Detail + Bag)

The customer homepage (`/`), every Product Detail Page (`/product/[slug]`), and the Bag (`/bag`) — all via a shared `RouteThemeScope` component applying the literal `.dark` class per its own `isDarkRoute()` allowlist — wear a dark-first variant of this same system. Every other route (category, checkout, order, track, admin) stays on the light system above; add a route to that allowlist only once it has actually been redesigned dark-first. Checkout in particular stays light deliberately — the Bag's own dark redesign explicitly scoped the Bag→Checkout boundary as an intentional tonal seam at a natural transaction boundary, not an oversight. Same hues, same named rules (One Red Rule, Gold Is Rare Rule), inverted lightness:

- **Background** `oklch(0.13 0.02 260)` — near-black navy, the same hue as Midnight Ink, now the base surface instead of the text color.
- **Muted** `oklch(0.17 0.015 260)` (recessed) → **Card** `oklch(0.2 0.02 260)` (raised) → **Secondary** `oklch(0.23 0.015 260)` → **Popover** `oklch(0.25 0.02 260)` — a real 4-step tonal ramp, each step a deliberate ~0.03-0.05 lightness jump so surfaces are distinguishable without relying on the border alone (an earlier pass with near-identical steps measured under 1.1:1 surface contrast and had to be widened).
- **Foreground** `oklch(0.96 0.006 85)` — the light system's Parchment value, now the text color instead of the background.
- **Klasiq Red and Marquee Gold are unchanged** — both already read correctly against dark surfaces with no adjustment. The one caveat: a *translucent* red tint with red text (e.g. `bg-primary/10 text-primary`) does **not** carry over safely to dark — it measured under 4:1 text contrast in practice. Any "selected/signature" treatment on a dark surface should use a **solid** `bg-primary text-primary-foreground` fill instead (the same recipe the checkout fulfillment tabs already use), never a translucent tint.
- **Border** `oklch(1 0 0 / 12%)` — translucent white, not a flat hex, so it reads correctly regardless of which surface step sits behind it.

## Typography

**Display Font:** Fraunces (with ui-serif, Georgia fallback)
**Body Font:** Plus Jakarta Sans (with ui-sans-serif, system-ui fallback)

**Character:** Fraunces' warm, slightly editorial serif carries the "heritage made confident" feeling in headings, while Plus Jakarta Sans keeps every functional surface (prices, labels, controls, body copy) crisp and thoroughly modern. The pairing is what makes "classic, modernized" legible at the type level, not just the color level.

### Hierarchy
- **Display** (600, up to 48px, -1.2px tracking): reserved for a full-width page headline; capped at 48px per the Compact Display Rule below. The homepage hero headline itself now runs smaller still (`text-2xl` → `md:text-4xl`, 24-36px) — a second, even-more-restrained pass in the same spirit: short, controlled, never screen-filling.
- **Headline** (600, 30px, 36px line-height): page titles (e.g. a category page's `<h1>`). Homepage section headings ("Shop by category," "Shop the essentials") run smaller still (`text-base` → `sm:text-lg`, 16-18px) to match the homepage's overall compaction — they're wayfinding labels for a dense page, not standalone page titles.
- **Title** (600, 20px, 28px line-height, -0.5px tracking): the store wordmark and comparable prominent short labels.
- **Body** (400, 16px, 24px line-height): default running copy; a lead variant at 18px/28px is used for hero subcopy only.
- **Label** (600, 12px, 16px line-height, 0.6px tracking, uppercase): the hero eyebrow badge and similar small all-caps tags.

### Named Rules
**The Compact Display Rule.** Display type never exceeds 48px, even in the hero. The brief explicitly rejected an oversized, all-whitespace hero headline; display type stays confident, not enormous.

## Layout

The storefront uses a centered max-width container (max-w-5xl for content-focused sections, max-w-6xl for the header bar) with responsive horizontal padding (`px-4` at mobile, `px-6` from `sm` up). Section rhythm runs on the `spacing` scale's larger steps — `py-14`(56px)/`py-20`(80px) for full-bleed hero/category bands — while component-internal rhythm stays tight (`gap-1.5`–`gap-3`, 6–12px).

The product grid collapses to a genuine single column below 400px — measured directly, not guessed: `ProductCard`'s quantity-stepper + Add button row needs roughly 150px of card width to render without its Add button being invisibly clipped by the card's own `overflow-hidden` (a `flex-1` button still has a browser-default `min-width: auto`, so it won't shrink below "Add" text's own readable minimum), a floor a 2-column grid only clears once the viewport is wide enough to give each column that much room. From 400px it's 2 columns, 3 at `sm`, 4 at `lg`, 5 at `xl` — a deliberate density choice so compact product cards read as a real catalog once there's room for one. The single-column card itself uses a shorter `aspect-[4/3]` image (reverting to the standard square once multi-column at 400px+) so the image doesn't dominate the card's height when it's the only thing in the row. Checkout and order-detail surfaces switch from a single stacked column below `lg` to a two-column layout at `lg`+ (form fields left, a sticky order summary right at `lg:sticky lg:top-24`).

## Elevation & Depth

Flat-by-default, shadow-on-intent. Surfaces at rest carry a 1px Hairline border and a tonal background step (Paper on Parchment, or Soft Fog for muted panels) — no ambient shadow. Shadow is reserved for two things: an explicit hover response (product cards lift with `hover:shadow-md` and a 2px translate) and true floating overlays (select/popover panels use `ring-1 ring-foreground/10` plus `shadow-md`, not a heavier drop shadow).

### Shadow Vocabulary
- **Hover lift** (`box-shadow: theme(shadow-md)`, paired with `translateY(-2px)`): product cards and category tiles only, on hover — signals "this is clickable," never applied at rest.
- **Popover shadow** (`box-shadow: theme(shadow-md)` + `ring-1 ring-foreground/10`): select dropdowns and similar transient overlays.

### Named Rules
**The Flat-By-Default Rule.** Nothing casts a shadow at rest. If a surface needs to look "raised" while idle, that's a signal to use a tonal background step or a Hairline border instead, not a shadow.

## Shapes

Two families of corner language, used deliberately: fully rounded pills (`rounded-full`, 9999px) for anything selectable or badge-like — the compact size picker, tab toggles, the hero eyebrow badge, "Track Orders" link, and (since the homepage redesign) the homepage's own category-rail chips, which replaced the earlier `rounded-2xl` category-tile cards entirely — and softer rounded rectangles for containers. Container radius scales with size: small controls (buttons, inputs) sit at 12px, cards and product cards at 16px. Borders are always 1px Hairline (or, in the homepage's dark variant, a translucent white border at the equivalent weight); there is no double-border or outlined-plus-shadow combination anywhere in the system.

## Components

### Buttons
- **Shape:** rounded rectangle (12px / `rounded-lg`), 1px transparent border by default.
- **Primary:** Klasiq Red background, Klasiq Red Ink text, 32px height, 10px horizontal padding at the default size (`h-8 px-2.5`); a 44px `lg` size is used for the checkout submit.
- **Hover / Focus:** primary hover drops to 80% opacity (`bg-primary/80`); every variant gets a 3px ring in `ring-ring/50` on focus-visible; active state nudges 1px down (`translate-y-px`) rather than changing color.
- **Outline / Secondary / Ghost:** Outline sits on Parchment with a Hairline border and fills to Soft Fog on hover; Secondary uses Quiet Slate/Quiet Slate Ink and darkens slightly on hover; Ghost is borderless until hover, when it also fills to Soft Fog.

### Chips / Pills
- **Style:** fully rounded (`rounded-full`), Quiet Slate background for inactive states.
- **State:** the fulfillment-method toggle (Store Pickup / Local Delivery) is a pill-shaped tab group — the active pill switches to Klasiq Red with Klasiq Red Ink text and a subtle shadow; the hero eyebrow badge is a static Marquee Gold pill.

### Cards / Containers
- **Corner Style:** 16px (`rounded-xl`) for the generic Card primitive and ProductCard; 22px (`rounded-2xl`) for the larger category-discovery tiles.
- **Background:** Paper on top of the page's Parchment background — the system's primary depth cue is this one background-color step, not shadow.
- **Shadow Strategy:** none at rest; `hover:shadow-md` + a 2px lift only on interactive cards (see Elevation & Depth).
- **Border:** 1px Hairline.
- **Internal Padding:** 16px (`--card-spacing: --spacing(4)`) for the generic Card; ProductCard uses a tighter 10px (`p-2.5`) to stay compact.

### Inputs / Fields
- **Style:** transparent background, 1px Hairline border, 12px radius, 32px height by default.
- **Focus:** border shifts to Klasiq Red (`focus-visible:border-ring`) with a 3px `ring-ring/50` glow — no background change.
- **Error / Disabled:** invalid fields get an Alert Red border and ring; disabled fields drop to 50% opacity with a faint Hairline fill.

### Navigation
- **Style:** the header wordmark uses Title-scale Fraunces; category links are Body-scale, medium-weight, pill-shaped on hover/active (`rounded-full` + Soft Fog fill). "Track Orders" is a Hairline-bordered pill with an icon. Mobile collapses the category nav and school search into a left-side sheet (`Menu` icon trigger), keeping "Search Products" and "Track Orders" as plain list rows below the categories.

### Product Card (signature)
The system's most distinctive component and the one the brief most explicitly redesigned: a compact shelf-tag card, not a mini detail page. Square-to-portrait thumbnail on top, then name, price + stock status, a single pill-shaped `Select` for size (replacing a row of size buttons), a 36px quantity stepper, and an "Add" button — all inside 16px-radius Paper card with a 10px internal padding. The whole card lifts 2px with a shadow on hover; nothing else about it animates. The Add button's label stays literally "Add" (never "Add to Bag") to survive 2-column mobile grids without truncating; the full action is still exposed to assistive tech via `aria-label`.

### Product Image Placeholder

Shown whenever a product has no photo (a permanent, expected state for much of the catalog, not an error) — a flat, single-tone `bg-muted` panel with a large, quiet category icon (`text-muted-foreground/75`, `strokeWidth: 1.25`) centered inside. Deliberately not a diagonal stripe pattern or a circular badge (an earlier version of both was tried and read as a generic dev placeholder rather than something a retailer would actually ship). The icon scales to its context — compact (checkout/bag line items), default (product cards, category grids), or large (the Product Detail page's much bigger image slot) — a fixed size read as sparse and lost once the component started being used in a panel several times larger than the card contexts it was originally tuned for.

### Horizontal Scroll Fade (signature)
Any row that scrolls horizontally instead of wrapping (the homepage category rail, the header's own category nav, the Product Detail size selector) pairs `overflow-x-auto` with a trailing edge fade — a `pointer-events-none` absolutely-positioned strip using `bg-gradient-to-l from-background to-transparent` — rather than relying on a chip or option happening to peek past the visible edge on its own. A final QA pass found that "natural" peek is accidental: a width-by-width sweep of the homepage rail found it missing entirely at exactly 375px (a common real device width) even though it held at every neighboring width tested. The fade makes "there's more to scroll" a guaranteed cue instead of a coincidence of pixel math, and costs nothing when a row isn't actually scrollable (nothing sits under the faded strip in that case). Don't add arrows on top of this — the fade is the whole affordance.

### Homepage Category Rail (signature)
Replaced the earlier 5-card category grid. A horizontally-scrolling single row of pill chips (icon + label, `rounded-full`), never wrapping to multiple lines at any width — the same "always a real scroller, never an awkward wrap" behavior the rest of the system already used for the header's own category nav (see Horizontal Scroll Fade above — both now share the identical fade treatment). Exactly one chip — the category `pickBrowseFallbackCategory` resolves as primary/uniform-like — gets the signature solid `bg-primary text-primary-foreground` treatment; every other chip shares one neutral `bg-card` treatment. On the homepage's dark variant, the signature chip must stay a *solid* fill, never a translucent tint — see Colors → Dark Variant for why.

### Mobile Sticky Purchase Bar (Product Detail)
Below `sm`, a `fixed inset-x-0 bottom-0` bar (`bg-card/95` with backdrop blur, 1px top Hairline) keeps price, a compact outline "Buy Now," and a solid primary "Add to Bag" reachable without scrolling back up past description/fulfillment content. It reuses the exact same `addToBag()` call and disabled/loading state as the inline buttons above it — one source of truth, two renderings. Bottom padding on the page (`pb-[calc(5rem+env(safe-area-inset-bottom))]`, mobile only, sized to the bar's own measured rendered height rather than a guessed constant) plus `pb-[env(safe-area-inset-bottom)]` inside the bar itself keep it clear of real content and respect device safe areas. Use this pattern any time a purchase-style page needs a persistent mobile action bar; don't duplicate more than price + the two purchase actions into it.

### Fulfillment Info List (Product Detail)
A short, compact list of real fulfillment/payment facts sourced from `FULFILLMENT_CONFIG` and business logic only (Store Pickup, Local Delivery, "Pay at store or cash on delivery") — a small icon (`text-foreground/60`) plus one line of plain copy per item, no card wrapper, no divider of its own (it inherits the page's spacing rhythm instead). Never invent a policy or promise not backed by real config; never expand this into a marketing "why choose us" section.

## Do's and Don'ts

### Do:
- **Do** keep Klasiq Red as the only color that means "act here" — CTAs, prices, active states (see The One Red Rule).
- **Do** keep Marquee Gold rare — one badge per screen, never a repeating or background color (see The Gold Is Rare Rule).
- **Do** keep product cards compact — shelf-tag density (image, name, price/stock, compact size picker, Add) over a mini detail page.
- **Do** use the pill shape (`rounded-full`) for anything selectable — tabs, the size picker, badges — and reserve softer rounded rectangles for containers.
- **Do** let shadow appear only on hover or for true overlays; surfaces stay flat at rest (see The Flat-By-Default Rule).
- **Do** keep display type at or below 48px, even in the hero (see The Compact Display Rule).

### Don't:
- **Don't** introduce comic/superhero iconography, halftone/ben-day-dot textures, or any likeness-based imagery — "cinematic energy" is a color-and-contrast metaphor here, not a licensed aesthetic.
- **Don't** let general-retail categories (footwear, bags, kurtis) feel like an afterthought to the uniform/school framing, or vice versa — the palette and components are shared and neutral across both.
- **Don't** widen the product card back toward a detail-page layout (full-width buy button, expanded size-button row, long description) to "fix" a spacing complaint — the fix is always inside the existing compact card.
- **Don't** add a shadow to a surface just to make it feel important while at rest — use a Paper-on-Parchment background step or a Hairline border instead.
