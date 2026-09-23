/// Phase 3.5 Part 5 — Price Difference Foundation. Pure, DB-free
/// calculation (mirrors `src/lib/return-eligibility.ts`'s own shape) —
/// the one place both a future customer-facing screen and today's admin
/// Return Detail page can ask "what's the price difference on this
/// exchange?" without reimplementing the arithmetic. Deliberately
/// computes from two already-persisted snapshots
/// (`OrderItem.effectiveLineTotalInPaise`,
/// `ReturnRequestItem.replacementUnitPriceInPaiseSnapshot`) rather than a
/// third persisted "difference" column — the difference is cheap to
/// derive and would otherwise be redundant, drift-prone stored data. See
/// docs/PHASE_3_5_REPORT.md Part 5 "Price Difference Foundation".
///
/// NO PAYMENT PROCESSING happens anywhere near this function — it only
/// ever answers "what would the difference be," never charges, refunds,
/// or moves money. That remains explicitly out of scope (a later phase).
///
/// Phase 3.6.5 Part 2 — takes already-computed VALUES (not a unit price to
/// multiply by quantity) so the caller supplies the ORIGINAL item's
/// EFFECTIVE (post-discount) value — via
/// `effectivePriceForQuantity` (src/lib/discount.ts) — never the catalog
/// `unitPriceInPaise` snapshot. See "Exchanges" in
/// docs/PHASE_3_6_5_REPORT.md Part 2 for why: a customer who negotiated a
/// discount on the original item must have that discount reflected in
/// what they're credited for it during an exchange, not the pre-discount
/// catalog price. The REPLACEMENT value is still a plain catalog-price
/// multiplication (the replacement is a NEW item, issued at its own
/// current price — no discount carries over to it), computed by the
/// caller from `replacementUnitPriceInPaiseSnapshot * quantity`.
export type PriceDifferenceType = "CUSTOMER_PAYS" | "REFUND_DUE" | "EQUAL_VALUE";

export type PriceDifference = {
  originalValueInPaise: number;
  replacementValueInPaise: number;
  differenceInPaise: number;
  type: PriceDifferenceType;
};

export function getExchangePriceDifference(params: {
  originalValueInPaise: number;
  replacementValueInPaise: number;
}): PriceDifference {
  const { originalValueInPaise, replacementValueInPaise } = params;

  const differenceInPaise = replacementValueInPaise - originalValueInPaise;

  const type: PriceDifferenceType =
    differenceInPaise > 0 ? "CUSTOMER_PAYS" : differenceInPaise < 0 ? "REFUND_DUE" : "EQUAL_VALUE";

  return { originalValueInPaise, replacementValueInPaise, differenceInPaise, type };
}

export const PRICE_DIFFERENCE_TYPE_LABEL: Record<PriceDifferenceType, string> = {
  CUSTOMER_PAYS: "Customer Pays",
  REFUND_DUE: "Refund Due",
  EQUAL_VALUE: "Equal Value",
};
