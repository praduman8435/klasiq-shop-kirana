import { z } from "zod";

// Phase 4 Part 3 — Supplier Payments & Allocations. Money is entered by
// the admin in rupees (matching supplier-purchase-form.tsx's own
// convention) and converted to paise server-side via `rupeesToPaise`
// (src/lib/money.ts) — never trusted as paise from the client.

export const SUPPLIER_PAYMENT_METHOD_VALUES = ["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"] as const;

export const supplierPaymentAttachmentSchema = z.object({
  url: z.string().trim().url("Enter a valid image URL."),
  originalFilename: z.string().trim().max(200).optional(),
});

export const paymentAllocationInputSchema = z.object({
  purchaseId: z.string().min(1),
  amountInRupees: z.coerce.number().positive("Each allocation must be greater than zero."),
});

export const createSupplierPaymentSchema = z.object({
  supplierId: z.string().min(1),
  paymentDate: z.coerce.date(),
  amountInRupees: z.coerce.number().positive("Payment amount must be greater than zero."),
  paymentMethod: z.enum(SUPPLIER_PAYMENT_METHOD_VALUES),
  collectedByName: z.string().trim().min(1, "Enter who collected this payment.").max(120),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  allocations: z.array(paymentAllocationInputSchema).max(50).default([]),
  attachments: z.array(supplierPaymentAttachmentSchema).max(20).default([]),
});

export const updateSupplierPaymentDetailsSchema = z.object({
  id: z.string().min(1),
  paymentDate: z.coerce.date(),
  paymentMethod: z.enum(SUPPLIER_PAYMENT_METHOD_VALUES),
  collectedByName: z.string().trim().min(1, "Enter who collected this payment.").max(120),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const addSupplierPaymentAttachmentSchema = z.object({
  paymentId: z.string().min(1),
  url: z.string().trim().url("Enter a valid image URL."),
  originalFilename: z.string().trim().max(200).optional(),
});

export const removeSupplierPaymentAttachmentSchema = z.object({
  id: z.string().min(1),
});

export const adminSupplierPaymentHistoryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});
