import { UNAMBIGUOUS_ALPHABET, generateUnambiguousCode } from "@/lib/unambiguous-code";

const SUFFIX_LENGTH = 5;

function datePart(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Generates a human-friendly, WhatsApp/phone-readable order number like
 * ORD-20260804-K7M3P. Deliberately NOT derived from a "count + 1" — that
 * pattern silently breaks under concurrent inserts (two orders can read the
 * same count before either commits). Uniqueness is guaranteed by the
 * database's UNIQUE constraint on Order.orderNumber, not by this function:
 * the caller (place-order.ts) retries with a fresh call on a collision.
 * With a 30-character alphabet and 5 random characters, a same-day
 * collision needs >24 million orders before it becomes likely — the retry
 * loop exists to make even that safe, not because it's expected to fire.
 */
export function generateOrderNumber(date: Date): string {
  return `ORD-${datePart(date)}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

const ORDER_NUMBER_PATTERN = new RegExp(`^ORD-\\d{8}-[${UNAMBIGUOUS_ALPHABET}]{5}$`);

export function isValidOrderNumberFormat(value: string): boolean {
  return ORDER_NUMBER_PATTERN.test(value);
}
