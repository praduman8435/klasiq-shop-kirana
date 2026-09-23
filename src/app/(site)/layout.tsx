import type { Viewport } from "next";
import { SiteHeader } from "@/components/site/header";
import { SiteFooter } from "@/components/site/footer";
import { MobileBagBar } from "@/components/site/mobile-bag-bar";
import { BasketQuantitiesProvider } from "@/components/basket/basket-quantities";
import { basketItemCount, basketTotalInPaise, basketVariantQuantities, getBasket } from "@/lib/basket";
import { BRAND } from "@/lib/constants";

/*
 * DESIGN CONTRACT — storefront
 * FORM: the quick-commerce category standard (Blinkit/Zepto craft bar),
 *   chosen explicitly by the user, in Klasiq red and black.
 * OWN-WORLD: solid Klasiq-red app header with a sticky rounded search;
 *   white rounded tiles on a near-white ground; red is the one action
 *   colour (ADD/steppers, cart bar, primary buttons); near-black ink.
 * STORY: search or tap a category, add items straight from the tile with
 *   an in-place stepper, watch the floating bag bar total, check out.
 * FIRST VIEWPORT: red header + search, a one-line welcome, swipeable fact
 *   banners (from live config only), then the category tile grid.
 */

export const viewport: Viewport = {
  themeColor: "#cd171e",
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
        <BasketQuantitiesProvider quantities={basketVariantQuantities(basket)}>{children}</BasketQuantitiesProvider>
      </main>
      <SiteFooter storeName={BRAND.name} />
      <MobileBagBar itemCount={basketItemCount(basket)} totalInPaise={basketTotalInPaise(basket)} />
    </div>
  );
}
