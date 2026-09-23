import type { DiscountType, PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import {
  resolveCounterSaleAddressSnapshot,
  type AddressSnapshot,
  type CounterSaleAddressInput,
} from "@/lib/counter-sale-address";
import { allocateDiscountAcrossLines, computeDiscountInPaise } from "@/lib/discount";
import { computePaymentOutcome, type PaymentInput } from "@/lib/payment";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import {
  createOrderWithUniqueNumber,
  findOrderByIdempotencyKeyRaw,
  resolveAndDecrementOrderLines,
  type OrderLineIssue,
} from "@/server/commerce/order-core";
import { findOrCreateCustomerByPrimaryPhone } from "@/server/commerce/customer";

export type CounterSaleCustomerInput =
  | { mode: "GUEST" }
  | { mode: "EXISTING"; customerId: string }
  | { mode: "NEW"; displayName?: string; primaryPhone: string };

export type CreateCounterSaleError =
  | { type: "EMPTY_SALE"; message: string }
  | { type: "STOCK_ISSUE"; message: string; issues: OrderLineIssue[] }
  | { type: "CUSTOMER_NOT_FOUND"; message: string }
  | { type: "INVALID_PHONE"; message: string }
  | { type: "SCHOOL_NOT_FOUND"; message: string }
  | { type: "DISCOUNT_INVALID"; message: string }
  | { type: "PARTIAL_PAYMENT_REQUIRES_CUSTOMER"; message: string }
  | { type: "PAYMENT_INVALID"; message: string }
  | { type: "ADDRESS_SAVED_REQUIRES_CUSTOMER"; message: string }
  | { type: "UNKNOWN"; message: string };

export type CreateCounterSaleResult =
  | { success: true; orderNumber: string; accessToken: string; alreadyExisted: boolean }
  | { success: false; error: CreateCounterSaleError };

class CounterSaleDomainError extends Error {
  constructor(public readonly domainError: CreateCounterSaleError) {
    super(domainError.message);
  }
}

type ResolvedCounterSaleCustomer = {
  customerId: string | null;
  customerName: string | null;
  customerMobile: string | null;
  /// Phase 3.6.6 Part 1 — the customer's CURRENT saved address, read
  /// fresh as part of resolving the customer (never trusted from the
  /// caller) — `null` for GUEST (no customer to read one from) and for
  /// any customer who has never had one set. Consulted ONLY when the
  /// caller's `address` input is `{ mode: "SAVED" }`; see
  /// `resolveCounterSaleAddressSnapshot` (src/lib/counter-sale-address.ts).
  savedAddress: AddressSnapshot | null;
};

/**
 * Resolves the three customer modes a counter sale supports — see
 * docs/PHASE_3_2_REPORT.md "Customer selection". GUEST never touches the
 * database. EXISTING looks up the internal Customer.id a staff member
 * picked from search results. NEW reuses Phase 3.1's
 * findOrCreateCustomerByPrimaryPhone unchanged — it already guarantees the
 * same phone never gets a second identity, which is exactly the guarantee
 * a counter sale needs too.
 */
async function resolveCounterSaleCustomer(
  input: CounterSaleCustomerInput,
): Promise<{ success: true; customer: ResolvedCounterSaleCustomer } | { success: false; error: CreateCounterSaleError }> {
  if (input.mode === "GUEST") {
    return {
      success: true,
      customer: { customerId: null, customerName: null, customerMobile: null, savedAddress: null },
    };
  }

  if (input.mode === "EXISTING") {
    const existing = await db.customer.findUnique({ where: { id: input.customerId } });
    if (!existing) {
      return {
        success: false,
        error: { type: "CUSTOMER_NOT_FOUND", message: "That customer no longer exists." },
      };
    }
    return {
      success: true,
      customer: {
        customerId: existing.id,
        customerName: existing.displayName,
        customerMobile: existing.primaryPhone,
        savedAddress: {
          addressLine: existing.addressLine,
          city: existing.addressCity,
          state: existing.addressState,
          pincode: existing.addressPincode,
        },
      },
    };
  }

  const result = await findOrCreateCustomerByPrimaryPhone({
    rawPhone: input.primaryPhone,
    displayName: input.displayName,
  });
  if (!result.success) {
    return { success: false, error: { type: "INVALID_PHONE", message: result.error.message } };
  }
  return {
    success: true,
    customer: {
      customerId: result.customer.id,
      customerName: result.customer.displayName ?? input.displayName ?? null,
      customerMobile: input.primaryPhone,
      savedAddress: {
        addressLine: result.customer.addressLine,
        city: result.customer.addressCity,
        state: result.customer.addressState,
        pincode: result.customer.addressPincode,
      },
    },
  };
}

/**
 * The one and only path that creates a counter-sale Order. Reuses the same
 * inventory-deduction/order-number/idempotency primitives as online
 * checkout (src/server/commerce/order-core.ts) — never a second inventory
 * implementation — and the same Phase 3.1 customer service. See
 * docs/PHASE_3_2_REPORT.md "Architecture".
 *
 * Always creates a COUNTER_HANDOVER order: goods leave with the customer
 * immediately, so the order is created directly as DELIVERED — there is
 * no PENDING/CONFIRMED/PREPARING gap to model, and nothing transitions
 * out of DELIVERED today (same as an online order, once delivered).
 * `paymentStatus` is DERIVED (Phase 3.6.5 Part 3) from how much was
 * actually received against the Grand Total — PAID for a full payment
 * (the only outcome before Part 3), PARTIALLY_PAID or UNPAID for a
 * Khata-style credit sale — but the goods themselves still hand over
 * immediately regardless; DELIVERED never waits on payment. A counter
 * customer who instead wants delivery-from-shop is a LOCAL_DELIVERY
 * order — that path already exists and needs no change here; it simply
 * isn't what this function's fixed-speed "handover" flow builds. See
 * docs/PHASE_3_2_REPORT.md "Order status for counter sales" for the full
 * reasoning.
 */
export async function createCounterSale(input: {
  lines: { productVariantId: string; quantity: number }[];
  customer: CounterSaleCustomerInput;
  schoolId: string | null;
  paymentMethod: Extract<PaymentMethod, "CASH" | "UPI" | "CARD">;
  idempotencyKey: string;
  /// The authenticated admin recording this sale — see
  /// docs/PHASE_3_2_REPORT.md "Auditability". Always required: unlike
  /// `Order.createdByAdminUserId` (nullable at the schema level, since an
  /// ONLINE order has no admin at all), every counter sale genuinely has
  /// one, and the caller (the Server Action) already has it from the
  /// session — this is never client-supplied.
  adminUserId: string;
  /// Phase 3.6.5 Part 2 — the negotiated discount, if any. `null`/omitted
  /// means no discount, identical to every counter sale before this
  /// phase. `value`'s unit is type-dependent (paise for FLAT, whole
  /// percent 1-100 for PERCENTAGE) — see src/lib/discount.ts. The actual
  /// discount amount is ALWAYS recomputed here from the server's own
  /// freshly-resolved subtotal, never trusted from the caller (section
  /// 15 — see "Security" in docs/PHASE_3_6_5_REPORT.md Part 2).
  discount?: { type: DiscountType; value: number; reason?: string } | null;
  /// Phase 3.6.5 Part 3 — Full or Partial Payment. Omitted defaults to
  /// `{mode: "FULL"}` — identical to every counter sale before this
  /// phase (received == Grand Total, paymentStatus PAID). PARTIAL is
  /// only ever meaningful with a Customer attached (section 2) — see
  /// the GUEST check below; the received amount, when PARTIAL, is
  /// ALWAYS validated against the server's own freshly-computed Grand
  /// Total, never trusted as-is from the caller.
  payment?: PaymentInput;
  /// Phase 3.6.6 Part 1 — section 2's optional invoice address. Omitted
  /// defaults to `{mode: "NONE"}` — identical to every counter sale
  /// before this phase (no address recorded at all). `mode: "SAVED"` is
  /// only ever meaningful with a Customer attached (mirrors Partial
  /// Payment's own GUEST restriction directly above) — resolved against
  /// that customer's OWN freshly-read saved address inside the
  /// transaction below, never a client-echoed value. `mode: "ONE_TIME"`
  /// works for Guest or Customer and is NEVER written back to
  /// `Customer` (section 4) — see src/lib/counter-sale-address.ts.
  address?: CounterSaleAddressInput;
}): Promise<CreateCounterSaleResult> {
  if (input.lines.length === 0) {
    return { success: false, error: { type: "EMPTY_SALE", message: "Add at least one item." } };
  }

  // Section 2 — "Partial payment should only be meaningful when a
  // Customer is attached." A guest sale has no one to track Khata credit
  // against, so partial payment for a guest is rejected outright, before
  // any database work — never silently downgraded to Full Payment (that
  // would let a discount/negotiation silently disappear without telling
  // the cashier) and never allowed to create untracked, uncollectible
  // "debt." See docs/PHASE_3_6_5_REPORT.md Part 3 "Guest behaviour".
  const payment: PaymentInput = input.payment ?? { mode: "FULL" };
  if (input.customer.mode === "GUEST" && payment.mode === "PARTIAL") {
    return {
      success: false,
      error: {
        type: "PARTIAL_PAYMENT_REQUIRES_CUSTOMER",
        message: "Partial payment requires a customer — select or create one, or use Full Payment for a guest sale.",
      },
    };
  }

  // Section 4 — "Use Saved Address" has no meaning for a Guest sale:
  // there is no Customer to read one from. The Counter Sale form never
  // offers this choice to a Guest in the first place (its own
  // `savedAddress` prop is only ever populated for a selected Customer),
  // but this is the same defense-in-depth "never trust the client"
  // check as the Partial Payment one directly above — rejected before
  // any database work, never silently downgraded to no address.
  const address: CounterSaleAddressInput = input.address ?? { mode: "NONE" };
  if (input.customer.mode === "GUEST" && address.mode === "SAVED") {
    return {
      success: false,
      error: {
        type: "ADDRESS_SAVED_REQUIRES_CUSTOMER",
        message: "A saved address requires a customer — select or create one, or enter a one-time address for a guest sale.",
      },
    };
  }

  const existingByKey = await findOrderByIdempotencyKeyRaw(input.idempotencyKey);
  if (existingByKey) {
    return {
      success: true,
      orderNumber: existingByKey.orderNumber,
      accessToken: existingByKey.accessToken,
      alreadyExisted: true,
    };
  }

  const resolvedCustomer = await resolveCounterSaleCustomer(input.customer);
  if (!resolvedCustomer.success) {
    return { success: false, error: resolvedCustomer.error };
  }

  if (input.schoolId) {
    const school = await db.school.findUnique({ where: { id: input.schoolId } });
    if (!school) {
      return {
        success: false,
        error: { type: "SCHOOL_NOT_FOUND", message: "That school no longer exists — refresh and try again." },
      };
    }
  }

  try {
    const order = await db.$transaction(async (tx) => {
      const resolved = await resolveAndDecrementOrderLines(tx, input.lines);
      if (!resolved.success) {
        throw new CounterSaleDomainError({
          type: "STOCK_ISSUE",
          message: "Some items are no longer available in the requested quantity.",
          issues: resolved.issues,
        });
      }

      const { lines, subtotalInPaise } = resolved;

      // Phase 3.6.5 Part 2 section 15 — the discount amount is ALWAYS
      // recomputed here, from the subtotal this same transaction just
      // resolved from FRESH variant prices, never from any client-supplied
      // total. A discount that fails validation (bad shape, or would
      // exceed the subtotal) rolls back the entire transaction — the
      // stock decrement above is undone along with everything else.
      const discountResult = computeDiscountInPaise({
        subtotalInPaise,
        discount: input.discount ?? null,
      });
      if (!discountResult.success) {
        throw new CounterSaleDomainError({ type: "DISCOUNT_INVALID", message: discountResult.error.message });
      }
      const { discountInPaise } = discountResult;

      // Section 6 — the order-level discount, allocated proportionally
      // across every line via the largest-remainder method (see
      // src/lib/discount.ts), so effectiveLineTotalInPaise sums to
      // EXACTLY subtotalInPaise - discountInPaise across all lines.
      const effectiveLineTotals = allocateDiscountAcrossLines(lines, discountInPaise);

      // Phase 3.6.5 Part 3 section 3/12 — the Grand Total this payment is
      // measured against is computed from THIS transaction's own fresh
      // subtotal and discount, never a client-supplied figure. A payment
      // that fails validation (negative, or exceeding the Grand Total)
      // rolls back the ENTIRE transaction — the stock decrement above is
      // undone along with everything else, identical to a discount
      // failure.
      const grandTotalInPaise = subtotalInPaise - discountInPaise;
      const paymentResult = computePaymentOutcome({ grandTotalInPaise, payment });
      if (!paymentResult.success) {
        throw new CounterSaleDomainError({ type: "PAYMENT_INVALID", message: paymentResult.error.message });
      }
      const { amountReceivedInPaise, outstandingInPaise, paymentStatus } = paymentResult.outcome;

      // Phase 3.6.6 Part 1 section 5 — resolved from the customer's OWN
      // freshly-read saved address (never a client-echoed value) when
      // `mode: "SAVED"`, or the given one-time fields otherwise. This
      // snapshot is the ONLY thing written to the Order — never to
      // `Customer` (see `resolveCounterSaleAddressSnapshot`'s own doc
      // comment for why that guarantee holds by construction).
      const addressSnapshot = resolveCounterSaleAddressSnapshot({
        address,
        savedAddress: resolvedCustomer.customer.savedAddress,
      });

      const createdOrder = await createOrderWithUniqueNumber(tx, (orderNumber, accessToken) => ({
        orderNumber,
        accessToken,
        idempotencyKey: input.idempotencyKey,
        source: "COUNTER",
        schoolId: input.schoolId,
        createdByAdminUserId: input.adminUserId,
        customerId: resolvedCustomer.customer.customerId,
        customerName: resolvedCustomer.customer.customerName,
        customerMobile: resolvedCustomer.customer.customerMobile,
        customerAddressLine: addressSnapshot.addressLine,
        customerAddressCity: addressSnapshot.city,
        customerAddressState: addressSnapshot.state,
        customerAddressPincode: addressSnapshot.pincode,
        fulfillmentType: "COUNTER_HANDOVER",
        paymentMethod: input.paymentMethod,
        // Section 6 — derived from the actual received-vs-Grand-Total
        // relationship, never hardcoded PAID anymore — a Full Payment
        // sale (the only kind that existed before this phase) still
        // always computes to PAID, so nothing changes for that case.
        paymentStatus,
        status: "DELIVERED",
        // Stamped at creation, not left for a later transition (there
        // never is one — DELIVERED is where a Counter sale starts and
        // ends) — Phase 3.5's 7-day return window reads this exactly like
        // it does for an online order's deliveredAt. Goods still hand
        // over immediately regardless of payment status — a Khata credit
        // sale is still a completed, delivered transaction; only the
        // MONEY is partially outstanding, never the goods.
        deliveredAt: new Date(),
        subtotalInPaise,
        deliveryFeeInPaise: 0,
        // Grand Total — see Order.totalInPaise's own schema doc comment.
        totalInPaise: grandTotalInPaise,
        discountType: input.discount?.type ?? null,
        discountValue: input.discount?.value ?? null,
        discountReason: input.discount?.reason?.trim() || null,
        discountInPaise,
        // Section 5 — immutable historical accounting, set once, here.
        amountReceivedInPaise,
        outstandingInPaise,
        items: {
          create: lines.map((line, index) => ({
            productId: line.productId,
            productVariantId: line.productVariantId,
            productName: line.productName,
            size: line.size,
            skuSnapshot: line.skuSnapshot,
            unitPriceInPaise: line.unitPriceInPaise,
            quantity: line.quantity,
            lineTotalInPaise: line.lineTotalInPaise,
            effectiveLineTotalInPaise: effectiveLineTotals[index]!,
          })),
        },
      }));

      if (!createdOrder) {
        throw new CounterSaleDomainError({
          type: "UNKNOWN",
          message: "Could not generate a unique order number. Please try again.",
        });
      }

      // Keeps Customer.lastOrderAt accurate for the linked customer, in the
      // same transaction as the order that caused it — see
      // docs/PHASE_3_2_REPORT.md "Customer history".
      if (resolvedCustomer.customer.customerId) {
        await tx.customer.update({
          where: { id: resolvedCustomer.customer.customerId },
          data: { lastOrderAt: new Date() },
        });
      }

      return createdOrder;
    });

    return {
      success: true,
      orderNumber: order.orderNumber,
      accessToken: order.accessToken,
      alreadyExisted: false,
    };
  } catch (err) {
    if (err instanceof CounterSaleDomainError) {
      return { success: false, error: err.domainError };
    }

    // Same race-recovery shape as placeOrderForBasket: two near-simultaneous
    // submissions with the same idempotency key can both pass the up-front
    // check before either commits; the loser hits the unique constraint at
    // insert time. Recover by returning the winner's order.
    if (isUniqueConstraintErrorOn(err, "idempotencyKey")) {
      const winner = await findOrderByIdempotencyKeyRaw(input.idempotencyKey);
      if (winner) {
        return {
          success: true,
          orderNumber: winner.orderNumber,
          accessToken: winner.accessToken,
          alreadyExisted: true,
        };
      }
    }

    console.error(
      "createCounterSale: unexpected error",
      err instanceof Error ? err.message : String(err),
    );
    return {
      success: false,
      error: { type: "UNKNOWN", message: "Something went wrong recording this sale. Please try again." },
    };
  }
}
