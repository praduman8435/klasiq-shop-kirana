import { db } from "@/lib/db";
import { isValidReturnStatusTransition } from "@/lib/return-lifecycle";
import { applyInventoryDelta, InsufficientStockError } from "@/server/commerce/inventory";
import { RETURN_STATUS_TRANSITION_EVENT } from "@/server/whatsapp/return-notification-events";
import { notifyReturnEvent } from "@/server/whatsapp/return-notification-service";

export type ReceiveReturnRequestError =
  | { type: "NOT_FOUND"; message: string }
  | { type: "INVALID_TRANSITION"; message: string }
  | { type: "REPLACEMENT_REQUIRED"; message: string; returnRequestItemId: string }
  | { type: "INVALID_REPLACEMENT_VARIANT"; message: string; returnRequestItemId: string }
  | { type: "INSUFFICIENT_REPLACEMENT_STOCK"; message: string; returnRequestItemId: string }
  | { type: "CONFLICT"; message: string };

export type ReceiveReturnRequestResult =
  | { success: true }
  | { success: false; error: ReceiveReturnRequestError };

class ConcurrencyConflictError extends Error {}
class InsufficientReplacementStockError extends Error {
  constructor(public returnRequestItemId: string) {
    super();
  }
}

/**
 * The ONE place inventory reconciliation happens for Returns/Exchanges —
 * see docs/PHASE_3_5_REPORT.md Part 4 "Inventory strategy" for why this is
 * tied to RECEIVED (the earliest point a physical item is confirmably back
 * in Klasiq's possession) and not to APPROVED (mere administrative intent)
 * or REQUESTED. Reuses the exact guarded-delta primitive every other stock
 * mutation in this codebase uses (`applyInventoryDelta`,
 * src/server/commerce/inventory.ts) — no parallel inventory system.
 *
 * For a RETURN: restores the original item's stock only.
 * For an EXCHANGE: restores the original item's stock AND deducts the
 * admin-selected replacement variant's stock, in the SAME transaction as
 * the restore and the status write — see "Inventory atomicity" in
 * docs/PHASE_3_5_REPORT.md Part 4. If the replacement doesn't have enough
 * stock, the ENTIRE transaction rolls back: the original item's stock is
 * NOT restored either, and the request stays exactly where it was
 * (APPROVED) — never a half-applied exchange.
 *
 * Immediately (same transaction) also marks the request COMPLETED — see
 * that same report section for why RECEIVED and COMPLETED are stamped
 * together as one indivisible admin action in this phase, rather than two
 * separately-clickable steps with no inventory meaning attached to the
 * gap between them.
 *
 * Concurrency-safe exactly like `updateReturnRequestStatus`
 * (src/server/commerce/admin-returns.ts): the status write is a guarded
 * `updateMany` keyed to the status this call actually read, so two admins
 * racing to receive the same request can't both reconcile inventory —
 * the loser gets CONFLICT with nothing written.
 *
 * SECURITY: `adminUserId` must already be authorized by the caller (an
 * Admin Server Action resolving `getAdminSession()`) — this function
 * performs no authorization itself, the same caller-resolves-authorization
 * design as every other domain function in this feature.
 */
export async function receiveReturnRequest(params: {
  returnNumber: string;
  adminUserId: string;
  /** returnRequestItemId -> the ProductVariant chosen to replace it. Only
   * consulted (and required) when the request's type is EXCHANGE. */
  replacements?: Record<string, string>;
}): Promise<ReceiveReturnRequestResult> {
  const { returnNumber, adminUserId, replacements } = params;

  const request = await db.returnRequest.findUnique({
    where: { returnNumber },
    include: { items: { include: { orderItem: true } }, order: true },
  });
  if (!request) {
    return { success: false, error: { type: "NOT_FOUND", message: "Return request not found." } };
  }

  // Also the "duplicate receive prevented" guard: RECEIVED/COMPLETED have
  // no outgoing transition to RECEIVED in return-lifecycle.ts's table, so
  // a second receive attempt on an already-processed request is rejected
  // here, before ever touching inventory a second time.
  if (!isValidReturnStatusTransition({ from: request.status, to: "RECEIVED" })) {
    return {
      success: false,
      error: {
        type: "INVALID_TRANSITION",
        message: `Cannot receive a request that is currently ${request.status}.`,
      },
    };
  }

  // Upfront, side-effect-free validation — mirrors createReturnRequest's
  // own "validate everything before any write" shape (Part 1). Only
  // existence/active-ness is checked here; stock sufficiency can only be
  // safely checked atomically inside the transaction below. Also captures
  // each replacement's CURRENT price — snapshotted below at receive time,
  // for the Price Difference Foundation (Phase 3.5 Part 5); see
  // `ReturnRequestItem.replacementUnitPriceInPaiseSnapshot`'s own doc
  // comment for why this must never be re-read from the live variant
  // later (its price can change after this exchange is history).
  const replacementPriceByItemId = new Map<string, number>();
  if (request.type === "EXCHANGE") {
    for (const item of request.items) {
      const variantId = replacements?.[item.id];
      if (!variantId) {
        return {
          success: false,
          error: {
            type: "REPLACEMENT_REQUIRED",
            message: "Choose a replacement item for every requested line before receiving.",
            returnRequestItemId: item.id,
          },
        };
      }
      const variant = await db.productVariant.findUnique({ where: { id: variantId } });
      if (!variant || !variant.isActive) {
        return {
          success: false,
          error: {
            type: "INVALID_REPLACEMENT_VARIANT",
            message: "The selected replacement item no longer exists or is inactive.",
            returnRequestItemId: item.id,
          },
        };
      }
      replacementPriceByItemId.set(item.id, variant.priceInPaise);
    }
  }

  try {
    await db.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.returnRequest.updateMany({
        where: { id: request.id, status: request.status },
        data: { status: "RECEIVED", receivedAt: now, receivedByAdminUserId: adminUserId },
      });
      if (claimed.count === 0) throw new ConcurrencyConflictError();

      for (const item of request.items) {
        // Restores the ORIGINAL returned item's stock — always, for both
        // RETURN and EXCHANGE (section 8: "Receiving the old item
        // restores its inventory").
        await applyInventoryDelta(tx, {
          productVariantId: item.orderItem.productVariantId,
          delta: item.quantity,
          reason: "RETURN_RESTORE",
          adminUserId,
          returnRequestId: request.id,
        });

        if (request.type === "EXCHANGE") {
          const replacementVariantId = replacements![item.id]!;
          try {
            await applyInventoryDelta(tx, {
              productVariantId: replacementVariantId,
              delta: -item.quantity,
              reason: "EXCHANGE_ISSUE",
              adminUserId,
              returnRequestId: request.id,
            });
          } catch (err) {
            if (err instanceof InsufficientStockError) {
              throw new InsufficientReplacementStockError(item.id);
            }
            throw err;
          }

          await tx.returnRequestItem.update({
            where: { id: item.id },
            data: {
              replacementVariantId,
              replacementUnitPriceInPaiseSnapshot: replacementPriceByItemId.get(item.id)!,
            },
          });
        }
      }

      // Same transaction, same admin action — see this function's own
      // doc comment for why RECEIVED and COMPLETED are stamped together.
      await tx.returnRequest.update({
        where: { id: request.id },
        data: { status: "COMPLETED", completedAt: now, completedByAdminUserId: adminUserId },
      });
    });

    // Phase 3.6 Part 3 section 3/8 — fires only past this point, after
    // the transaction above (guarded RECEIVED transition + inventory
    // reconciliation + COMPLETED write) has already fully committed. Two
    // notifications, not one: `receivedAt` and `completedAt` are two
    // distinct, genuinely-persisted facts on this row (see
    // return-notification-events.ts's own doc comment for why this
    // differs from folding "Exchange Ready" away) — "we have your item"
    // and "here's what happens next" are meaningfully different
    // information to a customer even though this admin flow stamps both
    // in one indivisible action. Each is independently try/caught so a
    // hypothetical failure notifying ITEM_RECEIVED can never prevent the
    // COMPLETED notification from being attempted. Reached at most once
    // per genuine receive — `isValidReturnStatusTransition`'s check above
    // and the transaction's own concurrency guard mean a second attempt
    // on an already-RECEIVED/COMPLETED request never reaches this line.
    const baseNotification = {
      returnNumber: request.returnNumber,
      returnType: request.type,
      orderNumber: request.order.orderNumber,
      accessToken: request.order.accessToken,
      fulfillmentType: request.order.fulfillmentType,
      customerName: request.order.customerName,
      customerMobile: request.order.customerMobile,
      customerWhatsapp: request.order.customerWhatsapp,
    };
    try {
      await notifyReturnEvent({ ...baseNotification, rejectionReason: null }, "ITEM_RECEIVED");
    } catch (err) {
      console.error(
        "receiveReturnRequest: best-effort item-received notification failed",
        err instanceof Error ? err.message : String(err),
      );
    }
    const completedEvent = RETURN_STATUS_TRANSITION_EVENT.COMPLETED?.[request.type];
    if (completedEvent) {
      try {
        await notifyReturnEvent({ ...baseNotification, rejectionReason: null }, completedEvent);
      } catch (err) {
        console.error(
          "receiveReturnRequest: best-effort completion notification failed",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return { success: true };
  } catch (err) {
    if (err instanceof ConcurrencyConflictError) {
      return {
        success: false,
        error: {
          type: "CONFLICT",
          message: "This request's status changed since you loaded the page. Please refresh.",
        },
      };
    }
    if (err instanceof InsufficientReplacementStockError) {
      return {
        success: false,
        error: {
          type: "INSUFFICIENT_REPLACEMENT_STOCK",
          message:
            "The chosen replacement item doesn't have enough stock. Nothing was changed — choose a different item or restock first.",
          returnRequestItemId: err.returnRequestItemId,
        },
      };
    }
    throw err;
  }
}
