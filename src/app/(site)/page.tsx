import Link from "next/link";
import type { Metadata } from "next";
import { PromoCarousel } from "@/components/home/promo-carousel";
import { ProductShelf } from "@/components/home/product-shelf";
import { getCategoryIcon } from "@/lib/category-icons";
import { BRAND } from "@/lib/constants";
import { getActivePromoBanners } from "@/server/queries/banners";
import { getCategoryProducts, getHeaderCategories } from "@/server/queries/categories";

export const metadata: Metadata = {
  description: BRAND.description,
};

const SHELF_SIZE = 12;

/**
 * Homepage, built to the quick-commerce standard (Blinkit/Zepto craft bar)
 * in Klasiq red and black: swipeable banners (managed in /admin/banners), a
 * shop-by-category tile grid, then one swipeable shelf per aisle. Search
 * lives in the sticky header, so the page opens straight onto products.
 */
export default async function HomePage() {
  const [categories, banners] = await Promise.all([getHeaderCategories(), getActivePromoBanners()]);
  const shelves = (
    await Promise.all(
      categories.map(async (category) => ({
        category,
        products: await getCategoryProducts(category.slug, undefined, SHELF_SIZE),
      })),
    )
  ).filter((shelf) => shelf.products.length > 0);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-7 px-4 pb-10 pt-4 sm:gap-10 sm:px-6 sm:pt-6">
      {/* The page's one heading, for screen readers and search engines —
          visually the red header's wordmark already names the store. */}
      <h1 className="sr-only">{BRAND.name} — groceries and daily essentials</h1>
      {banners.length > 0 && <PromoCarousel slides={banners} />}

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
