import Link from "next/link";
import type { Metadata } from "next";
import { PromoCarousel, type PromoSlide } from "@/components/home/promo-carousel";
import { ProductShelf } from "@/components/home/product-shelf";
import { getCategoryIcon } from "@/lib/category-icons";
import { BRAND } from "@/lib/constants";
import { FULFILLMENT_CONFIG } from "@/lib/fulfillment-config";
import { formatPaise } from "@/lib/money";
import { getCategoryProducts, getHeaderCategories } from "@/server/queries/categories";

export const metadata: Metadata = {
  description: BRAND.description,
};

const SHELF_SIZE = 12;

/** Banner slides from live config only — every line is a fact the store
 * stands behind (delivery radius/threshold, pickup, payment), never an
 * invented offer or delivery time. */
function getPromoSlides(firstAisleHref: string): PromoSlide[] {
  const { deliveryEnabled, pickupEnabled, freeDeliveryRadiusMeters, freeDeliveryThresholdInPaise } =
    FULFILLMENT_CONFIG;
  const km = freeDeliveryRadiusMeters / 1000;
  const radius = Number.isInteger(km) ? `${km} km` : `${km.toFixed(1)} km`;
  const slides: PromoSlide[] = [];

  if (deliveryEnabled) {
    slides.push({
      id: "free-delivery",
      title: `Free delivery within ${radius}`,
      body: `Further away? Still free on orders above ${formatPaise(freeDeliveryThresholdInPaise)}.`,
      cta: { label: "Start shopping", href: firstAisleHref },
      icon: "delivery",
      tone: "red",
    });
  }
  if (pickupEnabled) {
    slides.push({
      id: "pickup",
      title: "Order now, pick up at the store",
      body: "Your order is packed and waiting at the counter when you arrive.",
      cta: { label: "Browse aisles", href: "#categories-heading" },
      icon: "pickup",
      tone: "ink",
    });
  }
  slides.push({
    id: "payment",
    title: "Pay when it reaches you",
    body: "Cash on delivery, or pay at the store. No card or online payment needed.",
    icon: "payment",
    tone: "soft",
  });
  return slides;
}

/**
 * Homepage, built to the quick-commerce standard (Blinkit/Zepto craft bar)
 * in Klasiq red and black: a one-line welcome, swipeable fact banners, a
 * shop-by-category tile grid, then one swipeable shelf per aisle. Search
 * lives in the sticky header, so the page opens straight onto products.
 */
export default async function HomePage() {
  const categories = await getHeaderCategories();
  const shelves = (
    await Promise.all(
      categories.map(async (category) => ({
        category,
        products: await getCategoryProducts(category.slug, undefined, SHELF_SIZE),
      })),
    )
  ).filter((shelf) => shelf.products.length > 0);
  const firstAisleHref = categories[0] ? `/${categories[0].slug}` : "/search";

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 pb-10 pt-4 sm:gap-10 sm:px-6 sm:pt-6">
      <div className="flex flex-col gap-4">
        <h1 className="max-w-xl text-balance text-2xl font-extrabold leading-[1.1] sm:text-3xl">
          {BRAND.heroHeadline}
        </h1>
        <PromoCarousel slides={getPromoSlides(firstAisleHref)} />
      </div>

      {categories.length > 0 && (
        <section aria-labelledby="categories-heading" className="scroll-mt-32">
          <h2 id="categories-heading" className="text-lg font-extrabold leading-tight sm:text-xl">
            Shop by category
          </h2>
          <ul className="mt-3 grid grid-cols-4 gap-x-2.5 gap-y-4 sm:grid-cols-8 sm:gap-x-4">
            {categories.map((category) => {
              const Icon = getCategoryIcon(category.slug || category.name);
              return (
                <li key={category.slug}>
                  <Link
                    href={`/${category.slug}`}
                    className="group flex flex-col items-center gap-2 rounded-2xl focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <span className="flex aspect-square w-full items-center justify-center rounded-2xl bg-brand-soft transition-transform duration-200 group-hover:-translate-y-0.5 group-active:scale-95">
                      <Icon className="size-8 text-brand-deep sm:size-10" strokeWidth={1.5} aria-hidden />
                    </span>
                    <span className="line-clamp-2 text-center text-xs font-semibold leading-tight text-foreground sm:text-sm">
                      {category.name}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {shelves.map(({ category, products }) => (
        <ProductShelf key={category.slug} title={category.name} href={`/${category.slug}`} products={products} />
      ))}
    </div>
  );
}
