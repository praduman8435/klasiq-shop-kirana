import Link from "next/link";
import type { Metadata } from "next";
import { ArrowRight, Store, Truck, Wallet, type LucideIcon } from "lucide-react";
import { SiteSearch } from "@/components/site/site-search";
import { ProductCard } from "@/components/product/product-card";
import { ProductSheet } from "@/components/product/product-sheet";
import { getCategoryIcon } from "@/lib/category-icons";
import { BRAND } from "@/lib/constants";
import { FULFILLMENT_CONFIG } from "@/lib/fulfillment-config";
import { cn } from "@/lib/utils";
import { getFeaturedProducts, getHeaderCategories } from "@/server/queries/categories";

export const metadata: Metadata = {
  description: BRAND.description,
};

/** Only facts backed by live config — the same three the Product Detail
 * page's fulfilment list states, never a promise the store doesn't make. */
function getStoreFacts(): { icon: LucideIcon; label: string; value: string }[] {
  return [
    ...(FULFILLMENT_CONFIG.pickupEnabled ? [{ icon: Store, label: "Pickup", value: "Collect at the store" }] : []),
    ...(FULFILLMENT_CONFIG.deliveryEnabled ? [{ icon: Truck, label: "Delivery", value: "Local home delivery" }] : []),
    { icon: Wallet, label: "Payment", value: "Pay at store or on delivery" },
  ];
}

/**
 * Homepage — "search + aisles" first. The name panel is the pack's front:
 * headline, a full-width search, and a ruled strip of real fulfilment
 * facts like the NET QTY / MRP / BEST BEFORE row on a pack. The aisles
 * follow as a ruled contents table with dotted leaders, then a shelf of
 * real products laid out as a sheet of pack panels.
 */
export default async function HomePage() {
  const [categories, featuredProducts] = await Promise.all([
    getHeaderCategories(),
    getFeaturedProducts(10),
  ]);
  const facts = getStoreFacts();

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 pb-12 pt-4 sm:gap-12 sm:px-6 sm:pt-8">
      <section aria-labelledby="home-heading" className="border border-foreground bg-card">
        <div className="px-4 pb-5 pt-6 sm:px-8 sm:pb-8 sm:pt-10">
          <h1
            id="home-heading"
            className="max-w-[14ch] text-balance text-4xl font-extrabold leading-[0.95] sm:text-6xl"
          >
            {BRAND.heroHeadline}
          </h1>
          <SiteSearch size="hero" className="mt-5 max-w-2xl sm:mt-7" />
        </div>
        <dl
          className="grid border-t border-foreground [&>div+div]:border-l [&>div+div]:border-foreground"
          style={{ gridTemplateColumns: `repeat(${facts.length}, minmax(0, 1fr))` }}
        >
          {facts.map((fact) => (
            <div key={fact.label} className="flex min-w-0 flex-col gap-1.5 px-3 py-3 sm:flex-row sm:items-center sm:gap-3 sm:px-8 sm:py-4">
              <fact.icon className="size-5 shrink-0" strokeWidth={1.75} aria-hidden />
              <div className="min-w-0">
                <dt className="decl-label">{fact.label}</dt>
                <dd className="mt-1 text-xs leading-snug text-muted-foreground sm:text-sm">{fact.value}</dd>
              </div>
            </div>
          ))}
        </dl>
      </section>

      {categories.length > 0 && (
        <section aria-labelledby="aisles-heading">
          <h2 id="aisles-heading" className="text-2xl font-extrabold leading-none sm:text-3xl">
            Aisles
          </h2>
          <ul className="mt-4 grid border border-foreground bg-card px-4 sm:grid-cols-2 sm:gap-x-10 sm:px-6">
            {categories.map((category, index) => {
              const Icon = getCategoryIcon(category.slug || category.name);
              return (
                <li
                  key={category.slug}
                  className={cn(
                    "border-foreground/20",
                    index > 0 && "border-t",
                    index === 1 && "sm:border-t-0",
                  )}
                >
                  <Link
                    href={`/${category.slug}`}
                    className="group flex min-h-13 items-center gap-3 py-2.5 focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
                  >
                    <Icon className="size-5 shrink-0" strokeWidth={1.5} aria-hidden />
                    <span className="text-base font-bold leading-tight group-hover:underline group-hover:underline-offset-4">
                      {category.name}
                    </span>
                    <span
                      aria-hidden
                      className="mx-1 h-0 min-w-4 flex-1 translate-y-1 border-b-2 border-dotted border-foreground/35"
                    />
                    <ArrowRight
                      className="size-4 shrink-0 transition-transform group-hover:translate-x-0.5"
                      aria-hidden
                    />
                  </Link>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {featuredProducts.length > 0 && (
        <section aria-labelledby="essentials-heading">
          <h2 id="essentials-heading" className="text-2xl font-extrabold leading-none sm:text-3xl">
            Everyday essentials
          </h2>
          <ProductSheet className="mt-4">
            {featuredProducts.map((product) => (
              <ProductCard key={product.id} product={product} />
            ))}
          </ProductSheet>
        </section>
      )}
    </div>
  );
}
