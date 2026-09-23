import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ProductDetail } from "@/components/product/product-detail";
import { getProductBySlug } from "@/server/queries/products";

type PageProps = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) return {};

  return {
    title: product.name,
    description: product.description ?? `${product.name} — ${product.category.name} at Klasiq.`,
    alternates: { canonical: `/product/${product.slug}` },
  };
}

/**
 * Phase 3.7 Part 3 — the standalone Product Detail page, a top-level
 * `/product/[slug]` route (never nested under `/[categorySlug]/...` —
 * the brief explicitly asks for no category-specific product routes,
 * and a flat route also means there is no category segment in the URL
 * for a client to manipulate in the first place; the product's own
 * `category` relation, read fresh in `getProductBySlug`, is the only
 * source of truth for which category it belongs to). `product/` is a
 * static segment, so it takes routing precedence over the
 * `/[categorySlug]` dynamic catch-all exactly like `/bag`, `/checkout`,
 * `/search`, and `/track` already do — no category could ever be
 * literally slugged "product" and shadow this route (the same
 * precedence Phase 3.6.7 already verified for those other statics).
 *
 * An unknown OR deactivated product both 404 identically — see
 * `getProductBySlug`'s own doc comment for why that's the same
 * treatment every other public product query already gives an inactive
 * row.
 */
export default async function ProductDetailPage({ params }: PageProps) {
  const { slug } = await params;
  const product = await getProductBySlug(slug);
  if (!product) notFound();

  return <ProductDetail product={product} />;
}
