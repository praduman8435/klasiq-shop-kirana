import { z } from "zod";

export const MAX_QUANTITY_PER_LINE = 20;

export const addToBasketSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(MAX_QUANTITY_PER_LINE),
});

export const setBasketItemQuantitySchema = z.object({
  basketItemId: z.string().min(1),
  quantity: z.coerce.number().int().min(0).max(MAX_QUANTITY_PER_LINE),
});

export const removeBasketItemSchema = z.object({
  basketItemId: z.string().min(1),
});
