import { z } from "zod";

// Phase 4 Part 5 — Supplier Purchase Returns.

export const SUPPLIER_PURCHASE_RETURN_REASON_VALUES = [
  "DAMAGED",
  "WRONG_ITEM",
  "WRONG_SIZE",
  "DEFECTIVE",
  "EXCESS_QUANTITY",
  "QUALITY_ISSUE",
  "SUPPLIER_REQUEST",
  "OTHER",
] as const;

export const returnItemInputSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.coerce.number().int().positive("Quantity must be greater than zero."),
});

export const createSupplierPurchaseReturnSchema = z.object({
  purchaseId: z.string().min(1),
  returnDate: z.coerce.date(),
  reason: z.enum(SUPPLIER_PURCHASE_RETURN_REASON_VALUES),
  reasonNote: z.string().trim().max(300).optional(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(returnItemInputSchema).min(1, "Add at least one item to return."),
  /** Part 11 — guards against a duplicate submission (slow network,
   *  double-click) reducing inventory twice for the same confirm
   *  action. Generated once client-side per form load. */
  idempotencyKey: z.string().min(1).max(100),
});
