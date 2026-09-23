import { z } from "zod";

export const INVENTORY_ADJUSTMENT_REASON_VALUES = ["STOCK_RECEIVED", "MANUAL_CORRECTION"] as const;
export const STOCK_STATUS_VALUES = ["IN_STOCK", "LOW_STOCK", "OUT_OF_STOCK"] as const;

export const adjustInventoryDeltaSchema = z.object({
  productVariantId: z.string().min(1),
  delta: z.coerce.number().int().refine((v) => v !== 0, "Enter a non-zero amount."),
  reason: z.enum(INVENTORY_ADJUSTMENT_REASON_VALUES),
  note: z.string().trim().max(240).optional(),
});

export const setInventoryQuantitySchema = z.object({
  productVariantId: z.string().min(1),
  newQuantity: z.coerce.number().int().min(0, "Stock cannot be negative."),
  expectedPreviousQuantity: z.coerce.number().int().min(0),
  reason: z.enum(INVENTORY_ADJUSTMENT_REASON_VALUES),
  note: z.string().trim().max(240).optional(),
});

export const adminInventoryFiltersSchema = z.object({
  query: z.string().trim().max(100).optional(),
  categorySlug: z.string().trim().max(60).optional(),
  stock: z.enum(STOCK_STATUS_VALUES).optional(),
});
