/**
 * Pure, DB-free Receive Payment validation — mirrors `src/lib/discount.ts`/
 * `src/lib/payment.ts`'s own convention (no Prisma, independently unit
 * testable, reusable from both the server's authoritative computation and
 * a future client-side live preview). See docs/PHASE_3_6_5_REPORT.md Part
 * 5 "Payment validation".
 */

export type ReceivePaymentValidationError =
  | { type: "INVALID_AMOUNT"; message: string }
  | { type: "EXCEEDS_OUTSTANDING"; message: string }
  | { type: "ALREADY_PAID"; message: string };

/**
 * Section 3 — "Prevent: Negative amounts, Zero amounts, Overpayment.
 * Outstanding must never become negative." `outstandingInPaise` here must
 * always be the CALLER's own freshly-read, current Order.outstandingInPaise
 * (never a stale or client-supplied figure) — this function has no way to
 * enforce that itself, it only ever validates the relationship between the
 * two numbers it's given; the caller (`receivePayment`) is what makes that
 * guarantee true in practice, exactly like `computePaymentOutcome` relies
 * on its own caller for `grandTotalInPaise`.
 *
 * An order with zero Outstanding is reported as `ALREADY_PAID` rather than
 * a generic `EXCEEDS_OUTSTANDING` — a meaningfully different situation (
 * "there's nothing left to collect" vs. "you asked for too much") worth
 * its own distinguishable type, consistent with this codebase's general
 * preference for precise error types over one catch-all.
 */
export function validateReceivePaymentAmount(params: {
  amountInPaise: number;
  outstandingInPaise: number;
}): ReceivePaymentValidationError | null {
  const { amountInPaise, outstandingInPaise } = params;

  if (outstandingInPaise <= 0) {
    return { type: "ALREADY_PAID", message: "This order has no outstanding balance." };
  }
  if (!Number.isInteger(amountInPaise) || amountInPaise <= 0) {
    return { type: "INVALID_AMOUNT", message: "Enter an amount greater than zero." };
  }
  if (amountInPaise > outstandingInPaise) {
    return { type: "EXCEEDS_OUTSTANDING", message: "Cannot exceed the outstanding balance." };
  }
  return null;
}
