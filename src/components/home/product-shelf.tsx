import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { ProductCard } from "@/components/product/product-card";
import type { ProductWithVariants } from "@/types/catalog";

/**
 * One aisle as a horizontal shelf: title and "See all" on one line, then
 * product tiles you swipe through with a thumb (snap-aligned, edge to
 * edge on phones so the next tile visibly peeks in). From `lg` up the
 * shelf has room to show a full row without scrolling.
 *
 * The list is `relative` on purpose: each card's pack-size select renders
 * a hidden, absolutely-positioned form input, and without a positioned
 * scroller those inputs escape its overflow clipping and stretch the whole
 * phone page sideways.
 */
export function ProductShelf({
  title,
  href,
  products,
}: {
  title: string;
  href: string;
  products: ProductWithVariants[];
}) {
  const headingId = `shelf-${href.replace(/\W+/g, "-")}`;

  return (
    <section aria-labelledby={headingId}>
      <div className="flex items-end justify-between gap-3">
        <h2 id={headingId} className="text-lg font-extrabold leading-tight sm:text-xl">
          {title}
        </h2>
        <Link
          href={href}
          className="-mr-1 inline-flex shrink-0 items-center gap-0.5 rounded-md px-1 py-1 text-sm font-bold text-primary hover:underline focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-ring"
        >
          See all
          <ChevronRight className="size-4" strokeWidth={2.5} aria-hidden />
        </Link>
      </div>
      <ul className="no-scrollbar relative -mx-4 mt-3 flex snap-x snap-mandatory scroll-px-4 gap-3 overflow-x-auto px-4 pb-4 pt-0.5">
        {products.map((product) => (
          <li key={product.id} className="flex w-[9.75rem] shrink-0 snap-start sm:w-44">
            <ProductCard product={product} className="w-full" />
          </li>
        ))}
      </ul>
    </section>
  );
}
