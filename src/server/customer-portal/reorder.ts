import { db } from "@/lib/db";
import { clampSetQuantity } from "@/lib/basket-math";
import { isVariantOrderable } from "@/lib/stock";
import { MAX_QUANTITY_PER_LINE } from "@/lib/validation/basket";

export type ReorderLine = { name: string; size: string; quantity: number };
export type SkippedLine = { name: string; size: string; reason: string };

export type ReorderResult =
  | { success: true; added: ReorderLine[]; skipped: SkippedLine[]; priceChanged: boolean }
  | { success: false; message: string };

/**
 * "Order again": puts a past order's items back in the bag at today's
 * prices. Each line gets the quantity bought last time (capped by stock
 * and the 20-per-line limit); a line already in the bag is raised to that
 * quantity, never doubled, so tapping twice is harmless. Items no longer
 * sold or out of stock are skipped and named, not silently dropped.
 */
export async function reorderIntoBasket(params: {
  orderNumber: string;
  customerDbId: string;
  basketId: string;
}): Promise<ReorderResult> {
  const order = await db.order.findFirst({
    where: { orderNumber: params.orderNumber, customerId: params.customerDbId },
    select: {
      items: {
        orderBy: { id: "asc" },
        select: {
          productVariantId: true,
          productName: true,
          size: true,
          quantity: true,
          unitPriceInPaise: true,
          productVariant: {
            select: {
              isActive: true,
              stockStatus: true,
              stockQuantity: true,
              priceInPaise: true,
              product: { select: { isActive: true } },
            },
          },
        },
      },
    },
  });
  if (!order) return { success: false, message: "Order not found." };

  // The same pack can appear on more than one line of an old order.
  const wanted = new Map<string, (typeof order.items)[number] & { total: number }>();
  for (const item of order.items) {
    const seen = wanted.get(item.productVariantId);
    if (seen) seen.total += item.quantity;
    else wanted.set(item.productVariantId, { ...item, total: item.quantity });
  }

  const added: ReorderLine[] = [];
  const skipped: SkippedLine[] = [];
  let priceChanged = false;

  for (const [variantId, item] of wanted) {
    const variant = item.productVariant;
    if (!variant.isActive || !variant.product.isActive) {
      skipped.push({ name: item.productName, size: item.size, reason: "No longer sold" });
      continue;
    }
    if (!isVariantOrderable({ isActive: true, productIsActive: true, stockStatus: variant.stockStatus }) || variant.stockQuantity <= 0) {
      skipped.push({ name: item.productName, size: item.size, reason: "Out of stock" });
      continue;
    }
    const quantity = clampSetQuantity({
      requestedQuantity: item.total,
      stockQuantity: variant.stockQuantity,
      maxPerLine: MAX_QUANTITY_PER_LINE,
    });

    const existing = await db.basketItem.findUnique({
      where: { basketId_productVariantId: { basketId: params.basketId, productVariantId: variantId } },
      select: { id: true, quantity: true },
    });
    if (existing) {
      if (existing.quantity < quantity) {
        await db.basketItem.update({ where: { id: existing.id }, data: { quantity } });
      }
    } else {
      await db.basketItem.create({
        data: { basketId: params.basketId, productVariantId: variantId, quantity, priceInPaiseAtAdd: variant.priceInPaise },
      });
    }
    if (variant.priceInPaise !== item.unitPriceInPaise) priceChanged = true;
    added.push({ name: item.productName, size: item.size, quantity });
    if (quantity < item.total) {
      skipped.push({ name: item.productName, size: item.size, reason: `Only ${quantity} available` });
    }
  }

  return { success: true, added, skipped, priceChanged };
}
