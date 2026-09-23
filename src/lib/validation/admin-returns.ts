import { z } from "zod";
import { returnReasonSchema } from "@/lib/validation/return-request";

export const RETURN_REQUEST_STATUS_VALUES = [
  "REQUESTED",
  "APPROVED",
  "REJECTED",
  "RECEIVED",
  "COMPLETED",
  "CANCELLED",
] as const;

export const RETURN_REQUEST_TYPE_VALUES = ["RETURN", "EXCHANGE"] as const;

export const updateReturnRequestStatusSchema = z.object({
  returnNumber: z.string().min(1),
  newStatus: z.enum(RETURN_REQUEST_STATUS_VALUES),
  // Required only by application logic when newStatus is REJECTED (see
  // updateReturnRequestStatus) — kept optional here since every other
  // transition never sends one.
  rejectionReason: z.string().trim().min(1).max(500).optional(),
});

export const updateReturnRequestAdminNoteSchema = z.object({
  returnNumber: z.string().min(1),
  adminNote: z.string().trim().max(1000),
});

// Phase 3.5 Part 4 — one replacement ProductVariant per ReturnRequestItem,
// keyed by that item's own id. Only ever consulted/required for EXCHANGE
// requests (see receiveReturnRequest, src/server/commerce/return-fulfillment.ts);
// harmless (ignored) if supplied for a RETURN.
export const receiveReturnRequestSchema = z.object({
  returnNumber: z.string().min(1),
  replacements: z.record(z.string().min(1), z.string().min(1)).optional(),
});

// Admin-initiated ("walk-in") return/exchange creation — the ONLY schema
// in this feature that accepts a customerId directly from the client,
// mirroring createCounterSaleSchema's own precedent (admin explicitly
// picks a customer via search first, src/lib/validation/admin-counter-sale.ts)
// rather than the customer-portal's own schema (Part 2), which never
// accepts one (there, it's resolved from the verified session instead).
// Reuses the exact same item shape as createReturnRequestSchema.
//
// `overrideReason` (Phase 3.5 Part 5, Admin Override) — the ONLY place in
// this entire feature a client can request bypassing time-based
// eligibility, and only ever reachable through this admin-only,
// `getAdminSession()`-gated action. Mandatory-when-used: a non-empty
// string or nothing at all — there is no way to submit "override: true"
// without also supplying a real reason, enforced here at the schema layer
// AND again, independently, in `createReturnRequest` itself.
export const createWalkInReturnRequestSchema = z.object({
  customerId: z.string().min(1),
  orderNumber: z.string().min(1),
  type: z.enum(RETURN_REQUEST_TYPE_VALUES),
  note: z.string().trim().max(500).optional(),
  overrideReason: z.string().trim().min(1).max(500).optional(),
  items: z
    .array(
      z.object({
        orderItemId: z.string().min(1),
        quantity: z.number().int().min(1).max(999),
        reason: returnReasonSchema,
      }),
    )
    .min(1, "Select at least one item."),
});

const DATE_ONLY_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

// Mirrors adminOrderFiltersSchema's own shape (src/lib/validation/admin-orders.ts)
// exactly — same date-range convention, same free-text query cap.
export const adminReturnFiltersSchema = z.object({
  status: z.enum(RETURN_REQUEST_STATUS_VALUES).optional(),
  type: z.enum(RETURN_REQUEST_TYPE_VALUES).optional(),
  schoolId: z.string().min(1).optional(),
  dateFrom: z.string().regex(DATE_ONLY_PATTERN).optional(),
  dateTo: z.string().regex(DATE_ONLY_PATTERN).optional(),
  query: z.string().trim().max(100).optional(),
});
