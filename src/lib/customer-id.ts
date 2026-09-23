import { UNAMBIGUOUS_ALPHABET, generateUnambiguousCode } from "@/lib/unambiguous-code";

const SUFFIX_LENGTH = 6;
const PREFIX = "KLQ";

/**
 * Generates a permanent, public-facing customer identifier like KLQ-7A41K2.
 * Mirrors src/lib/order-number.ts: same unambiguous alphabet (no 0/O/1/I/L
 * confusion when read aloud over the phone), same "generator doesn't claim
 * uniqueness" contract — the database's UNIQUE constraint on
 * Customer.customerId is what actually guarantees it, and the caller
 * (src/server/commerce/customer.ts) retries with a fresh id on collision.
 *
 * This is an IDENTIFIER, not a credential: knowing a customerId must never
 * imply ownership of that customer's data. See docs/PHASE_3_1_REPORT.md
 * "Security" — authentication is a future OTP module's job, not this id's.
 */
export function generateCustomerId(): string {
  return `${PREFIX}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

const CUSTOMER_ID_PATTERN = new RegExp(`^${PREFIX}-[${UNAMBIGUOUS_ALPHABET}]{${SUFFIX_LENGTH}}$`);

export function isValidCustomerIdFormat(value: string): boolean {
  return CUSTOMER_ID_PATTERN.test(value);
}
