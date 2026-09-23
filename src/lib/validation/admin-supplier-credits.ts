import { z } from "zod";

// Phase 4 Part 6 — Supplier Credits. Money is entered in rupees like
// every other admin money input, converted to paise server-side via
// `rupeesToPaise` (src/lib/money.ts).

export const SUPPLIER_CREDIT_REASON_VALUES = [
  "SUPPLIER_RETURN",
  "OVERPAYMENT",
  "PRICE_ADJUSTMENT",
  "QUALITY_ADJUSTMENT",
  "COMMERCIAL_ADJUSTMENT",
  "OTHER",
] as const;

export const creditAllocationInputSchema = z.object({
  purchaseId: z.string().min(1),
  amountInRupees: z.coerce.number().positive("Each allocation must be greater than zero."),
});

export const createSupplierCreditSchema = z.object({
  supplierId: z.string().min(1),
  creditDate: z.coerce.date(),
  amountInRupees: z.coerce.number().positive("Credit amount must be greater than zero."),
  reason: z.enum(SUPPLIER_CREDIT_REASON_VALUES),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  sourceReturnId: z.string().min(1).optional(),
  allocations: z.array(creditAllocationInputSchema).max(50).default([]),
});

export const adminSupplierCreditHistoryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});
