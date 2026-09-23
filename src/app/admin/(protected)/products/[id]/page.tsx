import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ProductForm } from "@/components/admin/product-form";
import { ProductVariantsManager } from "@/components/admin/product-variants-manager";
import { getAdminProductById } from "@/server/queries/admin/products";
import { getAllCategories } from "@/server/queries/admin/categories";

type PageProps = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id } = await params;
  const product = await getAdminProductById(id);
  return { title: product?.name ?? "Product" };
}

export default async function AdminProductDetailPage({ params }: PageProps) {
  const { id } = await params;
  const [product, categories] = await Promise.all([getAdminProductById(id), getAllCategories()]);
  if (!product) notFound();

  return (
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href="/admin/products"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Products
        </Link>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-heading text-xl font-semibold tracking-tight">{product.name}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {product.category.name}
              {product.brand && ` · ${product.brand}`}
            </p>
          </div>
          {!product.isActive && (
            <Badge variant="outline" className="border-border text-muted-foreground">
              Inactive
            </Badge>
          )}
        </div>
      </div>

      <div className="max-w-xl">
        <h2 className="text-sm font-semibold">Product details</h2>
        <div className="mt-2">
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
      </div>

      <div className="my-6 border-t border-border" />

      <section>
        <h2 className="text-sm font-semibold">Pack sizes &amp; pricing</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">
          Each pack size has its own price, MRP, SKU and stock count.
        </p>
        <div className="mt-3">
          <ProductVariantsManager productId={product.id} variants={product.variants} />
        </div>
      </section>
    </div>
  );
}
