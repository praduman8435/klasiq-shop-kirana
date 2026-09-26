import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ExternalLink, EyeOff } from "lucide-react";
import { ProductForm } from "@/components/admin/product-form";
import { ProductVariantsManager } from "@/components/admin/product-variants-manager";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { getAllCategories } from "@/server/queries/admin/categories";
import { getAdminProductById } from "@/server/queries/admin/products";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getAdminProductById(id);
  return { title: product?.name ?? "Product" };
}

/**
 * One product. Prices and stock change most often, so pack sizes come
 * first (left on a wide screen); the photo and details sit beside them.
 */
export default async function AdminProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [product, categories] = await Promise.all([getAdminProductById(id), getAllCategories()]);
  if (!product) notFound();

  return (
    <div className="flex flex-col gap-5">
      <Link href="/admin/products" className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="size-4" aria-hidden />
        Products
      </Link>

      <header className="flex items-center gap-4">
        <ProductThumbnail
          imageUrl={product.imageUrl}
          alt=""
          categorySlug={product.category.slug}
          compact
          className="size-16 shrink-0 rounded-xl border border-border"
        />
        <div className="min-w-0 flex-1">
          <h1 className="font-heading text-xl font-semibold tracking-tight text-balance">{product.name}</h1>
          <p className="mt-0.5 text-sm text-muted-foreground">{[product.brand, product.category.name].filter(Boolean).join(" · ")}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
            {product.isActive ? (
              <Link href={`/product/${product.slug}`} target="_blank" className="inline-flex items-center gap-1 text-muted-foreground hover:text-foreground">
                On website
                <ExternalLink className="size-3" aria-hidden />
              </Link>
            ) : (
              <span className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-muted-foreground">
                <EyeOff className="size-3" aria-hidden />
                Hidden from website
              </span>
            )}
          </div>
        </div>
      </header>

      <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)] lg:items-start">
        <section aria-labelledby="packs-heading" className="flex flex-col gap-3">
          <div>
            <h2 id="packs-heading" className="font-heading text-base font-semibold">
              Pack sizes &amp; prices
            </h2>
            <p className="mt-0.5 text-sm text-muted-foreground">Tap a size to change its price or stock.</p>
          </div>
          <ProductVariantsManager productId={product.id} variants={product.variants} />
        </section>

        <section aria-labelledby="details-heading" className="flex flex-col gap-3 lg:sticky lg:top-6">
          <h2 id="details-heading" className="font-heading text-base font-semibold">
            Details
          </h2>
          <div className="rounded-xl border border-border bg-card p-4 sm:p-5">
            <ProductForm
              initial={{
                id: product.id,
                name: product.name,
                slug: product.slug,
                description: product.description ?? "",
                categoryId: product.categoryId,
                brand: product.brand ?? "",
                imageUrl: product.imageUrl ?? "",
                isActive: product.isActive,
              }}
              categories={categories}
            />
          </div>
        </section>
      </div>
    </div>
  );
}
