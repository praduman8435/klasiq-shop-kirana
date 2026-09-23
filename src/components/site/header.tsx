import Link from "next/link";
import { MapPin } from "lucide-react";
import { getHeaderCategories } from "@/server/queries/categories";
import { getSearchSuggestions } from "@/server/queries/products";
import { MobileNav } from "@/components/site/mobile-nav";
import { SearchBar } from "@/components/site/search-bar";
import { BagLink } from "@/components/site/bag-link";
import { TrackOrdersLink } from "@/components/site/track-orders-link";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import { basketItemCount, getBasket } from "@/lib/basket";
import { FULFILLMENT_CONFIG } from "@/lib/fulfillment-config";

/** The one-line "how you get it" under the wordmark — only what config
 * says the store actually offers, never an invented delivery time. */
function getFulfilmentLine(): string {
  const { pickupEnabled, deliveryEnabled } = FULFILLMENT_CONFIG;
  if (pickupEnabled && deliveryEnabled) return "Home delivery & store pickup";
  if (deliveryEnabled) return "Local home delivery";
  return "Order online, pick up at the store";
}

/**
 * The app header: a solid Klasiq-red band with the wordmark, the store's
 * fulfilment line, Track and the cart — and the rounded search bar, which
 * is sticky with the header on every page because search is how this
 * store's customers shop. On desktop the search sits inline in the top
 * row; on phones it takes its own full-width row.
 */
export async function SiteHeader({ storeName }: { storeName: string }) {
  const [categories, suggestions, basket] = await Promise.all([
    getHeaderCategories(),
    getSearchSuggestions(),
    getBasket(),
  ]);

  return (
    <header className="sticky top-0 z-30 bg-primary text-primary-foreground shadow-[0_1px_0_oklch(0.44_0.18_27)]">
      <div className="mx-auto flex max-w-6xl items-center gap-2 px-2 pb-2 pt-2 sm:gap-4 sm:px-6 md:pb-3 md:pt-3">
        <MobileNav
          categories={categories}
          bagCount={basketItemCount(basket)}
          wordmark={BRAND.wordmark}
          store={{
            fulfilmentLine: getFulfilmentLine(),
            serviceableAreaNote: FULFILLMENT_CONFIG.serviceableAreaNote,
            phone: STORE_CONTACT.phone,
            phoneHref: STORE_CONTACT.phoneHref,
            mapsUrl: STORE_CONTACT.mapsUrl,
          }}
        />

        <Link
          href="/"
          aria-label={`${storeName} home`}
          className="min-w-0 shrink rounded-lg px-1 py-0.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60"
        >
          <span className="block text-2xl font-black leading-none tracking-[-0.01em]">
            {BRAND.wordmark}
            <span className="text-foreground">.</span>
          </span>
          <span className="mt-1 flex items-center gap-1 text-xs font-semibold text-primary-foreground/85">
            <MapPin className="size-3 shrink-0" strokeWidth={2.5} aria-hidden />
            <span className="truncate">{getFulfilmentLine()}</span>
          </span>
        </Link>

        <SearchBar suggestions={suggestions} className="mx-2 hidden max-w-xl flex-1 md:block" />

        <div className="ml-auto flex shrink-0 items-center gap-1.5 sm:gap-2">
          <TrackOrdersLink
            className="inline-flex size-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-xl text-sm font-bold transition-colors hover:bg-black/10 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-white/60 lg:w-auto lg:px-3"
            activeClassName="bg-black/15"
            iconClassName="size-5"
          >
            <span className="hidden lg:inline">Track Orders</span>
          </TrackOrdersLink>
          <BagLink />
        </div>
      </div>

      <div className="px-3 pb-3 md:hidden">
        <SearchBar suggestions={suggestions} />
      </div>
    </header>
  );
}
