"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { getBasketId, getOrCreateBasketId } from "@/lib/basket";
import { isOrderable, isVariantOrderable } from "@/lib/stock";
import {
  clampAddQuantity,
  clampSetQuantity,
  pickDefaultOrderableVariant,
} from "@/lib/basket-math";
import {
  MAX_QUANTITY_PER_LINE,
  addRecommendedSetSchema,
  addToBasketSchema,
  removeBasketItemSchema,
  setBasketItemQuantitySchema,
} from "@/lib/validation/basket";

export type BasketActionResult = {
  success: boolean;
  message?: string;
};

function revalidateBasketViews() {
  // The bag icon/count lives in the root layout, and the bag page shows the
  // full basket — both need to reflect the change immediately.
  revalidatePath("/", "layout");
  revalidatePath("/bag");
}

export async function addToBasket(
  input: unknown,
): Promise<BasketActionResult> {
  const parsed = addToBasketSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid request." };
  }
  const { productVariantId, quantity } = parsed.data;

  // Price and stock are never trusted from the caller — always re-read here.
  const variant = await db.productVariant.findUnique({
    where: { id: productVariantId },
    include: { product: { select: { isActive: true } } },
  });
  if (!variant) {
    return { success: false, message: "That item no longer exists." };
  }
  // Phase 3.7 Part 4 — previously only checked `stockStatus`, never
  // `isActive`/`product.isActive` (two independent fields — deactivating
  // a variant/product never itself flips its stockStatus). A customer
  // could never see a deactivated item through the normal storefront UI
  // (ProductCard/ProductDetail already filter it out), but this Server
  // Action is a directly-reachable, independently-authoritative
  // boundary — "never rely on disabled UI controls as security" — so it
  // must reject one on its own terms too, exactly like
  // `resolveAndDecrementOrderLines` already does at checkout time. Kept
  // as its own distinct check (rather than folded into `isVariantOrderable`
  // here) so the out-of-stock message below stays unchanged.
  if (!variant.isActive || !variant.product.isActive) {
    return { success: false, message: "That item is no longer available." };
  }
  if (!isOrderable(variant.stockStatus)) {
    return { success: false, message: "That size is currently out of stock." };
  }

  const basketId = await getOrCreateBasketId();

  const existing = await db.basketItem.findUnique({
    where: {
      basketId_productVariantId: { basketId, productVariantId },
    },
  });

  const nextQuantity = clampAddQuantity({
    existingQuantity: existing?.quantity ?? 0,
    requestedQuantity: quantity,
    stockQuantity: variant.stockQuantity,
    maxPerLine: MAX_QUANTITY_PER_LINE,
  });

  if (nextQuantity <= (existing?.quantity ?? 0)) {
    return {
      success: false,
      message: `Only ${variant.stockQuantity} left in this size.`,
    };
  }

  if (existing) {
    // priceInPaiseAtAdd is deliberately left untouched here — it should
    // keep reflecting the price the parent originally saw, not reset every
    // time they bump the quantity of a line that's already in their bag.
    await db.basketItem.update({
      where: { id: existing.id },
      data: { quantity: nextQuantity },
    });
  } else {
    await db.basketItem.create({
      data: {
        basketId,
        productVariantId,
        quantity: nextQuantity,
        priceInPaiseAtAdd: variant.priceInPaise,
      },
    });
  }

  revalidateBasketViews();
  return { success: true };
}

async function assertOwnedBasketItem(basketItemId: string) {
  const basketId = await getBasketId();
  if (!basketId) return null;

  const item = await db.basketItem.findUnique({ where: { id: basketItemId } });
  if (!item || item.basketId !== basketId) return null;
  return item;
}

export async function setBasketItemQuantity(
  input: unknown,
): Promise<BasketActionResult> {
  const parsed = setBasketItemQuantitySchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid request." };
  }
  const { basketItemId, quantity } = parsed.data;

  const item = await assertOwnedBasketItem(basketItemId);
  if (!item) {
    return { success: false, message: "That item is not in your bag." };
  }

  if (quantity === 0) {
    await db.basketItem.delete({ where: { id: item.id } });
    revalidateBasketViews();
    return { success: true };
  }

  const variant = await db.productVariant.findUnique({
    where: { id: item.productVariantId },
    include: { product: { select: { isActive: true } } },
  });
  // Phase 3.7 Part 4 — now also checks `isActive`/`product.isActive` via
  // the shared `isVariantOrderable`, not just `stockStatus` (see
  // `addToBasket`'s identical fix above for the full reasoning) — a
  // variant or product deactivated after this line was added previously
  // survived a quantity-update attempt untouched, since only
  // stockStatus was checked.
  if (
    !variant ||
    !isVariantOrderable({
      isActive: variant.isActive,
      stockStatus: variant.stockStatus,
      productIsActive: variant.product.isActive,
    })
  ) {
    await db.basketItem.delete({ where: { id: item.id } });
    revalidateBasketViews();
    return { success: false, message: "That size is no longer available and was removed." };
  }

  const clamped = clampSetQuantity({
    requestedQuantity: quantity,
    stockQuantity: variant.stockQuantity,
    maxPerLine: MAX_QUANTITY_PER_LINE,
  });
  await db.basketItem.update({ where: { id: item.id }, data: { quantity: clamped } });

  revalidateBasketViews();
  if (clamped < quantity) {
    return { success: true, message: `Only ${variant.stockQuantity} left — quantity adjusted.` };
  }
  return { success: true };
}

export async function removeBasketItem(
  input: unknown,
): Promise<BasketActionResult> {
  const parsed = removeBasketItemSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid request." };
  }

  const item = await assertOwnedBasketItem(parsed.data.basketItemId);
  if (!item) {
    return { success: false, message: "That item is not in your bag." };
  }

  await db.basketItem.delete({ where: { id: item.id } });
  revalidateBasketViews();
  return { success: true };
}

export async function addRecommendedSet(
  input: unknown,
): Promise<BasketActionResult> {
  const parsed = addRecommendedSetSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, message: "Invalid request." };
  }

  // Phase 3.7 Part 4 — filters `product.isActive` on the join and
  // `variants: { where: { isActive: true } }` on the nested list, matching
  // the identical, already-proven-safe shape `getSchoolRecommendedSets`
  // (src/server/queries/schools.ts) already uses for the read-only display
  // of this same data. This Server Action previously ran its own,
  // independent, unfiltered query — meaning a deactivated product/variant
  // that the customer could never see via the display query could still
  // be added to their bag through this mutation, since only `stockStatus`
  // (via `pickDefaultOrderableVariant`) was ever checked, never `isActive`.
  const set = await db.recommendedUniformSet.findUnique({
    where: { id: parsed.data.setId },
    include: {
      items: {
        where: { product: { isActive: true } },
        include: {
          product: {
            include: { variants: { where: { isActive: true } } },
          },
        },
      },
    },
  });
  if (!set) {
    return { success: false, message: "That uniform set no longer exists." };
  }

  const basketId = await getOrCreateBasketId();
  const unavailable: string[] = [];

  for (const item of set.items) {
    const defaultVariant = pickDefaultOrderableVariant(item.product.variants);

    if (!defaultVariant) {
      unavailable.push(item.product.name);
      continue;
    }

    const existing = await db.basketItem.findUnique({
      where: {
        basketId_productVariantId: {
          basketId,
          productVariantId: defaultVariant.id,
        },
      },
    });

    const nextQuantity = clampAddQuantity({
      existingQuantity: existing?.quantity ?? 0,
      requestedQuantity: item.quantity,
      stockQuantity: defaultVariant.stockQuantity,
      maxPerLine: MAX_QUANTITY_PER_LINE,
    });

    if (existing) {
      await db.basketItem.update({
        where: { id: existing.id },
        data: { quantity: nextQuantity },
      });
    } else {
      await db.basketItem.create({
        data: {
          basketId,
          productVariantId: defaultVariant.id,
          quantity: nextQuantity,
          priceInPaiseAtAdd: defaultVariant.priceInPaise,
        },
      });
    }
  }

  revalidateBasketViews();

  if (unavailable.length > 0) {
    return {
      success: true,
      message: `Added — but ${unavailable.join(", ")} could not be added (out of stock).`,
    };
  }
  return { success: true, message: "Complete set added to your bag." };
}
