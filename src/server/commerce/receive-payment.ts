import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { derivePaymentStatus } from "@/lib/payment";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import { validateReceivePaymentAmount } from "@/lib/receive-payment";

export type ReceivePaymentError =
  | { type: "ORDER_NOT_FOUND"; message: string }
  | { type: "CUSTOMER_MISMATCH"; message: string }
  | { type: "INVALID_AMOUNT"; message: string }
  | { type: "EXCEEDS_OUTSTANDING"; message: string }
  | { type: "ALREADY_PAID"; message: string }
  | { type: "CONFLICT"; message: string }
  | { type: "UNKNOWN"; message: string };

export type ReceivePaymentResult =
  | {
      success: true;
      receiptId: string;
      orderNumber: string;
      outstandingAfterInPaise: number;
      alreadyExisted: boolean;
    }
  | { success: false; error: ReceivePaymentError };

class ReceivePaymentDomainError extends Error {
  constructor(public readonly domainError: ReceivePaymentError) {
    super(domainError.message);
  }
}

/** Guarded-`updateMany` race lost — mirrors `updateOrderStatus`'s/
 * `updatePaymentStatus`'s own `ConcurrencyConflictError` shape exactly
 * (src/server/commerce/update-order-status.ts). */
class ConcurrencyConflictError extends Error {}

/**
 * Records one payment against a Counter Sale's tracked Outstanding balance
 * — the "Receive Payment" capability Phase 3.6.5 Part 3 promised a future
 * phase would add (see that phase's own doc comment on
 * `Order.amountReceivedInPaise`/`outstandingInPaise`). This is the ONE and
 * ONLY code path in this codebase allowed to change those two fields after
 * a Counter Sale's own creation — never a generic "edit this order" admin
 * mutation, never Returns, never Exchanges (see docs/PHASE_3_6_5_REPORT.md
 * Part 5 "Returns"/"Exchanges" for why those remain independent).
 *
 * Three safety properties, each mirroring an existing precedent in this
 * codebase rather than inventing a new one:
 *
 * 1. **Idempotent** (mirrors `createCounterSale`'s own `idempotencyKey`
 *    handling): a repeat submission with the same key returns the SAME
 *    receipt instead of recording the payment twice — critical for a
 *    money-handling action where a network retry must never double-charge
 *    a customer's Khata balance down.
 * 2. **Concurrency-safe** (mirrors `updateOrderStatus`/`updatePaymentStatus`'s
 *    own guarded-`updateMany` pattern): the actual balance write only
 *    succeeds if `outstandingInPaise` still matches what was just read,
 *    inside the same transaction as the read — two admins (or one admin
 *    double-clicking) racing to pay down the same order can't both
 *    succeed and silently corrupt the balance; the loser gets a `CONFLICT`
 *    asking them to refresh, exactly like a concurrent status-transition
 *    conflict already does.
 * 3. **Server-authoritative** (mirrors `computePaymentOutcome`'s own
 *    validation): the amount is validated against the order's own
 *    freshly-read `outstandingInPaise`, read and written inside the SAME
 *    transaction — never a client-supplied "current balance."
 */
export async function receivePayment(input: {
  orderNumber: string;
  /// The customer's PUBLIC identifier (e.g. `KLQ-7A41K2`, `Customer.customerId`
  /// — never the internal `Customer.id` cuid), matching every other
  /// boundary in this codebase that addresses a customer from outside
  /// (the KhataBook route param, `Order.customerId` is resolved from
  /// this INSIDE the transaction below, never the other way around).
  /// Doubles as a defensive guard against a confused-deputy mistake (an
  /// admin viewing one customer's profile submitting a stale order id
  /// for another) — not a security boundary (any admin can already act
  /// on any order), just data-integrity hygiene. See
  /// docs/PHASE_3_6_5_REPORT.md Part 5 "Order link".
  customerId: string;
  amountInPaise: number;
  paymentMethod: Extract<PaymentMethod, "CASH" | "UPI" | "CARD">;
  note?: string | null;
  idempotencyKey: string;
  adminUserId: string;
}): Promise<ReceivePaymentResult> {
  const existingByKey = await db.paymentReceipt.findUnique({
    where: { idempotencyKey: input.idempotencyKey },
    include: { order: { select: { orderNumber: true } } },
  });
  if (existingByKey) {
    return {
      success: true,
      receiptId: existingByKey.id,
      orderNumber: existingByKey.order.orderNumber,
      outstandingAfterInPaise: existingByKey.outstandingAfterInPaise,
      alreadyExisted: true,
    };
  }

  try {
    const receipt = await db.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { orderNumber: input.orderNumber },
        include: { customer: { select: { id: true, customerId: true } } },
      });
      if (!order) {
        throw new ReceivePaymentDomainError({ type: "ORDER_NOT_FOUND", message: "Order not found." });
      }
      if (!order.customer || order.customer.customerId !== input.customerId) {
        throw new ReceivePaymentDomainError({
          type: "CUSTOMER_MISMATCH",
          message: "This order does not belong to the selected customer — refresh and try again.",
        });
      }

      const validationError = validateReceivePaymentAmount({
        amountInPaise: input.amountInPaise,
        outstandingInPaise: order.outstandingInPaise,
      });
      if (validationError) {
        throw new ReceivePaymentDomainError(validationError);
      }

      const newAmountReceivedInPaise = order.amountReceivedInPaise + input.amountInPaise;
      const newOutstandingInPaise = order.outstandingInPaise - input.amountInPaise;
      const newPaymentStatus = derivePaymentStatus(newAmountReceivedInPaise, order.totalInPaise);

      const updated = await tx.order.updateMany({
        where: { id: order.id, outstandingInPaise: order.outstandingInPaise },
        data: {
          amountReceivedInPaise: newAmountReceivedInPaise,
          outstandingInPaise: newOutstandingInPaise,
          paymentStatus: newPaymentStatus,
        },
      });
      if (updated.count === 0) {
        throw new ConcurrencyConflictError();
      }

      return tx.paymentReceipt.create({
        data: {
          orderId: order.id,
          // The INTERNAL Customer.id (order.customer.id), not
          // input.customerId (the PUBLIC KLQ- code just used for the
          // mismatch check above) — PaymentReceipt.customerId is a real
          // FK to Customer.id, mirroring Order.customerId's own column.
          customerId: order.customer.id,
          amountInPaise: input.amountInPaise,
          paymentMethod: input.paymentMethod,
          note: input.note?.trim() || null,
          outstandingBeforeInPaise: order.outstandingInPaise,
          outstandingAfterInPaise: newOutstandingInPaise,
          createdByAdminUserId: input.adminUserId,
          idempotencyKey: input.idempotencyKey,
        },
      });
    });

    return {
      success: true,
      receiptId: receipt.id,
      orderNumber: input.orderNumber,
      outstandingAfterInPaise: receipt.outstandingAfterInPaise,
      alreadyExisted: false,
    };
  } catch (err) {
    if (err instanceof ReceivePaymentDomainError) {
      return { success: false, error: err.domainError };
    }
    if (err instanceof ConcurrencyConflictError) {
      return {
        success: false,
        error: {
          type: "CONFLICT",
          message: "This order's balance changed since you loaded the page. Please refresh.",
        },
      };
    }

    // Same race-recovery shape as createCounterSale/placeOrderForBasket:
    // two near-simultaneous submissions with the same idempotency key can
    // both pass the up-front check before either commits; the loser hits
    // the unique constraint at insert time. Recover by returning the
    // winner's receipt.
    if (isUniqueConstraintErrorOn(err, "idempotencyKey")) {
      const winner = await db.paymentReceipt.findUnique({
        where: { idempotencyKey: input.idempotencyKey },
        include: { order: { select: { orderNumber: true } } },
      });
      if (winner) {
        return {
          success: true,
          receiptId: winner.id,
          orderNumber: winner.order.orderNumber,
          outstandingAfterInPaise: winner.outstandingAfterInPaise,
          alreadyExisted: true,
        };
      }
    }

    console.error(
      "receivePayment: unexpected error",
      err instanceof Error ? err.message : String(err),
    );
    return {
      success: false,
      error: { type: "UNKNOWN", message: "Something went wrong recording this payment. Please try again." },
    };
  }
}
