import { UNAMBIGUOUS_ALPHABET, generateUnambiguousCode } from "@/lib/unambiguous-code";

const SUFFIX_LENGTH = 5;

function datePart(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Generates a human-friendly supplier-return reference like
 * RSUP-20260816-K7M3P — the exact same shape and reasoning as
 * `generateReturnNumber` (src/lib/return-number.ts), but with its own
 * "RSUP-" prefix rather than sharing that generator's "RET-" one:
 * Phase 4 Part 5 explicitly requires the customer-return and
 * supplier-return domains stay uncoupled, and a shared prefix would
 * make a return number visually ambiguous about which domain it
 * belongs to. Never derived from "count + 1" (breaks under concurrent
 * inserts) — uniqueness is enforced by the database's UNIQUE constraint
 * on SupplierPurchaseReturn.returnNumber, caller retries with a fresh
 * call on collision, same as every other number generator in this
 * codebase.
 */
export function generateSupplierPurchaseReturnNumber(date: Date): string {
  return `RSUP-${datePart(date)}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

const RETURN_NUMBER_PATTERN = new RegExp(`^RSUP-\\d{8}-[${UNAMBIGUOUS_ALPHABET}]{5}$`);

export function isValidSupplierPurchaseReturnNumberFormat(value: string): boolean {
  return RETURN_NUMBER_PATTERN.test(value);
}
