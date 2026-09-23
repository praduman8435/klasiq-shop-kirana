/**
 * Pure client-side logic for the /admin/counter-sale form — cart math,
 * validation, and the submit-blocking gate — kept free of React/DOM so it
 * can be unit tested directly. Mirrors the existing src/lib/basket-math.ts
 * pattern (pure basket logic backing the public bag) rather than inventing
 * a new convention. Nothing here talks to the database or duplicates the
 * server-side inventory/customer logic in src/server/commerce/ — those
 * remain the sole source of truth; this module only decides what the
 * cashier sees and whether the "Complete Sale" button should be clickable
 * before that request is ever sent.
 */

import { isValidCustomerIdFormat } from "@/lib/customer-id";
import { computeDiscountInPaise, type DiscountInput } from "@/lib/discount";
import { computePaymentOutcome, type PaymentInput } from "@/lib/payment";

export type CounterSaleCartLine = {
  variantId: string;
  productName: string;
  size: string;
  sku: string;
  priceInPaise: number;
  quantity: number;
  /** Last-known stock figure from search results — advisory for UX only;
   * the server's guarded decrement remains the actual authority. */
  stockQuantity: number;
};

export const COUNTER_SALE_MAX_QUANTITY_PER_LINE = 999;

function clampQuantity(quantity: number, stockQuantity: number): number {
  return Math.max(0, Math.min(quantity, stockQuantity, COUNTER_SALE_MAX_QUANTITY_PER_LINE));
}

/**
 * Adds one unit of `item` to the cart (or increments its existing line by
 * one), clamped to available stock. Adding an out-of-stock item is a no-op
 * — the search UI already disables adding those, this is the defensive
 * second guard, matching "never trust the client" even against its own
 * earlier state.
 */
export function addLineToCart(
  lines: CounterSaleCartLine[],
  item: Omit<CounterSaleCartLine, "quantity">,
): CounterSaleCartLine[] {
  const existing = lines.find((line) => line.variantId === item.variantId);
  if (existing) {
    return lines.map((line) =>
      line.variantId === item.variantId
        ? {
            ...line,
            stockQuantity: item.stockQuantity,
            quantity: clampQuantity(line.quantity + 1, item.stockQuantity),
          }
        : line,
    );
  }
  const quantity = clampQuantity(1, item.stockQuantity);
  if (quantity <= 0) return lines;
  return [...lines, { ...item, quantity }];
}

/** Adjusts a line's quantity by `delta`, clamped to stock; a line that
 * reaches zero is dropped from the cart entirely (matches "Decrease to 0
 * removes it" — the same behavior the previous cart stepper already had,
 * now made explicit and testable). */
export function updateLineQuantity(
  lines: CounterSaleCartLine[],
  variantId: string,
  delta: number,
): CounterSaleCartLine[] {
  return lines
    .map((line) =>
      line.variantId === variantId
        ? { ...line, quantity: clampQuantity(line.quantity + delta, line.stockQuantity) }
        : line,
    )
    .filter((line) => line.quantity > 0);
}

export function removeLineFromCart(
  lines: CounterSaleCartLine[],
  variantId: string,
): CounterSaleCartLine[] {
  return lines.filter((line) => line.variantId !== variantId);
}

export type CounterSaleCartTotals = {
  lineCount: number;
  totalQuantity: number;
  subtotalInPaise: number;
};

export function computeCartTotals(lines: CounterSaleCartLine[]): CounterSaleCartTotals {
  return {
    lineCount: lines.length,
    totalQuantity: lines.reduce((sum, line) => sum + line.quantity, 0),
    subtotalInPaise: lines.reduce((sum, line) => sum + line.priceInPaise * line.quantity, 0),
  };
}

export type CounterSaleCartValidationError =
  | { type: "EMPTY_CART"; message: string }
  | { type: "ZERO_QUANTITY"; message: string; variantId: string }
  | { type: "OVER_STOCK"; message: string; variantId: string };

/**
 * Catches the obvious, avoidable mistakes before a sale is even submitted —
 * an empty cart, a line with no quantity, or a line requesting more than
 * the last-known stock figure. This is a UX pre-check, not the correctness
 * boundary: the server's guarded stock decrement (src/server/commerce/
 * order-core.ts) is what actually prevents overselling, and still runs
 * regardless of what this function concludes.
 */
export function validateCartForSubmission(
  lines: CounterSaleCartLine[],
): CounterSaleCartValidationError | null {
  if (lines.length === 0) {
    return { type: "EMPTY_CART", message: "Add at least one item before completing the sale." };
  }
  for (const line of lines) {
    if (line.quantity <= 0) {
      return {
        type: "ZERO_QUANTITY",
        message: `${line.productName} (${line.size}) has no quantity — remove it or increase the quantity.`,
        variantId: line.variantId,
      };
    }
    if (line.quantity > line.stockQuantity) {
      return {
        type: "OVER_STOCK",
        message: `Only ${line.stockQuantity} of ${line.productName} (${line.size}) available — reduce the quantity.`,
        variantId: line.variantId,
      };
    }
  }
  return null;
}

/**
 * Phase 3.6.5 Part 1 — collapses the old three-way GUEST/EXISTING/NEW
 * choice (section 8: "Completely remove the Existing/New selection. The
 * system decides.") into two: GUEST, or CUSTOMER with a resolved
 * `Customer.id`. There is no more "NEW, not yet created" intermediate
 * client-side state — by the time a customer is selected here, a real
 * Customer row already exists, whether it was found by search or just
 * created via the inline create form (see
 * `CounterSaleCustomerPanel`/`createCounterSaleCustomerAction`). The
 * server-side domain contract (`CounterSaleCustomerInput` in
 * src/server/commerce/counter-sale.ts) still has its own GUEST/EXISTING/NEW
 * three modes, unchanged — this redesigned UI simply never constructs a NEW
 * payload anymore, always resolving to EXISTING (or GUEST) before submit.
 */
export type CounterSaleCustomerSelection =
  | { mode: "GUEST" }
  | { mode: "CUSTOMER"; selectedCustomerId: string | null };

/** Guest never blocks. Customer requires a resolved selection. */
export function validateCounterSaleCustomerSelection(
  selection: CounterSaleCustomerSelection,
): string | null {
  if (selection.mode === "CUSTOMER" && !selection.selectedCustomerId) {
    return "Search for, or create, the customer — or switch to Guest.";
  }
  return null;
}

/**
 * Phase 3.6.5 Part 1 section 7 — "Phone should already be pre-filled from
 * the search value if appropriate." A query is treated as phone-like only
 * when, after stripping the punctuation a phone number is commonly typed
 * with (spaces, hyphens, parens, a leading "+"), every remaining character
 * is a digit — e.g. "98765 43210" or "+91-98765-43210", but not a name
 * ("Priya") or a Customer ID ("KLQ-7A41K2", which contains letters). A
 * name-like query (contains at least one letter, and doesn't look like a
 * Customer ID — either the full `KLQ-XXXXXX` format or just a "KLQ" prefix
 * fragment) instead pre-fills the Name field. Anything else (a
 * Customer-ID-shaped query, or an empty one) pre-fills neither field rather
 * than guessing.
 */
const CUSTOMER_ID_PREFIX_PATTERN = /^KLQ-?/i;

export function detectCreateFormPrefill(query: string): { name: string; phone: string } {
  const trimmed = query.trim();
  const strippedForPhone = trimmed.replace(/[\s\-()]/g, "").replace(/^\+/, "");
  if (strippedForPhone.length > 0 && /^\d+$/.test(strippedForPhone)) {
    return { name: "", phone: trimmed };
  }
  const looksLikeCustomerId = isValidCustomerIdFormat(trimmed) || CUSTOMER_ID_PREFIX_PATTERN.test(trimmed);
  if (/[a-zA-Z]/.test(trimmed) && !looksLikeCustomerId) {
    return { name: trimmed, phone: "" };
  }
  return { name: "", phone: "" };
}

export type CounterSaleSubmitGate = { blocked: true; message: string } | { blocked: false };

/**
 * The single gate the "Complete Sale" button (disabled state) and the
 * submit handler (inline error on a blocked attempt) both consult — one
 * place that decides "can this sale go through right now," combining the
 * in-flight guard (duplicate-click prevention) with cart, customer, and
 * (Phase 3.6.5 Part 2) discount validation. Order matters: an in-flight
 * submission blocks first, so a second click while the network request is
 * pending never re-runs or re-reports the other checks.
 *
 * The discount check reuses `computeDiscountInPaise`
 * (src/lib/discount.ts) — the EXACT SAME function the server calls — for
 * a live, accurate preview (an invalid percentage, or a flat amount that
 * would exceed the cart's own subtotal, is caught here before the cashier
 * even submits). This is a UX convenience only: the server independently
 * recomputes and re-validates the discount from its own freshly-resolved
 * subtotal regardless of what this gate concluded — see "Security" in
 * docs/PHASE_3_6_5_REPORT.md Part 2.
 */
export function getCounterSaleSubmitGate(params: {
  isSubmitting: boolean;
  lines: CounterSaleCartLine[];
  customer: CounterSaleCustomerSelection;
  discount: DiscountInput;
  payment: PaymentInput;
}): CounterSaleSubmitGate {
  if (params.isSubmitting) {
    return { blocked: true, message: "This sale is already being submitted." };
  }
  const cartError = validateCartForSubmission(params.lines);
  if (cartError) return { blocked: true, message: cartError.message };
  const customerError = validateCounterSaleCustomerSelection(params.customer);
  if (customerError) return { blocked: true, message: customerError };

  // Phase 3.6.5 Part 3 section 2 — the identical "Guest can't do Partial
  // Payment" rule the server also enforces (src/server/commerce/counter-sale.ts)
  // — checked here too so the cashier sees this before ever submitting,
  // not just as a server error after the fact.
  if (params.customer.mode === "GUEST" && params.payment.mode === "PARTIAL") {
    return {
      blocked: true,
      message: "Partial payment requires a customer — select or create one, or use Full Payment for a guest sale.",
    };
  }

  const subtotalInPaise = computeCartTotals(params.lines).subtotalInPaise;
  const discountResult = computeDiscountInPaise({ subtotalInPaise, discount: params.discount });
  if (!discountResult.success) return { blocked: true, message: discountResult.error.message };

  const grandTotalInPaise = subtotalInPaise - discountResult.discountInPaise;
  const paymentResult = computePaymentOutcome({ grandTotalInPaise, payment: params.payment });
  if (!paymentResult.success) return { blocked: true, message: paymentResult.error.message };

  return { blocked: false };
}

/**
 * Moves a keyboard-navigated search result cursor by one step, wrapping
 * around either end — shared by the product and customer search panels so
 * ArrowUp/ArrowDown behave identically in both. Returns -1 (no selection)
 * when there are no results to move through.
 */
export function nextSearchResultIndex(params: {
  currentIndex: number;
  resultCount: number;
  direction: "down" | "up";
}): number {
  const { currentIndex, resultCount, direction } = params;
  if (resultCount === 0) return -1;
  if (direction === "down") return (currentIndex + 1) % resultCount;
  return (currentIndex - 1 + resultCount) % resultCount;
}

export type RecentSchool = { id: string; name: string };

const MAX_RECENT_SCHOOLS = 5;

/** Moves `school` to the front of the recent list (deduping it), capped at
 * MAX_RECENT_SCHOOLS — the whole "recent selections" feature is this one
 * pure update plus a localStorage read/write in the component, no backend
 * involved. */
export function addRecentSchool(recents: RecentSchool[], school: RecentSchool): RecentSchool[] {
  return [school, ...recents.filter((r) => r.id !== school.id)].slice(0, MAX_RECENT_SCHOOLS);
}
