import { z } from "zod";

// Phase 4 Part 6 — Supplier Refunds.

export const supplierRefundAttachmentSchema = z.object({
  url: z.string().trim().url("Enter a valid image URL."),
  originalFilename: z.string().trim().max(200).optional(),
});

export const createSupplierRefundSchema = z.object({
  supplierId: z.string().min(1),
  refundDate: z.coerce.date(),
  amountInRupees: z.coerce.number().positive("Refund amount must be greater than zero."),
  refundMethod: z.enum(["CASH", "UPI", "BANK_TRANSFER", "CARD", "CHEQUE", "OTHER"]),
  receivedByName: z.string().trim().min(1, "Enter who received this refund on the supplier's behalf.").max(120),
  reference: z.string().trim().max(120).optional(),
  notes: z.string().trim().max(500).optional(),
  sourceCreditId: z.string().min(1).optional(),
  sourceReturnId: z.string().min(1).optional(),
  attachments: z.array(supplierRefundAttachmentSchema).max(20).default([]),
});

export const addSupplierRefundAttachmentSchema = z.object({
  refundId: z.string().min(1),
  url: z.string().trim().url("Enter a valid image URL."),
  originalFilename: z.string().trim().max(200).optional(),
});

export const removeSupplierRefundAttachmentSchema = z.object({
  id: z.string().min(1),
});

export const adminSupplierRefundHistoryFiltersSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
});
