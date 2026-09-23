import { z } from "zod";

// Mirrors the ReturnReason enum (prisma/schema.prisma) exactly — never a
// second, drifting list of reason strings. See
// docs/PHASE_3_5_REPORT.md Part 1 "Return reasons". Exported (Phase 3.5
// Part 4) so the admin walk-in-return schema reuses this exact list too,
// rather than declaring its own copy.
export const returnReasonSchema = z.enum([
  "WRONG_SIZE",
  "DEFECTIVE",
  "DAMAGED",
  "WRONG_PRODUCT",
  "QUALITY_ISSUE",
  "CHANGED_MIND",
  "OTHER",
]);

const returnRequestItemInputSchema = z.object({
  orderItemId: z.string().min(1),
  quantity: z.number().int().min(1).max(999),
  reason: returnReasonSchema,
});

// One `type` for the whole request — matches Part 1's schema decision
// (ReturnRequestItem has no `type` of its own; see its doc comment in
// prisma/schema.prisma) rather than letting the client imply mixed
// per-item types the domain model doesn't support.
export const createReturnRequestSchema = z.object({
  orderNumber: z.string().min(1),
  type: z.enum(["RETURN", "EXCHANGE"]),
  // Free-text context, only ever meaningful alongside "Other" but not
  // required even then — the domain layer doesn't mandate it either.
  note: z.string().trim().max(500).optional(),
  items: z.array(returnRequestItemInputSchema).min(1, "Select at least one item."),
});

export type CreateReturnRequestInput = z.infer<typeof createReturnRequestSchema>;
