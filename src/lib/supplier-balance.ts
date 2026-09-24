import { formatPaise } from "@/lib/money";

/** The reference on the bill that records a supplier's opening balance
 * (purana baaki) — see createQuickSupplier. */
export const OPENING_BALANCE_REFERENCE = "Opening balance";

/**
 * What the shop owes a supplier right now, in one number — the figure a
 * shopkeeper actually asks for ("kitna dena hai?"). Same as the supplier
 * ledger's closing balance:
 *
 *   bills − payments − credit notes + refunds
 *
 * Payments count in full (an advance still reduces what's owed), and a
 * refund is money the supplier sent BACK, so it raises the balance
 * towards zero. Positive: the shop owes the supplier. Negative: the
 * supplier owes the shop (advance / credit not yet used).
 */
export function netSupplierBalanceInPaise(totals: {
  purchasesInPaise: number;
  paymentsInPaise: number;
  creditsInPaise: number;
  refundsInPaise: number;
}): number {
  return totals.purchasesInPaise - totals.paymentsInPaise - totals.creditsInPaise + totals.refundsInPaise;
}

export type SupplierBalanceTone = "owe" | "settled" | "advance";

export type SupplierBalanceDisplay = {
  tone: SupplierBalanceTone;
  /** Always positive — the tone says which way it goes. */
  amountInPaise: number;
  /** Short English label, e.g. "₹4,500 to pay". */
  label: string;
  /** The Hindi hint shown beside it, e.g. "Dena hai". */
  hint: string;
};

export function describeSupplierBalance(netInPaise: number): SupplierBalanceDisplay {
  if (netInPaise > 0) {
    return { tone: "owe", amountInPaise: netInPaise, label: `${formatPaise(netInPaise)} to pay`, hint: "Dena hai" };
  }
  if (netInPaise < 0) {
    return {
      tone: "advance",
      amountInPaise: -netInPaise,
      label: `${formatPaise(-netInPaise)} paid extra`,
      hint: "Lena hai",
    };
  }
  return { tone: "settled", amountInPaise: 0, label: "All paid", hint: "Hisaab barabar" };
}

export { allocateOldestFirst } from "@/lib/allocate-oldest-first";

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;

/** Midnight on the 1st of the current month in India time, as a UTC
 * instant — the start of "this month" for the supplier summary. */
export function startOfMonthInIndia(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), 1) - IST_OFFSET_MS);
}

/** Midnight today in India time, as a UTC instant. An opening balance is
 * dated here so it sorts before any bill dated today — it's the oldest
 * money owed, so it's shown first and paid first. */
export function startOfDayInIndia(now: Date = new Date()): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate()) - IST_OFFSET_MS);
}
