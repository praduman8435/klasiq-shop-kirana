import type { PaymentStatus } from "@prisma/client";

/**
 * Pure, DB-free payment/outstanding math — mirrors `src/lib/discount.ts`'s
 * own convention (no React, no Prisma writes, independently unit
 * testable, reusable from both the server's authoritative computation
 * and the client's live preview). See docs/PHASE_3_6_5_REPORT.md Part 3
 * "Accounting model".
 */

export type PaymentMode = "FULL" | "PARTIAL";

export type PaymentInput =
  | { mode: "FULL" }
  | { mode: "PARTIAL"; amountReceivedInPaise: number };

export type PaymentComputationError =
  | { type: "INVALID_AMOUNT"; message: string }
  | { type: "EXCEEDS_GRAND_TOTAL"; message: string };

export type PaymentOutcome = {
  amountReceivedInPaise: number;
  outstandingInPaise: number;
  paymentStatus: PaymentStatus;
};

export type ComputePaymentOutcomeResult =
  | { success: true; outcome: PaymentOutcome }
  | { success: false; error: PaymentComputationError };

/**
 * Section 3 — "Outstanding must always be Grand Total − Amount Received.
 * Never use Subtotal. Never use Original Price." `grandTotalInPaise` here
 * must always be the CALLER's own already-discounted Grand Total
 * (subtotal − discount), never a subtotal or catalog figure — this
 * function has no way to enforce that itself, it only ever subtracts
 * from whatever total it's given, so the caller (`createCounterSale`) is
 * what makes this guarantee true in practice.
 *
 * FULL mode ignores any input amount entirely — the received amount is
 * ALWAYS exactly `grandTotalInPaise`, never a client-supplied figure, so
 * there is nothing to validate or trust for the common case (section 12:
 * "Never trust browser totals" — for Full Payment there is no browser
 * total to trust in the first place).
 *
 * PARTIAL mode validates section 4's rules: never negative, never more
 * than the Grand Total (an amount received a rupee over what's owed
 * isn't "partial," and this codebase has no change-making/overpayment
 * concept — that would be a different feature). A `0` received amount is
 * a valid, intentional PARTIAL outcome — a customer taking goods
 * entirely on credit — never rejected as if it were invalid.
 */
export function computePaymentOutcome(params: {
  grandTotalInPaise: number;
  payment: PaymentInput;
}): ComputePaymentOutcomeResult {
  const { grandTotalInPaise, payment } = params;

  if (payment.mode === "PARTIAL") {
    const { amountReceivedInPaise } = payment;
    if (!Number.isInteger(amountReceivedInPaise) || amountReceivedInPaise < 0) {
      return {
        success: false,
        error: { type: "INVALID_AMOUNT", message: "Amount received cannot be negative." },
      };
    }
    if (amountReceivedInPaise > grandTotalInPaise) {
      return {
        success: false,
        error: { type: "EXCEEDS_GRAND_TOTAL", message: "Amount received cannot exceed the Grand Total." },
      };
    }
    return { success: true, outcome: buildOutcome(amountReceivedInPaise, grandTotalInPaise) };
  }

  return { success: true, outcome: buildOutcome(grandTotalInPaise, grandTotalInPaise) };
}

function buildOutcome(amountReceivedInPaise: number, grandTotalInPaise: number): PaymentOutcome {
  return {
    amountReceivedInPaise,
    outstandingInPaise: grandTotalInPaise - amountReceivedInPaise,
    paymentStatus: derivePaymentStatus(amountReceivedInPaise, grandTotalInPaise),
  };
}

/**
 * Section 6 — the three-way payment-status derivation, expressed as a
 * pure function of the two accounting facts rather than the UI mode that
 * produced them: a Grand Total of ₹0 (e.g. a 100% discount) with ₹0
 * received is still fully `PAID` (there's nothing left to collect), and
 * a `FULL`-mode payment always lands here as `PAID` too (received ==
 * grandTotal, by construction). `>=` (not `===`) defensively treats an
 * amount that somehow reaches or exceeds the Grand Total as fully paid
 * rather than under/over-flagging it — `computePaymentOutcome` above
 * already refuses to construct a received amount greater than the Grand
 * Total, so `>` is unreachable in practice, but this function stays
 * correct even if called directly with a boundary value.
 */
export function derivePaymentStatus(amountReceivedInPaise: number, grandTotalInPaise: number): PaymentStatus {
  if (amountReceivedInPaise >= grandTotalInPaise) return "PAID";
  if (amountReceivedInPaise <= 0) return "UNPAID";
  return "PARTIALLY_PAID";
}
