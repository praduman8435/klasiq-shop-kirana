import { db } from "@/lib/db";
import { calculateDeliveryFee, FULFILLMENT_CONFIG } from "@/lib/fulfillment-config";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";
import type { CheckoutInput } from "@/lib/validation/checkout";
import {
  createOrderWithUniqueNumber,
  findOrderByIdempotencyKeyRaw,
  resolveAndDecrementOrderLines,
  type OrderLineIssue,
} from "@/server/commerce/order-core";
import { findOrCreateCustomerByPrimaryPhone, updateCustomerContactInfo } from "@/server/commerce/customer";
import { calculateRouteDistanceMeters } from "@/server/geoapify";
import { notifyOrderEvent } from "@/server/whatsapp/notification-service";

const MAX_CUSTOMER_RACE_ATTEMPTS = 3;

export type PlaceOrderError =
  | { type: "EMPTY_BASKET"; message: string }
  | { type: "STOCK_ISSUE"; message: string; issues: OrderLineIssue[] }
  | { type: "FULFILLMENT_DISABLED"; message: string }
  | { type: "CUSTOMER_ERROR"; message: string }
  /** Geoapify couldn't verify the delivery route (timeout, no route,
   * provider error, not configured) — see docs/PHASE_3_3_REPORT.md Part 2
   * "External API failure handling". Never guesses a distance; the
   * customer is asked to retry or choose Store Pickup instead. */
  | { type: "DELIVERY_UNAVAILABLE"; message: string }
  /** The delivery fee last shown to the customer (their preview) no longer
   * matches the server's fresh, authoritative recalculation — e.g. the
   * basket's subtotal crossed the free-delivery threshold between preview
   * and submission. Never silently charges the new amount — see
   * docs/PHASE_3_3_REPORT.md Part 2 "Delivery quote consistency". */
  | { type: "DELIVERY_QUOTE_STALE"; message: string }
  | { type: "UNKNOWN"; message: string };

export type PlaceOrderResult =
  | { success: true; orderNumber: string; accessToken: string; alreadyExisted: boolean }
  | { success: false; error: PlaceOrderError };

class PlaceOrderDomainError extends Error {
  constructor(public readonly domainError: PlaceOrderError) {
    super(domainError.message);
  }
}

/**
 * Loads an order by idempotency key and returns it in the same shape as a
 * fresh success — used both for the up-front "have we already done this"
 * check and for recovering when two near-simultaneous submissions race past
 * that check (see docs/PHASE_2_REPORT.md "Idempotency strategy").
 */
async function findOrderByIdempotencyKey(
  idempotencyKey: string,
): Promise<PlaceOrderResult | null> {
  const existing = await findOrderByIdempotencyKeyRaw(idempotencyKey);
  if (!existing) return null;
  return {
    success: true,
    orderNumber: existing.orderNumber,
    accessToken: existing.accessToken,
    alreadyExisted: true,
  };
}

/**
 * The one and only path that creates an Order from a basket (online
 * checkout). Framework-agnostic on purpose (no cookies()/next/headers
 * import) so it's directly callable from integration tests with a plain
 * basket id — see src/server/actions/checkout.ts for the cookie-reading
 * wrapper used by the actual /checkout page. Counter sales create orders
 * through the separate src/server/commerce/counter-sale.ts, which shares
 * the same inventory-deduction/order-number/idempotency primitives
 * (src/server/commerce/order-core.ts) rather than re-implementing them —
 * see docs/PHASE_3_2_REPORT.md "Architecture".
 *
 * Everything money/stock-related is recalculated from the database inside
 * a single transaction here. `input` must already be validated
 * (checkoutInputSchema) by the caller — this function trusts its shape but
 * still never trusts prices/stock from anywhere but the database.
 *
 * Since Phase 3.3, this also resolves/creates the Customer for this order
 * (Phase 3.1's findOrCreateCustomerByPrimaryPhone, unchanged) — see
 * docs/PHASE_3_3_REPORT.md "Transaction boundary decision" for exactly why
 * this happens INSIDE the same transaction as the stock decrement and
 * order creation (so a checkout that fails for any reason — out of stock,
 * an order-number collision — never leaves behind a customer with no
 * order), and why a customer-phone race is handled by retrying the whole
 * transaction rather than recovering in place (the same "retry the whole
 * unit of work" shape Phase 2 already established for order-number
 * collisions, applied to a second race in this transaction).
 */
export async function placeOrderForBasket(
  basketId: string | null,
  input: CheckoutInput,
): Promise<PlaceOrderResult> {
  if (!basketId) {
    return { success: false, error: { type: "EMPTY_BASKET", message: "Your bag is empty." } };
  }
  // Reassigned to a `const` so its narrowed (non-null) type is retained
  // inside the nested attemptTransaction() closure below — TS doesn't
  // preserve narrowing for a reassignable parameter across a closure
  // boundary even though it's never actually reassigned here.
  const confirmedBasketId = basketId;

  const existingByKey = await findOrderByIdempotencyKey(input.idempotencyKey);
  if (existingByKey) return existingByKey;

  const basket = await db.basket.findUnique({ where: { id: basketId } });
  if (!basket) {
    return { success: false, error: { type: "EMPTY_BASKET", message: "Your bag is empty." } };
  }

  // This basket already produced an order (e.g. a stale checkout tab
  // resubmitted after a successful purchase, with a different idempotency
  // key than the original submission). Return the existing order instead
  // of creating a second one from the same items.
  if (basket.status === "CONVERTED") {
    if (basket.convertedOrderId) {
      const existingOrder = await db.order.findUnique({
        where: { id: basket.convertedOrderId },
      });
      if (existingOrder) {
        return {
          success: true,
          orderNumber: existingOrder.orderNumber,
          accessToken: existingOrder.accessToken,
          alreadyExisted: true,
        };
      }
    }
    return { success: false, error: { type: "EMPTY_BASKET", message: "Your bag is empty." } };
  }

  if (input.fulfillmentType === "STORE_PICKUP" && !FULFILLMENT_CONFIG.pickupEnabled) {
    return {
      success: false,
      error: {
        type: "FULFILLMENT_DISABLED",
        message: "Store Pickup isn't available right now — please choose Local Delivery.",
      },
    };
  }
  if (input.fulfillmentType === "LOCAL_DELIVERY" && !FULFILLMENT_CONFIG.deliveryEnabled) {
    return {
      success: false,
      error: {
        type: "FULFILLMENT_DISABLED",
        message: "Local Delivery isn't available right now — please choose Store Pickup.",
      },
    };
  }

  // Route distance is resolved ONCE, here, before the transaction opens —
  // never inside it. This is a real network call to Geoapify (up to
  // several seconds under load, and occasionally a timeout); holding a
  // Postgres transaction open for that long would extend the guarded
  // stock-decrement's lock window for no reason and risk exhausting the
  // connection pool under concurrent checkouts. See
  // docs/PHASE_3_3_REPORT.md Part 2 "Concurrency / idempotency" for the
  // full reasoning. The customer-phone-race retry loop below reuses this
  // SAME resolved distance on every attempt — it's purely geographic and
  // cannot change because of that race, so re-querying Geoapify on each
  // retry would be wasted, billable calls for no benefit.
  let routeDistanceMeters: number | null = null;
  if (input.fulfillmentType === "LOCAL_DELIVERY") {
    if (input.destinationLat === undefined || input.destinationLon === undefined) {
      return {
        success: false,
        error: { type: "CUSTOMER_ERROR", message: "Please select your delivery location." },
      };
    }
    const routeResult = await calculateRouteDistanceMeters({
      lat: input.destinationLat,
      lon: input.destinationLon,
    });
    if (!routeResult.success) {
      return {
        success: false,
        error: {
          type: "DELIVERY_UNAVAILABLE",
          message:
            "We couldn't verify delivery distance right now. Please try again or choose Store Pickup.",
        },
      };
    }
    routeDistanceMeters = routeResult.distanceMeters;
  }

  async function attemptTransaction() {
    return db.$transaction(async (tx) => {
      const basketItems = await tx.basketItem.findMany({ where: { basketId: confirmedBasketId } });

      if (basketItems.length === 0) {
        throw new PlaceOrderDomainError({ type: "EMPTY_BASKET", message: "Your bag is empty." });
      }

      const resolved = await resolveAndDecrementOrderLines(
        tx,
        basketItems.map((item) => ({
          productVariantId: item.productVariantId,
          quantity: item.quantity,
        })),
      );
      if (!resolved.success) {
        throw new PlaceOrderDomainError({
          type: "STOCK_ISSUE",
          message: "Some items in your bag are no longer available in the requested quantity.",
          issues: resolved.issues,
        });
      }

      const { lines, subtotalInPaise } = resolved;
      const deliveryFeeInPaise =
        input.fulfillmentType === "STORE_PICKUP"
          ? calculateDeliveryFee({ fulfillmentType: "STORE_PICKUP" })
          : calculateDeliveryFee({
              fulfillmentType: "LOCAL_DELIVERY",
              subtotalInPaise,
              // Non-null: resolved above, before this transaction opened,
              // for every LOCAL_DELIVERY attempt — see the comment there.
              routeDistanceMeters: routeDistanceMeters!,
              deliveryFeeInPaise: FULFILLMENT_CONFIG.deliveryFeeInPaise,
              freeDeliveryThresholdInPaise: FULFILLMENT_CONFIG.freeDeliveryThresholdInPaise,
              freeDeliveryRadiusMeters: FULFILLMENT_CONFIG.freeDeliveryRadiusMeters,
            });

      // The authoritative fee, freshly computed from the authoritative
      // subtotal (just resolved above) and the authoritative route distance
      // (resolved before this transaction), must match what the customer's
      // own last preview showed. A mismatch means something changed
      // between preview and submission (most commonly: the basket's
      // subtotal moved across the free-delivery threshold) — never
      // silently charge the new amount; see docs/PHASE_3_3_REPORT.md Part 2
      // "Delivery quote consistency".
      if (
        input.fulfillmentType === "LOCAL_DELIVERY" &&
        input.expectedDeliveryFeeInPaise !== undefined &&
        input.expectedDeliveryFeeInPaise !== deliveryFeeInPaise
      ) {
        throw new PlaceOrderDomainError({
          type: "DELIVERY_QUOTE_STALE",
          message: "Your delivery cost has changed. Please review your order and try again.",
        });
      }

      const totalInPaise = subtotalInPaise + deliveryFeeInPaise;

      // Best-effort "primary school" for this order, for display/filtering
      // convenience only — a basket mixing two schools' exclusive items is
      // an edge case nothing in the UI encourages; picking the first is a
      // documented simplification, not a correctness requirement.
      const schoolId = lines.find((line) => line.productSchoolId)?.productSchoolId ?? null;

      // Resolved only after stock is confirmed available — a checkout that
      // fails the stock check above never reaches this line, so it never
      // creates a customer for an order that didn't happen. Passing `tx`
      // makes this participate in the SAME transaction as the order it's
      // for; see the doc comment on findOrCreateCustomerByPrimaryPhone in
      // customer.ts and docs/PHASE_3_3_REPORT.md for why a customer-phone
      // race is handled by retrying the whole transaction (below) rather
      // than recovering in place.
      const customerResult = await findOrCreateCustomerByPrimaryPhone(
        { rawPhone: input.customerMobile, displayName: input.customerName },
        tx,
      );
      if (!customerResult.success) {
        throw new PlaceOrderDomainError({
          type: "CUSTOMER_ERROR",
          message: customerResult.error.message,
        });
      }
      const customerId = customerResult.customer.id;

      // Point-in-time snapshot of the WhatsApp number given AT THIS
      // CHECKOUT — same pattern as customerName/customerMobile above,
      // deliberately independent of Customer.whatsappPhone (which reflects
      // the customer's current, mutable profile and can drift after this
      // order exists). Validation (checkoutInputSchema) already guarantees
      // whatsappPhone is non-empty whenever whatsappSameAsPrimary is false,
      // so this is never an accidental empty string.
      const customerWhatsapp = input.whatsappSameAsPrimary
        ? input.customerMobile
        : (input.whatsappPhone ?? input.customerMobile);

      const createdOrder = await createOrderWithUniqueNumber(tx, (orderNumber, accessToken) => ({
        orderNumber,
        accessToken,
        idempotencyKey: input.idempotencyKey,
        source: "ONLINE",
        schoolId,
        customerId,
        customerName: input.customerName,
        customerMobile: input.customerMobile,
        customerWhatsapp,
        fulfillmentType: input.fulfillmentType,
        deliveryAddressLine:
          input.fulfillmentType === "LOCAL_DELIVERY" ? (input.deliveryAddressLine ?? null) : null,
        deliveryArea: input.fulfillmentType === "LOCAL_DELIVERY" ? (input.deliveryArea ?? null) : null,
        deliveryLandmark:
          input.fulfillmentType === "LOCAL_DELIVERY" ? (input.deliveryLandmark ?? null) : null,
        deliveryLatitude: input.fulfillmentType === "LOCAL_DELIVERY" ? (input.destinationLat ?? null) : null,
        deliveryLongitude: input.fulfillmentType === "LOCAL_DELIVERY" ? (input.destinationLon ?? null) : null,
        deliveryFormattedAddress:
          input.fulfillmentType === "LOCAL_DELIVERY" ? (input.destinationFormattedAddress ?? null) : null,
        deliveryRouteDistanceMeters: input.fulfillmentType === "LOCAL_DELIVERY" ? routeDistanceMeters : null,
        paymentMethod: "CASH_ON_DELIVERY",
        paymentStatus: "UNPAID",
        status: "PENDING",
        subtotalInPaise,
        deliveryFeeInPaise,
        totalInPaise,
        // Phase 3.6.5 Part 3 — Online Checkout never negotiates a partial
        // payment (Counter-only — see docs/PHASE_3_6_5_REPORT.md Part 3
        // "Online checkout scope"). `paymentStatus` above (UNPAID, moving
        // to PAID on COD collection) remains the sole source of truth for
        // whether cash has actually changed hands online; these two
        // fields are simply "fully reconciled against this order's own
        // total," unconditionally, and never read for that purpose.
        amountReceivedInPaise: totalInPaise,
        outstandingInPaise: 0,
        items: {
          create: lines.map((line) => ({
            productId: line.productId,
            productVariantId: line.productVariantId,
            productName: line.productName,
            size: line.size,
            skuSnapshot: line.skuSnapshot,
            unitPriceInPaise: line.unitPriceInPaise,
            quantity: line.quantity,
            lineTotalInPaise: line.lineTotalInPaise,
            // Online Checkout never negotiates a discount (Phase 3.6.5
            // Part 2 is Counter-only — see docs/PHASE_3_6_5_REPORT.md
            // Part 2 "Online checkout scope") — the effective total is
            // always identical to the original line total here.
            effectiveLineTotalInPaise: line.lineTotalInPaise,
          })),
        },
      }));

      if (!createdOrder) {
        throw new PlaceOrderDomainError({
          type: "UNKNOWN",
          message: "Could not generate a unique order number. Please try again.",
        });
      }

      // Same transaction as the order that caused it — a checkout that
      // fails anywhere above (stock, customer resolution, order-number
      // exhaustion) never reaches this line, so it never updates
      // lastOrderAt. See docs/PHASE_3_3_REPORT.md "lastOrderAt semantics".
      await tx.customer.update({
        where: { id: customerId },
        data: { lastOrderAt: new Date() },
      });

      await tx.basket.update({
        where: { id: confirmedBasketId },
        data: { status: "CONVERTED", convertedOrderId: createdOrder.id },
      });

      return createdOrder;
    });
  }

  try {
    let order: Awaited<ReturnType<typeof attemptTransaction>> | undefined;
    for (let attempt = 0; attempt < MAX_CUSTOMER_RACE_ATTEMPTS; attempt++) {
      try {
        order = await attemptTransaction();
        break;
      } catch (err) {
        const isLastAttempt = attempt === MAX_CUSTOMER_RACE_ATTEMPTS - 1;
        // Two near-simultaneous checkouts for the same never-before-seen
        // phone can both pass findOrCreateCustomerByPrimaryPhone's existence
        // check before either commits; the loser's create hits the unique
        // constraint and the whole transaction (including its otherwise-
        // valid stock decrement) rolls back safely. Retrying from scratch is
        // correct and cheap: the winner's customer now exists, so this
        // attempt's check finds it instead of racing to create it again.
        if (!isLastAttempt && isUniqueConstraintErrorOn(err, "primaryPhoneNormalized")) {
          continue;
        }
        throw err;
      }
    }
    if (!order) {
      // Exhausted retries — would require repeated, sustained collisions on
      // the same phone, not realistically expected; fails safely rather
      // than looping forever.
      return {
        success: false,
        error: { type: "UNKNOWN", message: "Something went wrong placing your order. Please try again." },
      };
    }

    // Best-effort, outside the order transaction on purpose: a WhatsApp
    // number is a contact-info convenience, not part of what makes this
    // order valid. The order has already committed successfully above — a
    // failure here must never turn a successful checkout into an error
    // response, so it's caught and logged only, never thrown. See
    // docs/PHASE_3_3_REPORT.md Part 2 "WhatsApp number handling".
    //
    // Both branches keep Customer.whatsappPhone (the customer's ongoing
    // profile) in sync with what was actually stated at this checkout —
    // "same as primary" is re-applied every time (Phase 3.3 Part 3: a
    // customer who always checks this box should never see their profile
    // drift from a much earlier, differently-typed number), not just the
    // "different number" branch.
    const whatsappToSync = input.whatsappSameAsPrimary ? input.customerMobile : input.whatsappPhone;
    if (whatsappToSync && order.customerId) {
      try {
        await updateCustomerContactInfo({
          id: order.customerId,
          whatsappPhone: whatsappToSync,
        });
      } catch (err) {
        console.error(
          "placeOrderForBasket: best-effort WhatsApp update failed",
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    // "Order Placed" (Phase 3.6 Part 2 section 4) — attempted only here,
    // after the transaction above has already committed successfully
    // (section 8: never notify for a transaction that could still roll
    // back), and only on this genuinely-fresh-order code path — every
    // OTHER return in this function is an early "already exists" case
    // (idempotency-key match, a CONVERTED basket, or the race-recovery
    // branch below), so this line is reached at most once per real order,
    // the same "smallest robust solution" duplicate-prevention this phase
    // reuses for every notification (see docs/PHASE_3_6_REPORT.md Part 2
    // "Duplicate prevention"). `notifyOrderEvent` itself never throws —
    // it catches and logs internally — but this call is ALSO wrapped
    // here, mirroring the exact same defense-in-depth already used for
    // the WhatsApp-sync best-effort call just above: a checkout must
    // never fail because of a messaging problem, even a hypothetical
    // future bug in the service's own "never throws" guarantee.
    try {
      const school = order.schoolId ? await db.school.findUnique({ where: { id: order.schoolId }, select: { name: true } }) : null;
      await notifyOrderEvent(
        {
          orderNumber: order.orderNumber,
          accessToken: order.accessToken,
          source: order.source,
          fulfillmentType: order.fulfillmentType,
          customerName: order.customerName,
          customerMobile: order.customerMobile,
          customerWhatsapp: order.customerWhatsapp,
          schoolName: school?.name ?? null,
        },
        "ORDER_PLACED",
      );
    } catch (err) {
      console.error(
        "placeOrderForBasket: best-effort order-placed notification failed",
        err instanceof Error ? err.message : String(err),
      );
    }

    return {
      success: true,
      orderNumber: order.orderNumber,
      accessToken: order.accessToken,
      alreadyExisted: false,
    };
  } catch (err) {
    if (err instanceof PlaceOrderDomainError) {
      return { success: false, error: err.domainError };
    }

    // Two near-simultaneous submissions with the same idempotency key can
    // both pass the up-front check before either commits; the loser hits
    // this unique constraint at insert time. Recover by returning the
    // winner's order rather than surfacing an error for what the customer
    // correctly sees as "I placed this order."
    if (isUniqueConstraintErrorOn(err, "idempotencyKey")) {
      const winner = await findOrderByIdempotencyKey(input.idempotencyKey);
      if (winner) return winner;
    }

    // Deliberately minimal: never log customer name/mobile/address, and
    // never forward err/stack to the caller.
    console.error(
      "placeOrderForBasket: unexpected error",
      err instanceof Error ? err.message : String(err),
    );
    return {
      success: false,
      error: { type: "UNKNOWN", message: "Something went wrong placing your order. Please try again." },
    };
  }
}
