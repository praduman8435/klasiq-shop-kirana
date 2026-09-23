import { z } from "zod";
import { COUNTER_SALE_PAYMENT_METHOD_VALUES } from "@/lib/validation/admin-counter-sale";

export const KHATABOOK_DIRECTORY_FILTER_VALUES = ["ALL", "RECENTLY_ACTIVE", "OUTSTANDING"] as const;

// Mirrors adminOrderFiltersSchema's/adminReturnFiltersSchema's own `query`
// field exactly (src/lib/validation/admin-orders.ts,
// admin-returns.ts) — same convention, one field, since KhataBook's
// search is deliberately a single unified input (section 3). `page`/
// `filter` back the full customer directory
// (`getKhataBookCustomerDirectory`) — a bad/out-of-range `page` string
// just falls back to page 1 via `.catch`, same forgiving behavior as an
// invalid filter falling back to "ALL", rather than 500ing on a
// hand-edited URL.
export const khataBookSearchSchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  filter: z.enum(KHATABOOK_DIRECTORY_FILTER_VALUES).catch("ALL"),
});

const RECEIVE_PAYMENT_NOTE_MAX_LENGTH = 200;

// Phase 3.6.5 Part 5 — section 7: "Reuse existing payment methods ...
// avoid introducing duplicate enums." Reuses the EXACT SAME
// COUNTER_SALE_PAYMENT_METHOD_VALUES Counter Sale itself already
// validates against (src/lib/validation/admin-counter-sale.ts) — CASH,
// UPI, CARD only, never CASH_ON_DELIVERY (an Online-only "how will you
// pay" promise that makes no sense for a payment already being
// physically collected). Deliberately loose on `amountInPaise`'s range
// here (just "a positive integer") — the real business rule (never
// exceeding the order's own current Outstanding) is enforced exactly
// once, server-side, in `validateReceivePaymentAmount`
// (src/lib/receive-payment.ts), for the same "don't duplicate a
// slightly-different range check" reasoning as
// `counterSalePaymentSchema`.
export const receivePaymentSchema = z.object({
  orderNumber: z.string().min(1),
  customerId: z.string().min(1),
  amountInPaise: z.coerce.number().int().positive(),
  paymentMethod: z.enum(COUNTER_SALE_PAYMENT_METHOD_VALUES),
  note: z.string().trim().max(RECEIVE_PAYMENT_NOTE_MAX_LENGTH).optional(),
  idempotencyKey: z.string().uuid(),
});
