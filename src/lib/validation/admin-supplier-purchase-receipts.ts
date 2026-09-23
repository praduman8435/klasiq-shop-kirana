import { z } from "zod";

// Phase 4 Part 4 — Inventory Receiving. Unit cost (optional, historical
// display context only — see SupplierPurchaseReceiptItem's own schema
// doc comment) is entered in rupees like every other money input in
// this admin, converted to paise server-side via `rupeesToPaise`
// (src/lib/money.ts).

export const receiptItemInputSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.coerce.number().int().positive("Quantity must be greater than zero."),
  unitCostInRupees: z.coerce.number().nonnegative("Unit cost cannot be negative.").optional(),
});

export const createSupplierPurchaseReceiptSchema = z.object({
  purchaseId: z.string().min(1),
  receivedAt: z.coerce.date(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  items: z.array(receiptItemInputSchema).min(1, "Add at least one item to receive."),
});
