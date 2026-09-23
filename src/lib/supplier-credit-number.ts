import { UNAMBIGUOUS_ALPHABET, generateUnambiguousCode } from "@/lib/unambiguous-code";

const SUFFIX_LENGTH = 5;

function datePart(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Generates a human-friendly supplier-credit reference like
 * SC-20260816-K7M3P — same shape/reasoning as
 * `generateSupplierPurchaseReturnNumber` (src/lib/supplier-purchase-return-number.ts):
 * never derived from "count + 1", uniqueness enforced by the database's
 * UNIQUE constraint on SupplierCredit.creditNumber, caller retries with a
 * fresh call on collision.
 */
export function generateSupplierCreditNumber(date: Date): string {
  return `SC-${datePart(date)}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

const CREDIT_NUMBER_PATTERN = new RegExp(`^SC-\\d{8}-[${UNAMBIGUOUS_ALPHABET}]{5}$`);

export function isValidSupplierCreditNumberFormat(value: string): boolean {
  return CREDIT_NUMBER_PATTERN.test(value);
}
