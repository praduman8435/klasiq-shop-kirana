import { db } from "@/lib/db";

// Foundation for /admin/counter-sale's product search — optimized for a
// single fast type-ahead: matches by product name OR variant SKU and
// returns one flattened row per sellable variant (size/price/stock inline)
// so staff can search and add in one step, never navigating to a
// per-product page. See docs/PHASE_3_2_REPORT.md "Product search".
const COUNTER_SALE_SEARCH_LIMIT = 30;

export async function searchSellableVariants(query: string, limit = COUNTER_SALE_SEARCH_LIMIT) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  const variants = await db.productVariant.findMany({
    where: {
      isActive: true,
      product: { isActive: true },
      OR: [
        { product: { name: { contains: trimmed, mode: "insensitive" } } },
        { sku: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          category: { select: { name: true } },
          school: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
    take: limit,
  });

  return variants.map((variant) => ({
    variantId: variant.id,
    productId: variant.product.id,
    productName: variant.product.name,
    categoryName: variant.product.category.name,
    schoolId: variant.product.school?.id ?? null,
    schoolName: variant.product.school?.name ?? null,
    size: variant.size,
    sku: variant.sku,
    priceInPaise: variant.priceInPaise,
    stockQuantity: variant.stockQuantity,
    stockStatus: variant.stockStatus,
  }));
}
