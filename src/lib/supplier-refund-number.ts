import { UNAMBIGUOUS_ALPHABET, generateUnambiguousCode } from "@/lib/unambiguous-code";

const SUFFIX_LENGTH = 5;

function datePart(date: Date): string {
  const yyyy = date.getUTCFullYear().toString().padStart(4, "0");
  const mm = (date.getUTCMonth() + 1).toString().padStart(2, "0");
  const dd = date.getUTCDate().toString().padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

/**
 * Generates a human-friendly supplier-refund reference like
 * SRF-20260816-K7M3P — same shape/reasoning as
 * `generateSupplierCreditNumber` (src/lib/supplier-credit-number.ts).
 */
export function generateSupplierRefundNumber(date: Date): string {
  return `SRF-${datePart(date)}-${generateUnambiguousCode(SUFFIX_LENGTH)}`;
}

const REFUND_NUMBER_PATTERN = new RegExp(`^SRF-\\d{8}-[${UNAMBIGUOUS_ALPHABET}]{5}$`);

export function isValidSupplierRefundNumberFormat(value: string): boolean {
  return REFUND_NUMBER_PATTERN.test(value);
}
