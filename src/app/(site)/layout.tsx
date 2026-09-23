import type { Viewport } from "next";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { MobileBagBar } from "@/components/site/mobile-bag-bar";
import { basketItemCount, basketTotalInPaise, getBasket } from "@/lib/basket";
import { BRAND } from "@/lib/constants";

/*
 * DESIGN CONTRACT — storefront world (seed 2c6dbd85)
 * THESIS: every product is shown the way its own pack states it — brand,
 *   net quantity, boxed MRP — with the shop's red price sticker on
 *   top. Refuses the quick-commerce tile grid and the cream-serif grocer.
 * OWN-WORLD: Klasiq red and black. Pack-white board on a cool shelf-grey
 *   ground under a solid black header band; black declaration print and
 *   1px black rules forming boxed fields; square corners; Archivo,
 *   condensed caps for labels; one red price sticker (rotated -3deg) per
 *   product; black is every action; black inkjet stamp for savings.
 * STORY: the customer searches or picks an aisle, reads price vs MRP at a
 *   glance, picks a pack size and adds it in one tap.
 * FIRST VIEWPORT: boxed name panel — headline, full-width search with a
 *   black Search button, a ruled strip of real fulfilment facts — then the
 *   aisles as a ruled contents table.
 * FORM: Pack Declaration Panel, grounded candidate 4 of 7, seed 2c6dbd85.
 * FINISH: unreviewed and undocumented is unfinished; this build ends with
 *   the finish review, the verdict, and DESIGN.md
 */

export const viewport: Viewport = {
  themeColor: "#151518",
};

/**
 * Wraps the whole storefront in ONE `.store-theme` scope (tokens + font,
 * see globals.css), so every page — header, footer and body — shares one
 * opaque background and one visual world. Portaled storefront surfaces
 * (mobile menu sheet, select popups, toasts) re-apply the same class
 * themselves, since they render outside this tree at `document.body`.
 */
export default async function SiteLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const basket = await getBasket();

  return (
    <div className="store-theme flex min-h-full flex-1 flex-col bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <SiteHeader storeName={BRAND.name} />
      <main id="main-content" className="flex-1">
        {children}
      </main>
      <SiteFooter storeName={BRAND.name} />
      <MobileBagBar itemCount={basketItemCount(basket)} totalInPaise={basketTotalInPaise(basket)} />
    </div>
  );
}
