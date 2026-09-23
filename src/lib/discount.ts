import type { DiscountType } from "@prisma/client";

/**
 * Pure, DB-free discount math — mirrors src/lib/basket-math.ts's own
 * "no React, no Prisma, no database" convention so every rule here is
 * independently unit-testable and reusable from both the server (the
 * authoritative computation, see src/server/commerce/counter-sale.ts) and
 * the client (a live preview only — never trusted, see "Security" in
 * docs/PHASE_3_6_5_REPORT.md Part 2).
 */

export const MAX_DISCOUNT_PERCENTAGE = 100;

export type DiscountInput = { type: DiscountType; value: number } | null;

export type DiscountComputationError =
  | { type: "INVALID_PERCENTAGE"; message: string }
  | { type: "INVALID_FLAT_AMOUNT"; message: string }
  | { type: "DISCOUNT_EXCEEDS_SUBTOTAL"; message: string };

export type ComputeDiscountResult =
  | { success: true; discountInPaise: number }
  | { success: false; error: DiscountComputationError };

/**
 * Computes the actual discount amount (in paise) from an admin-entered
 * `{type, value}` pair — section 2's exactly-one-of-Flat-or-Percentage,
 * never stacked. Returns `{success: true, discountInPaise: 0}` for `null`
 * (no discount), the common case for every order.
 *
 * `value`'s meaning is type-dependent, by design (section 3's "simple UX,
 * no complicated pricing screen" — one input field, its unit implied by
 * whichever discount type is selected):
 * - FLAT: a positive whole number of PAISE (the UI converts a rupee input
 *   to paise before this is ever called, same as every other money field
 *   in this codebase).
 * - PERCENTAGE: a positive whole number, 1-100. Fractional percentages
 *   (e.g. 12.5%) are a deliberate, documented simplification — not
 *   supported this phase; see "Known limitations".
 *
 * A discount that would exceed the subtotal (making the Grand Total
 * negative) is a validation ERROR, never silently clamped — silently
 * capping what an admin typed could make the displayed total not match
 * what they entered, undermining trust in the number shown.
 */
export function computeDiscountInPaise(params: {
  subtotalInPaise: number;
  discount: DiscountInput;
}): ComputeDiscountResult {
  const { subtotalInPaise, discount } = params;
  if (!discount) return { success: true, discountInPaise: 0 };

  if (discount.type === "PERCENTAGE") {
    if (!Number.isInteger(discount.value) || discount.value <= 0 || discount.value > MAX_DISCOUNT_PERCENTAGE) {
      return {
        success: false,
        error: {
          type: "INVALID_PERCENTAGE",
          message: `Percentage discount must be a whole number between 1 and ${MAX_DISCOUNT_PERCENTAGE}.`,
        },
      };
    }
    const discountInPaise = Math.round((subtotalInPaise * discount.value) / 100);
    return finalizeDiscount(discountInPaise, subtotalInPaise);
  }

  // FLAT
  if (!Number.isInteger(discount.value) || discount.value <= 0) {
    return {
      success: false,
      error: { type: "INVALID_FLAT_AMOUNT", message: "Flat discount must be a positive amount." },
    };
  }
  return finalizeDiscount(discount.value, subtotalInPaise);
}

function finalizeDiscount(discountInPaise: number, subtotalInPaise: number): ComputeDiscountResult {
  if (discountInPaise > subtotalInPaise) {
    return {
      success: false,
      error: {
        type: "DISCOUNT_EXCEEDS_SUBTOTAL",
        message: "Discount cannot exceed the order subtotal.",
      },
    };
  }
  return { success: true, discountInPaise };
}

export type DiscountAllocationLine = { lineTotalInPaise: number };

/**
 * Section 6/11 — allocates `discountInPaise` proportionally across
 * `lines` (keyed to each line's ORIGINAL, pre-discount `lineTotalInPaise`)
 * using the **largest-remainder method** (Hamilton's apportionment) —
 * chosen specifically because it GUARANTEES the returned effective totals
 * sum to EXACTLY `subtotal - discountInPaise`, unlike simpler alternatives:
 *
 * - Rounding each line's share independently (`Math.round`) can overshoot
 *   or undershoot the target discount by a few paise once summed — this
 *   codebase never accepts a total that doesn't reconcile exactly.
 * - Letting one line (e.g. the last) silently "absorb" the entire
 *   rounding remainder is simpler but can make one line disproportionately
 *   over- or under-discounted, especially unfair if that line happens to
 *   be a small one.
 *
 * Algorithm: compute each line's exact (fractional) proportional share,
 * take the floor of each, then distribute the few leftover paise (the
 * difference between the discount total and the sum of the floors — always
 * a non-negative integer smaller than the number of lines) one-at-a-time to
 * the lines with the LARGEST fractional remainder, largest first. Ties are
 * broken by original array order, making the whole function fully
 * deterministic for identical input every time — required for
 * `effectiveLineTotalInPaise` to be a stable, reproducible historical
 * snapshot, not something that could vary run to run.
 *
 * Returns each line's discounted total, in the SAME order as `lines`.
 * `discountInPaise <= 0` or a zero/negative subtotal is a no-op (every
 * line's original total is returned unchanged) — covers both "no
 * discount" and the degenerate empty-cart case defensively.
 */
export function allocateDiscountAcrossLines(
  lines: DiscountAllocationLine[],
  discountInPaise: number,
): number[] {
  const subtotalInPaise = lines.reduce((sum, line) => sum + line.lineTotalInPaise, 0);
  if (discountInPaise <= 0 || subtotalInPaise <= 0) {
    return lines.map((line) => line.lineTotalInPaise);
  }

  const rawShares = lines.map((line) => (discountInPaise * line.lineTotalInPaise) / subtotalInPaise);
  const lineDiscounts = rawShares.map(Math.floor);
  const allocatedSoFar = lineDiscounts.reduce((sum, share) => sum + share, 0);
  const remainder = discountInPaise - allocatedSoFar;

  const byFractionDescending = rawShares
    .map((share, index) => ({ index, fraction: share - Math.floor(share) }))
    .sort((a, b) => b.fraction - a.fraction || a.index - b.index);

  for (let i = 0; i < remainder; i++) {
    lineDiscounts[byFractionDescending[i]!.index] += 1;
  }

  return lines.map((line, index) => line.lineTotalInPaise - lineDiscounts[index]!);
}

/**
 * Sections 8/9/10 — derives the effective (post-discount) value of a
 * PARTIAL quantity out of a line, for Return/Exchange calculations. NEVER
 * a second stored snapshot: `effectiveLineTotalInPaise` (immutable, on
 * OrderItem) is the one persisted fact; this is a pure, on-demand
 * derivation from it.
 *
 * Returning/exchanging the FULL purchased quantity always yields EXACTLY
 * `effectiveLineTotalInPaise` — no rounding drift for the common
 * "return the whole line" case, since the ratio is exactly 1. A genuinely
 * PARTIAL quantity is a proportionally-rounded share; see "Known
 * limitations" in docs/PHASE_3_6_5_REPORT.md Part 2 for the (minor,
 * cosmetic-only) rounding note this implies.
 */
export function effectivePriceForQuantity(params: {
  effectiveLineTotalInPaise: number;
  purchasedQuantity: number;
  requestedQuantity: number;
}): number {
  const { effectiveLineTotalInPaise, purchasedQuantity, requestedQuantity } = params;
  if (purchasedQuantity <= 0) return 0;
  if (requestedQuantity >= purchasedQuantity) return effectiveLineTotalInPaise;
  return Math.round((effectiveLineTotalInPaise * requestedQuantity) / purchasedQuantity);
}
