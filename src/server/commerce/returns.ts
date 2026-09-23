import type { ReturnReason, ReturnRequestType } from "@prisma/client";
import { db } from "@/lib/db";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import { getItemReturnEligibility, getOrderReturnEligibility } from "@/lib/return-eligibility";
import { RETURN_WINDOW_DAYS } from "@/lib/return-lifecycle";
import { generateReturnNumber } from "@/lib/return-number";
import { notifyReturnEvent } from "@/server/whatsapp/return-notification-service";

const MAX_RETURN_NUMBER_ATTEMPTS = 5;

export type CreateReturnRequestItemInput = {
  orderItemId: string;
  quantity: number;
  reason: ReturnReason;
};

export type CreateReturnRequestError =
  | { type: "ORDER_NOT_FOUND"; message: string }
  | { type: "EMPTY_REQUEST"; message: string }
  | { type: "INVALID_QUANTITY"; message: string; orderItemId: string }
  | { type: "ITEM_NOT_IN_ORDER"; message: string; orderItemId: string }
  | { type: "ORDER_NOT_DELIVERED"; message: string }
  | { type: "RETURN_WINDOW_EXPIRED"; message: string }
  | { type: "INSUFFICIENT_QUANTITY"; message: string; orderItemId: string; returnableQuantity: number }
  | { type: "CONFLICT"; message: string };

export type CreateReturnRequestResult =
  | { success: true; returnRequestId: string; returnNumber: string }
  | { success: false; error: CreateReturnRequestError };

class ConcurrencyConflictError extends Error {}

/**
 * The one and only path that creates a ReturnRequest (RETURN or EXCHANGE
 * — see docs/PHASE_3_5_REPORT.md "Return + Exchange" for why one shared
 * function serves both). Part 1 builds ONLY this creation path — no
 * approve/reject/receive/complete mutation exists yet (Phase 3.5 Part 3);
 * every created request starts, and for now stays, REQUESTED.
 *
 * SECURITY: `customerId` must be a value the CALLER has already
 * authorized — this function performs no authorization of its own, only
 * ownership enforcement via the query itself. A future customer-portal
 * caller resolves it from `getCustomerSession()` (Phase 3.4); a future
 * admin walk-in caller (Phase 3.5 Part 4) would resolve it via
 * `getAdminSession()` plus an explicit customer lookup. Never accept this
 * value directly from an unauthenticated request body. The order lookup
 * itself is scoped to `{ orderNumber, customerId }` in one query — a
 * `customerId` that doesn't own `orderNumber` gets `ORDER_NOT_FOUND`,
 * structurally identical to the order not existing at all (exactly the
 * same IDOR-safe shape as `getOrderForAuthenticatedCustomer`, Phase 3.4
 * Part 2).
 *
 * All-or-nothing: every requested item is validated before any write —
 * one ineligible line fails the WHOLE request rather than silently
 * dropping it. Concurrency-safe: each item's quantity is claimed via a
 * guarded `updateMany` (`WHERE returnClaimedQuantity <= quantity -
 * requested`), the exact same pattern already proven for inventory
 * decrement (`resolveAndDecrementOrderLines`) — two concurrent requests
 * racing for the same last-remaining quantity can't both succeed.
 *
 * `override` (Phase 3.5 Part 5, Admin Override) — when supplied, bypasses
 * ONLY the time-based eligibility checks (order not yet delivered / 7-day
 * window expired), never the quantity-availability check, and persists
 * `overrideReason`/`overriddenAt`/`overriddenByAdminUserId` on the
 * created row. This parameter is honored unconditionally by this
 * function — it performs NO authorization of who may supply it. The only
 * caller that ever does is `createWalkInReturnRequestAction`
 * (admin-only, `getAdminSession()`-gated); the customer-portal's own
 * `createReturnRequestAction` never even has this field in its schema,
 * so a customer can structurally never trigger an override. See
 * docs/PHASE_3_5_REPORT.md Part 5 "Admin Override architecture".
 */
export async function createReturnRequest(params: {
  customerId: string;
  orderNumber: string;
  type: ReturnRequestType;
  note?: string;
  items: CreateReturnRequestItemInput[];
  override?: { reason: string; adminUserId: string };
}): Promise<CreateReturnRequestResult> {
  const { customerId, orderNumber, type, note, items, override } = params;

  if (items.length === 0) {
    return {
      success: false,
      error: { type: "EMPTY_REQUEST", message: "Select at least one item to return." },
    };
  }
  for (const item of items) {
    if (!Number.isInteger(item.quantity) || item.quantity <= 0) {
      return {
        success: false,
        error: {
          type: "INVALID_QUANTITY",
          message: "Quantity must be a positive whole number.",
          orderItemId: item.orderItemId,
        },
      };
    }
  }
  // Duplicate orderItemId entries in one request are merged by summing
  // quantity — defensive, mirroring resolveAndDecrementOrderLines's own
  // handling of duplicate variant lines — so a client bug can never
  // attempt to guard-claim the same row twice in one request.
  const quantityByOrderItemId = new Map<string, { quantity: number; reason: ReturnReason }>();
  for (const item of items) {
    const existing = quantityByOrderItemId.get(item.orderItemId);
    quantityByOrderItemId.set(item.orderItemId, {
      quantity: (existing?.quantity ?? 0) + item.quantity,
      reason: item.reason,
    });
  }

  const order = await db.order.findFirst({
    where: { orderNumber, customerId },
    include: { items: true },
  });
  if (!order) {
    return {
      success: false,
      error: { type: "ORDER_NOT_FOUND", message: "We couldn't find that order." },
    };
  }

  const orderEligibility = getOrderReturnEligibility({
    orderStatus: order.status,
    deliveredAt: order.deliveredAt,
    now: new Date(),
    bypassWindowCheck: Boolean(override),
  });
  if (!orderEligibility.eligible) {
    if (orderEligibility.error.type === "ORDER_NOT_DELIVERED") {
      return {
        success: false,
        error: {
          type: "ORDER_NOT_DELIVERED",
          message: "This order hasn't been delivered yet, so it isn't eligible for return.",
        },
      };
    }
    return {
      success: false,
      error: {
        type: "RETURN_WINDOW_EXPIRED",
        message: `The return window (${RETURN_WINDOW_DAYS} days after delivery) for this order has passed.`,
      },
    };
  }

  const orderItemById = new Map(order.items.map((item) => [item.id, item]));
  const now = new Date();

  for (const [orderItemId, { quantity }] of quantityByOrderItemId) {
    const orderItem = orderItemById.get(orderItemId);
    if (!orderItem) {
      return {
        success: false,
        error: {
          type: "ITEM_NOT_IN_ORDER",
          message: "One of the selected items doesn't belong to this order.",
          orderItemId,
        },
      };
    }

    const eligibility = getItemReturnEligibility({
      deliveredAt: order.deliveredAt,
      purchasedQuantity: orderItem.quantity,
      claimedQuantity: orderItem.returnClaimedQuantity,
      requestedQuantity: quantity,
      now,
      bypassWindowCheck: Boolean(override),
    });
    if (!eligibility.eligible) {
      // ORDER_NOT_DELIVERED/RETURN_WINDOW_EXPIRED were already ruled out
      // by the order-level check above (same order, same deliveredAt) —
      // only INSUFFICIENT_QUANTITY can reach here in practice, but this
      // stays exhaustive rather than assuming that.
      if (eligibility.error.type === "INSUFFICIENT_QUANTITY") {
        return {
          success: false,
          error: {
            type: "INSUFFICIENT_QUANTITY",
            message: "The requested quantity exceeds what's left to return for this item.",
            orderItemId,
            returnableQuantity: eligibility.error.returnableQuantity,
          },
        };
      }
      return {
        success: false,
        error:
          eligibility.error.type === "ORDER_NOT_DELIVERED"
            ? { type: "ORDER_NOT_DELIVERED", message: "This order hasn't been delivered yet." }
            : { type: "RETURN_WINDOW_EXPIRED", message: "The return window for this order has passed." },
      };
    }
  }

  try {
    const created = await db.$transaction(async (tx) => {
      for (const [orderItemId, { quantity }] of quantityByOrderItemId) {
        const orderItem = orderItemById.get(orderItemId)!;
        const claim = await tx.orderItem.updateMany({
          where: { id: orderItemId, returnClaimedQuantity: { lte: orderItem.quantity - quantity } },
          data: { returnClaimedQuantity: { increment: quantity } },
        });
        if (claim.count === 0) {
          // A concurrent request claimed the remaining quantity between
          // our upfront check and this transaction — fail closed rather
          // than over-return.
          throw new ConcurrencyConflictError();
        }
      }

      // Retried on a returnNumber collision only — the quantity claims
      // above already succeeded in this same transaction and don't need
      // redoing; see docs/PHASE_3_5_REPORT.md Part 2 "Return Request ID"
      // for why this mirrors createOrderWithUniqueNumber's retry shape
      // rather than sharing its exact helper (a single call site here
      // doesn't yet justify extracting a second generic one).
      for (let attempt = 0; attempt < MAX_RETURN_NUMBER_ATTEMPTS; attempt++) {
        const returnNumber = generateReturnNumber(new Date());
        try {
          return await tx.returnRequest.create({
            data: {
              returnNumber,
              orderId: order.id,
              customerId,
              type,
              note: note ?? null,
              ...(override
                ? {
                    overrideReason: override.reason,
                    overriddenAt: now,
                    overriddenByAdminUserId: override.adminUserId,
                  }
                : {}),
              items: {
                create: [...quantityByOrderItemId.entries()].map(([orderItemId, { quantity, reason }]) => ({
                  orderItemId,
                  quantity,
                  reason,
                })),
              },
            },
          });
        } catch (err) {
          if (isUniqueConstraintErrorOn(err, "returnNumber")) {
            continue; // astronomically unlikely collision — try a fresh number
          }
          throw err;
        }
      }
      throw new Error("Could not generate a unique return number.");
    });

    // Phase 3.6 Part 3 section 3 — fires only past this point, never
    // inside the transaction above, and only on the genuine creation
    // path: every validation failure above returns before ever reaching
    // `db.$transaction`, and a concurrency loser throws
    // ConcurrencyConflictError and is caught below without ever reaching
    // here. `created` is a real, newly-persisted row exactly once per
    // call that gets this far — see docs/PHASE_3_6_REPORT.md Part 3
    // "Duplicate prevention".
    try {
      await notifyReturnEvent(
        {
          returnNumber: created.returnNumber,
          returnType: type,
          rejectionReason: null,
          orderNumber: order.orderNumber,
          accessToken: order.accessToken,
          fulfillmentType: order.fulfillmentType,
          customerName: order.customerName,
          customerMobile: order.customerMobile,
          customerWhatsapp: order.customerWhatsapp,
        },
        "RETURN_REQUESTED",
      );
    } catch (err) {
      console.error(
        "createReturnRequest: best-effort return-requested notification failed",
        err instanceof Error ? err.message : String(err),
      );
    }

    return { success: true, returnRequestId: created.id, returnNumber: created.returnNumber };
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      return {
        success: false,
        error: {
          type: "CONFLICT",
          message: "Someone already returned some of this item. Please refresh and try again.",
        },
      };
    }
    throw err;
  }
}
