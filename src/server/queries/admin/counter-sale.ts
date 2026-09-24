import { db } from "@/lib/db";

// Foundation for /admin/counter-sale's product search — optimized for a
// single fast type-ahead: matches by product name, brand, OR variant SKU and
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
        { product: { brand: { contains: trimmed, mode: "insensitive" } } },
        { sku: { contains: trimmed, mode: "insensitive" } },
      ],
    },
    include: {
      product: {
        select: {
          id: true,
          name: true,
          brand: true,
          category: { select: { name: true } },
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
    brand: variant.product.brand,
    size: variant.size,
    sku: variant.sku,
    priceInPaise: variant.priceInPaise,
    stockQuantity: variant.stockQuantity,
    stockStatus: variant.stockStatus,
  }));
}

const QUICK_PICK_WINDOW_DAYS = 30;

type SellableVariant = Awaited<ReturnType<typeof searchSellableVariants>>[number];

/**
 * The counter's one-tap items: what sold most (by quantity) over the last
 * 30 days, in stock right now, topped up with other in-stock items so a
 * new shop still sees a full row. Same shape as a search result.
 */
export async function getCounterQuickPicks(limit = 12): Promise<SellableVariant[]> {
  const since = new Date(Date.now() - QUICK_PICK_WINDOW_DAYS * 86_400_000);
  const top = await db.orderItem.groupBy({
    by: ["productVariantId"],
    where: { order: { createdAt: { gte: since }, status: { not: "CANCELLED" } } },
    _sum: { quantity: true },
    orderBy: { _sum: { quantity: "desc" } },
    take: limit * 2,
  });
  const rank = new Map(top.map((t, i) => [t.productVariantId, i]));
  const sellable = { isActive: true, product: { isActive: true }, stockQuantity: { gt: 0 } } as const;
  const include = {
    product: { select: { id: true, name: true, brand: true, category: { select: { name: true } } } },
  } as const;

  const topVariants = await db.productVariant.findMany({
    where: { ...sellable, id: { in: [...rank.keys()] } },
    include,
  });
  topVariants.sort((a, b) => (rank.get(a.id) ?? 0) - (rank.get(b.id) ?? 0));
  let picks = topVariants.slice(0, limit);
  if (picks.length < limit) {
    const fill = await db.productVariant.findMany({
      where: { ...sellable, id: { notIn: picks.map((v) => v.id) } },
      include,
      orderBy: [{ product: { name: "asc" } }, { sortOrder: "asc" }],
      take: limit - picks.length,
    });
    picks = [...picks, ...fill];
  }

  return picks.map((variant) => ({
    variantId: variant.id,
    productId: variant.product.id,
    productName: variant.product.name,
    categoryName: variant.product.category.name,
    brand: variant.product.brand,
    size: variant.size,
    sku: variant.sku,
    priceInPaise: variant.priceInPaise,
    stockQuantity: variant.stockQuantity,
    stockStatus: variant.stockStatus,
  }));
}
