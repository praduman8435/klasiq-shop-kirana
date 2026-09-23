import { z } from "zod";

// Phase 4 Part 2 — Supplier Purchases & Bills. Money is entered by the
// admin in rupees (matching product-form.tsx/product-variants-manager.tsx's
// own "Price (₹)" input convention) and converted to paise server-side via
// `rupeesToPaise` (src/lib/money.ts) — never trusted as paise from the
// client, and never floating-point rupee math persisted directly.

export const supplierPurchaseBillAttachmentSchema = z.object({
  url: z.string().trim().url("Enter a valid image URL."),
  originalFilename: z.string().trim().max(200).optional(),
});

export const supplierPurchaseBillSchema = z.object({
  billNumber: z.string().trim().max(60).optional(),
  billDate: z.coerce.date(),
  amountInRupees: z.coerce.number().positive("Each bill amount must be greater than zero."),
  notes: z.string().trim().max(300).optional(),
  attachments: z.array(supplierPurchaseBillAttachmentSchema).max(20).default([]),
});

export const createSupplierPurchaseSchema = z.object({
  supplierId: z.string().min(1),
  purchaseDate: z.coerce.date(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  bills: z.array(supplierPurchaseBillSchema).min(1, "Add at least one bill."),
});

export const updateSupplierPurchaseDetailsSchema = z.object({
  id: z.string().min(1),
  purchaseDate: z.coerce.date(),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const updateSupplierPurchaseBillSchema = z.object({
  id: z.string().min(1),
  billNumber: z.string().trim().max(60).optional(),
  billDate: z.coerce.date(),
  amountInRupees: z.coerce.number().positive("Bill amount must be greater than zero."),
  notes: z.string().trim().max(300).optional(),
});

export const addSupplierPurchaseBillAttachmentSchema = z.object({
  billId: z.string().min(1),
  url: z.string().trim().url("Enter a valid image URL."),
  originalFilename: z.string().trim().max(200).optional(),
});

export const removeSupplierPurchaseBillAttachmentSchema = z.object({
  id: z.string().min(1),
});

export const adminSupplierPurchaseHistoryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});
