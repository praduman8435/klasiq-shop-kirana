import { z } from "zod";

export const COUNTER_SALE_PAYMENT_METHOD_VALUES = ["CASH", "UPI", "CARD"] as const;

export const counterSaleLineSchema = z.object({
  productVariantId: z.string().min(1),
  quantity: z.coerce.number().int().min(1).max(999),
});

// Existing/new/guest are mutually exclusive on purpose — see
// docs/PHASE_3_2_REPORT.md "Customer selection". Guest requires no fields
// at all: a counter sale must never be blocked on customer information.
export const counterSaleCustomerSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("GUEST") }),
  z.object({ mode: z.literal("EXISTING"), customerId: z.string().min(1) }),
  z.object({
    mode: z.literal("NEW"),
    displayName: z.string().trim().max(80).optional(),
    primaryPhone: z.string().trim().min(1, "Enter a phone number.").max(20),
  }),
]);

export const DISCOUNT_TYPE_VALUES = ["FLAT", "PERCENTAGE"] as const;
const DISCOUNT_REASON_MAX_LENGTH = 200;

// Phase 3.6.5 Part 2 — section 2's "exactly one discount, never stacked":
// a discriminated `type`, a single `value` whose UNIT depends on that type
// (paise for FLAT, whole percent for PERCENTAGE), and an optional reason.
// Deliberately loose on `value`'s range here (just "a positive integer") —
// the type-specific business rule (percentage capped at 100, discount
// never exceeding the subtotal) is enforced exactly once, server-side, in
// `computeDiscountInPaise` (src/lib/discount.ts) — duplicating a second,
// slightly-different range check here would risk the two drifting apart.
export const counterSaleDiscountSchema = z
  .object({
    type: z.enum(DISCOUNT_TYPE_VALUES),
    value: z.coerce.number().int().positive(),
    reason: z.string().trim().max(DISCOUNT_REASON_MAX_LENGTH).optional(),
  })
  .nullable();

// Phase 3.6.5 Part 3 — Full or Partial Payment (section 2). FULL carries
// no amount at all — the server always derives it from its own
// freshly-computed Grand Total, never a client-supplied figure (section
// 12). PARTIAL's `amountReceivedInPaise` is deliberately just "a
// non-negative integer" here — the business rule that it must not
// exceed the Grand Total is enforced exactly once, server-side, in
// `computePaymentOutcome` (src/lib/payment.ts), for the same
// "don't duplicate a slightly-different range check" reasoning as
// `counterSaleDiscountSchema` above.
export const counterSalePaymentSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("FULL") }),
  z.object({ mode: z.literal("PARTIAL"), amountReceivedInPaise: z.coerce.number().int().min(0) }),
]);

const ADDRESS_FIELD_MAX_LENGTH = 200;
const ADDRESS_PINCODE_MAX_LENGTH = 20;

// Phase 3.6.6 Part 1 — section 3's "no validation. Sale continues
// normally" for a blank/guest address: every field here is a plain,
// trimmed, length-capped string with NO format/business rule (no
// pincode-shape regex, no required combination) — deliberately looser
// than counterSaleDiscountSchema/counterSalePaymentSchema above, since
// unlike those two, an address has no business rule to enforce at all.
// `SAVED` carries no address fields of its own — the actual values are
// resolved server-side from the customer's own current saved address
// (`src/server/commerce/counter-sale.ts`), never trusted from the client.
export const counterSaleAddressSchema = z.discriminatedUnion("mode", [
  z.object({ mode: z.literal("NONE") }),
  z.object({ mode: z.literal("SAVED") }),
  z.object({
    mode: z.literal("ONE_TIME"),
    addressLine: z.string().trim().max(ADDRESS_FIELD_MAX_LENGTH).optional(),
    city: z.string().trim().max(ADDRESS_FIELD_MAX_LENGTH).optional(),
    state: z.string().trim().max(ADDRESS_FIELD_MAX_LENGTH).optional(),
    pincode: z.string().trim().max(ADDRESS_PINCODE_MAX_LENGTH).optional(),
  }),
]);

export const createCounterSaleSchema = z.object({
  lines: z.array(counterSaleLineSchema).min(1, "Add at least one item."),
  customer: counterSaleCustomerSchema,
  schoolId: z.string().min(1).nullable(),
  paymentMethod: z.enum(COUNTER_SALE_PAYMENT_METHOD_VALUES),
  idempotencyKey: z.string().uuid(),
  discount: counterSaleDiscountSchema.optional(),
  payment: counterSalePaymentSchema.optional(),
  address: counterSaleAddressSchema.optional(),
});

export type CreateCounterSaleInput = z.infer<typeof createCounterSaleSchema>;

export const counterSaleProductSearchSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

export const counterSaleCustomerSearchSchema = z.object({
  query: z.string().trim().min(1).max(100),
});

// Phase 3.6.5 Part 1 — the inline "customer not found" create form (section
// 7). Same minimum fields Phase 3.2's NEW mode already asked for
// (displayName optional, primaryPhone required), plus one addition the
// redesigned form surfaces: an optional WhatsApp number. Deliberately its
// own schema, not a reuse of `counterSaleCustomerSchema`'s NEW variant —
// that one is keyed under a discriminated union's `mode` tag for
// `createCounterSale`'s payload; this one is a standalone action input with
// no such tag and one extra field, so sharing would mean awkwardly bending
// one shape to fit both call sites.
// Phase 3.6.6 Part 1 — an optional saved address, captured only at this
// genuine customer-creation moment (see `createCustomerInline`,
// src/server/commerce/customer.ts, for why this is the ONLY place a
// Customer's saved address is ever set). Same loose, no-business-rule
// shape as `counterSaleAddressSchema`'s own ONE_TIME variant.
export const createCounterSaleCustomerAddressSchema = z.object({
  addressLine: z.string().trim().max(ADDRESS_FIELD_MAX_LENGTH).optional(),
  city: z.string().trim().max(ADDRESS_FIELD_MAX_LENGTH).optional(),
  state: z.string().trim().max(ADDRESS_FIELD_MAX_LENGTH).optional(),
  pincode: z.string().trim().max(ADDRESS_PINCODE_MAX_LENGTH).optional(),
});

export const createCounterSaleCustomerSchema = z.object({
  displayName: z.string().trim().max(80).optional(),
  primaryPhone: z.string().trim().min(1, "Enter a phone number.").max(20),
  whatsappPhone: z.string().trim().max(20).optional(),
  address: createCounterSaleCustomerAddressSchema.optional(),
});
