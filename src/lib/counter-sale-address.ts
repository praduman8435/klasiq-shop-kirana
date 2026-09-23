/**
 * Pure, DB-free address resolution — mirrors `src/lib/discount.ts`/
 * `src/lib/payment.ts`'s own convention (no Prisma, independently unit
 * testable, reusable from both the server's authoritative resolution and
 * a future client-side preview). See docs/PHASE_3_6_6_REPORT.md Part 1
 * "Address strategy".
 */

export type CounterSaleAddressInput =
  | { mode: "NONE" }
  | { mode: "SAVED" }
  | { mode: "ONE_TIME"; addressLine?: string; city?: string; state?: string; pincode?: string };

export type AddressSnapshot = {
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

export const EMPTY_ADDRESS_SNAPSHOT: AddressSnapshot = {
  addressLine: null,
  city: null,
  state: null,
  pincode: null,
};

export function isBlankAddressSnapshot(snapshot: AddressSnapshot): boolean {
  return !snapshot.addressLine && !snapshot.city && !snapshot.state && !snapshot.pincode;
}

/**
 * Section 4 — "One-time address must never overwrite the customer's
 * saved address." This function only ever READS `savedAddress` (never
 * returns it as something the caller should write back to `Customer`);
 * the caller (`createCounterSale`) is what makes the "never overwrite"
 * guarantee true in practice, by construction — nothing here, or in
 * `createCounterSale`'s own transaction, ever issues a
 * `customer.update` touching address fields. The ONLY place a
 * `Customer`'s saved address is ever set is genuine creation
 * (`createCustomerInline`), a completely separate code path.
 *
 * `mode: "SAVED"` returns whatever `savedAddress` the caller passed in —
 * always the customer's CURRENT saved address, read fresh by the caller
 * at the moment of sale (never a client-echoed value trusted at face
 * value; section 3's "no validation" for Guest/one-time still applies —
 * this function does no validation of its own either, since an address
 * has no business rule to enforce, unlike a discount or payment amount).
 * `mode: "ONE_TIME"` uses exactly the given fields, blank/whitespace-only
 * ones trimmed to `null` — a fully blank one-time entry is
 * indistinguishable from `NONE`, which is correct: section 3's "if left
 * blank, no validation, sale continues normally."
 */
export function resolveCounterSaleAddressSnapshot(params: {
  address: CounterSaleAddressInput;
  savedAddress: AddressSnapshot | null;
}): AddressSnapshot {
  const { address, savedAddress } = params;

  if (address.mode === "NONE") return EMPTY_ADDRESS_SNAPSHOT;

  if (address.mode === "SAVED") return savedAddress ?? EMPTY_ADDRESS_SNAPSHOT;

  return {
    addressLine: address.addressLine?.trim() || null,
    city: address.city?.trim() || null,
    state: address.state?.trim() || null,
    pincode: address.pincode?.trim() || null,
  };
}
