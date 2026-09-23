import { UNAMBIGUOUS_ALPHABET, generateUnambiguousCode } from "@/lib/unambiguous-code";

const SUFFIX_LENGTH = 5;

function datePart(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Generates a human-friendly, WhatsApp/phone-readable return/exchange
 * reference like RET-20260808-K7M3P — the exact same shape and reasoning
 * as `generateOrderNumber` (src/lib/order-number.ts): never derived from
 * a "count + 1" (breaks under concurrent inserts), uniqueness enforced by
 * the database's UNIQUE constraint on ReturnRequest.returnNumber, caller
 * retries with a fresh call on collision. Added in Phase 3.5 Part 2
 * specifically so the customer-facing success screen and return history
 * never need to show the raw internal `ReturnRequest.id` (a cuid) —
 * exactly the same "identifier, not a database key" convention already
 * established for `Order.orderNumber` and `Customer.customerId`. See
 * docs/PHASE_3_5_REPORT.md Part 2 "Return Request ID".
 */
export function generateReturnNumber(date: Date): string {
  return `RET-${datePart(date)}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

const RETURN_NUMBER_PATTERN = new RegExp(`^RET-\\d{8}-[${UNAMBIGUOUS_ALPHABET}]{5}$`);

export function isValidReturnNumberFormat(value: string): boolean {
  return RETURN_NUMBER_PATTERN.test(value);
}
