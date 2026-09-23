import type { Customer, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { generateCustomerId } from "@/lib/customer-id";
import { normalizePhoneNumber } from "@/lib/phone";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";

const MAX_CUSTOMER_ID_ATTEMPTS = 5;

type CustomerClient = typeof db | Prisma.TransactionClient;

export type FindOrCreateCustomerError =
  | { type: "INVALID_PHONE"; message: string }
  | { type: "UNKNOWN"; message: string };

export type FindOrCreateCustomerResult =
  | { success: true; customer: Customer; wasCreated: boolean }
  | { success: false; error: FindOrCreateCustomerError };

/**
 * Looks up a Customer by normalized primary phone, creating one only if no
 * match exists. This is THE customer-uniqueness enforcement point: the same
 * phone (in any input format) must always resolve to the same Customer, and
 * must never spawn a second identity.
 *
 * Used standalone (the default — every caller through Phase 3.2, e.g.
 * counter-sale.ts) and, since Phase 3.3, transactionally (pass a `tx` as the
 * second argument — see place-order.ts) so online checkout can resolve/
 * create the Customer as part of the SAME atomic unit of work as order
 * creation, meaning a checkout that ultimately fails (out of stock, etc.)
 * never leaves behind a customer with no order. See
 * docs/PHASE_3_3_REPORT.md "Transaction boundary decision" for the full
 * reasoning, including why the retry-on-race strategy differs between the
 * two modes (below).
 */
export async function findOrCreateCustomerByPrimaryPhone(
  params: { rawPhone: string; displayName?: string },
  client: CustomerClient = db,
): Promise<FindOrCreateCustomerResult> {
  const normalized = normalizePhoneNumber(params.rawPhone);
  if (!normalized.valid) {
    return {
      success: false,
      error: { type: "INVALID_PHONE", message: "Enter a valid phone number." },
    };
  }

  const existing = await client.customer.findUnique({
    where: { primaryPhoneNormalized: normalized.normalized },
  });
  if (existing) {
    return { success: true, customer: existing, wasCreated: false };
  }

  // Standalone (default `db`): every existing caller. Each Prisma call here
  // is its own independent transaction, so catching a failed create and
  // issuing more queries afterward (the race-recovery read below) is safe —
  // guarded create + P2002 recovery, same shape as place-order.ts's
  // orderNumber retry loop and idempotencyKey race recovery.
  //
  // Transactional (a real `tx` passed in): Postgres aborts an ENTIRE
  // transaction on any statement error — a caught-and-retried create/read
  // after a failed create would itself fail ("current transaction is
  // aborted"). So when participating in a caller's transaction, this makes
  // exactly one create attempt and lets a collision propagate uncaught; the
  // caller recognizes the specific race (P2002 on primaryPhoneNormalized)
  // and retries its ENTIRE transaction, which finds the customer via the
  // check above on the next attempt instead of racing to create it again.
  const isStandalone = client === db;
  const maxAttempts = isStandalone ? MAX_CUSTOMER_ID_ATTEMPTS : 1;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      const created = await client.customer.create({
        data: {
          customerId: generateCustomerId(),
          displayName: params.displayName,
          primaryPhone: params.rawPhone,
          primaryPhoneNormalized: normalized.normalized,
        },
      });
      return { success: true, customer: created, wasCreated: true };
    } catch (err) {
      if (isStandalone && isUniqueConstraintErrorOn(err, "customerId")) {
        continue; // astronomically unlikely collision — try a fresh id
      }
      if (isStandalone && isUniqueConstraintErrorOn(err, "primaryPhoneNormalized")) {
        const winner = await client.customer.findUnique({
          where: { primaryPhoneNormalized: normalized.normalized },
        });
        if (winner) return { success: true, customer: winner, wasCreated: false };
      }
      throw err;
    }
  }

  return {
    success: false,
    error: { type: "UNKNOWN", message: "Could not create a customer record. Please try again." },
  };
}

export type CreateCustomerInlineResult =
  | { success: true; customer: Customer }
  | { success: false; error: FindOrCreateCustomerError };

/**
 * Phase 3.6.5 Part 1 — the Counter Sale customer panel's inline "customer
 * not found" create form (section 7) needs exactly this combination: find
 * or create by phone (`findOrCreateCustomerByPrimaryPhone`, Phase 3.1,
 * unchanged), then optionally apply a WhatsApp number
 * (`updateCustomerContactInfo`, Phase 3.1, also unchanged) — reusing two
 * ALREADY-EXISTING domain functions rather than writing a third,
 * duplicate customer-mutation path (section 14: "Do not duplicate customer
 * creation").
 *
 * The WhatsApp number is applied ONLY when this call genuinely just
 * created a brand-new customer (`wasCreated: true`). If the phone instead
 * resolved to an already-existing customer (a race between an earlier
 * search and this submit, or a corrected typo), that customer's own data
 * is left completely untouched — mirroring the exact "never silently
 * overwritten" guarantee `findOrCreateCustomerByPrimaryPhone` already
 * applies to `displayName`. A failure to apply the WhatsApp number (e.g.
 * an invalid format) never fails this call — the customer is still
 * found/created and returned; only the optional field is silently left
 * unset, since a walk-in customer's own core sale must never be blocked by
 * an optional contact field.
 *
 * Phase 3.6.6 Part 1 — `address`, if given, is applied via the EXACT
 * same "only on genuine creation" rule as `whatsappPhone` above. This is
 * the ONE AND ONLY place in this codebase that ever sets
 * `Customer.addressLine`/`addressCity`/`addressState`/`addressPincode` —
 * there is no "edit saved address" mutation (a deliberately deferred,
 * separate future feature; see docs/PHASE_3_6_6_REPORT.md Part 1
 * "Address strategy"), so an already-existing customer's saved address
 * is never touched by this call, exactly like their displayName/WhatsApp
 * aren't.
 */
export async function createCustomerInline(params: {
  displayName?: string;
  primaryPhone: string;
  whatsappPhone?: string;
  address?: { addressLine?: string; city?: string; state?: string; pincode?: string };
}): Promise<CreateCustomerInlineResult> {
  const result = await findOrCreateCustomerByPrimaryPhone({
    rawPhone: params.primaryPhone,
    displayName: params.displayName,
  });
  if (!result.success) {
    return { success: false, error: result.error };
  }

  let customer = result.customer;
  if (result.wasCreated && params.whatsappPhone) {
    const withWhatsapp = await updateCustomerContactInfo({
      id: customer.id,
      whatsappPhone: params.whatsappPhone,
    });
    if (withWhatsapp.success) customer = withWhatsapp.customer;
  }

  const address = params.address;
  const hasAddressField = Boolean(address?.addressLine || address?.city || address?.state || address?.pincode);
  if (result.wasCreated && hasAddressField) {
    customer = await db.customer.update({
      where: { id: customer.id },
      data: {
        addressLine: address!.addressLine?.trim() || null,
        addressCity: address!.city?.trim() || null,
        addressState: address!.state?.trim() || null,
        addressPincode: address!.pincode?.trim() || null,
      },
    });
  }

  return { success: true, customer };
}

export type UpdateCustomerContactInfoError =
  | { type: "NOT_FOUND"; message: string }
  | { type: "INVALID_PHONE"; message: string }
  | { type: "PHONE_IN_USE"; message: string };

export type UpdateCustomerContactInfoResult =
  | { success: true; customer: Customer }
  | { success: false; error: UpdateCustomerContactInfoError };

/**
 * Updates a Customer's mutable contact fields without ever touching
 * customerId — names and phone numbers change over time, the permanent id
 * never does. See docs/PHASE_3_1_REPORT.md "Customer update strategy".
 *
 * Changing primaryPhone to a number already claimed by a DIFFERENT customer
 * is refused (PHONE_IN_USE) rather than silently merging two identities —
 * reconciling that is a future, deliberate merge decision, not something
 * this function should do as a side effect.
 */
export async function updateCustomerContactInfo(params: {
  id: string;
  displayName?: string | null;
  primaryPhone?: string;
  whatsappPhone?: string;
}): Promise<UpdateCustomerContactInfoResult> {
  const existing = await db.customer.findUnique({ where: { id: params.id } });
  if (!existing) {
    return { success: false, error: { type: "NOT_FOUND", message: "Customer not found." } };
  }

  const data: {
    displayName?: string | null;
    primaryPhone?: string;
    primaryPhoneNormalized?: string;
    whatsappPhone?: string;
    whatsappPhoneNormalized?: string;
  } = {};

  if (params.displayName !== undefined) {
    data.displayName = params.displayName;
  }

  if (params.primaryPhone !== undefined) {
    const normalized = normalizePhoneNumber(params.primaryPhone);
    if (!normalized.valid) {
      return {
        success: false,
        error: { type: "INVALID_PHONE", message: "Enter a valid primary phone number." },
      };
    }
    if (normalized.normalized !== existing.primaryPhoneNormalized) {
      const claimedByAnother = await db.customer.findUnique({
        where: { primaryPhoneNormalized: normalized.normalized },
      });
      if (claimedByAnother && claimedByAnother.id !== existing.id) {
        return {
          success: false,
          error: {
            type: "PHONE_IN_USE",
            message: "This phone number already belongs to a different customer.",
          },
        };
      }
    }
    data.primaryPhone = params.primaryPhone;
    data.primaryPhoneNormalized = normalized.normalized;
  }

  if (params.whatsappPhone !== undefined) {
    const normalized = normalizePhoneNumber(params.whatsappPhone);
    if (!normalized.valid) {
      return {
        success: false,
        error: { type: "INVALID_PHONE", message: "Enter a valid WhatsApp phone number." },
      };
    }
    data.whatsappPhone = params.whatsappPhone;
    data.whatsappPhoneNormalized = normalized.normalized;
  }

  const updated = await db.customer.update({ where: { id: params.id }, data });
  return { success: true, customer: updated };
}

export type AnonymizeCustomerError = { type: "NOT_FOUND"; message: string };
export type AnonymizeCustomerResult = { success: true } | { success: false; error: AnonymizeCustomerError };

/**
 * Personal-data audit (2026-08-10) — "add a basic account deletion flow
 * that removes or anonymizes all personal data." A genuine hard DELETE of
 * a `Customer` row is not a safe option here, and this function does not
 * attempt one: `ReturnRequest.customer`/`PaymentReceipt.customer` are both
 * `onDelete: Restrict` (see prisma/schema.prisma) — Postgres itself refuses
 * to delete a Customer row that any return, exchange, or payment receipt
 * still references, and even where deletion WOULD be permitted
 * (`Order.customer` is `onDelete: SetNull`), it would silently sever the
 * order-to-customer link for a real, historical transaction.
 *
 * Instead, this ANONYMIZES the customer's own PROFILE in place — the
 * mutable, ongoing-identity fields a real person actively controls
 * (display name, both phone numbers, saved address) are cleared, and the
 * account is marked inactive. The row itself, its `id`, and its permanent
 * `customerId` all remain — `customerId` is documented (see the schema)
 * as an IDENTIFIER, not personal information, the same way an account
 * number survives closing an account; keeping it is what lets every
 * existing Order/ReturnRequest/PaymentReceipt keep pointing at a real,
 * intact row with zero FK errors and zero data-model change.
 *
 * Deliberately does NOT touch `Order.customerName`/`customerMobile`/
 * `customerWhatsapp`/`customerAddress*`, `ReturnRequest`, or
 * `PaymentReceipt` — every one of those is this codebase's own
 * established point-in-time SNAPSHOT of what was true at the moment of a
 * real commercial transaction (see docs/PHASE_3_1_REPORT.md /
 * PHASE_3_3_REPORT.md "Order snapshot design"), kept independent of the
 * live Customer profile since the very first phase this data model
 * existed, for the same reason a business keeps its own sales/tax
 * records regardless of what a customer's current profile says. Erasing
 * those would not be "more private," it would break commerce history and
 * accounting integrity this codebase has never allowed anything else to
 * do. This is a deliberate, bounded scope decision, not an oversight: the
 * ONGOING PROFILE is erasable on request; PAST TRANSACTION RECORDS are
 * not.
 *
 * Idempotent — calling this twice on an already-anonymized customer is a
 * harmless no-op (every field is already null/false).
 */
export async function anonymizeCustomer(id: string): Promise<AnonymizeCustomerResult> {
  const existing = await db.customer.findUnique({ where: { id } });
  if (!existing) {
    return { success: false, error: { type: "NOT_FOUND", message: "Customer not found." } };
  }

  await db.customer.update({
    where: { id },
    data: {
      displayName: null,
      primaryPhone: null,
      primaryPhoneNormalized: null,
      whatsappPhone: null,
      whatsappPhoneNormalized: null,
      addressLine: null,
      addressCity: null,
      addressState: null,
      addressPincode: null,
      active: false,
    },
  });

  return { success: true };
}
