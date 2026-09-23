import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { deriveStockStatus, isOrderable } from "@/lib/stock";
import { generateOrderNumber } from "@/lib/order-number";
import { generateAccessToken } from "@/lib/access-token";
import { isUniqueConstraintErrorOn } from "@/lib/prisma-errors";

const MAX_ORDER_NUMBER_ATTEMPTS = 5;

export type OrderLineIssue = {
  productName: string;
  size: string;
  requestedQuantity: number;
  availableQuantity: number;
};

export type ResolvedOrderLine = {
  productVariantId: string;
  productId: string;
  productName: string;
  size: string;
  skuSnapshot: string;
  unitPriceInPaise: number;
  quantity: number;
  lineTotalInPaise: number;
};

export type ResolveOrderLinesResult =
  | { success: true; lines: ResolvedOrderLine[]; subtotalInPaise: number }
  | { success: false; issues: OrderLineIssue[] };

type TransactionClient = Prisma.TransactionClient;

/**
 * THE inventory-deduction + product-lookup + pricing primitive shared by
 * every order-creating flow — online checkout (place-order.ts) and counter
 * sales (counter-sale.ts). Extracted from Phase 2's placeOrderForBasket
 * (see docs/PHASE_2_REPORT.md "Inventory transaction strategy" for the full
 * concurrency reasoning behind the guarded updateMany below) so a second
 * order-creating flow never has to re-implement it. Never copy this loop a
 * second time — add a new caller here instead. See
 * docs/PHASE_3_2_REPORT.md "Architecture".
 *
 * Given raw `{productVariantId, quantity}` lines (duplicate variant ids are
 * merged by summing quantity — defensive; a UI bug should never be able to
 * guard-decrement the same row twice in one order), this:
 *
 *   1. Reads each variant + its product fresh, inside the caller's
 *      transaction (`tx`) — never trusts a caller-supplied price/name/stock.
 *   2. Reports every unavailable line at once, before touching anything —
 *      a complete error message, not the correctness mechanism.
 *   3. Guard-decrements stock per line with a conditional `updateMany`
 *      (`WHERE stockQuantity >= quantity`) — this is what actually prevents
 *      overselling under concurrency; Postgres serializes racing updates to
 *      the same row and re-evaluates the guard against whatever's actually
 *      committed, so two concurrent callers (online + counter, or two
 *      counters) can never both succeed against insufficient stock.
 *   4. Recomputes `stockStatus` where it crossed a threshold.
 *   5. Returns line snapshots (name/size/sku/price at this moment) ready
 *      for `Order.items.create`, plus their subtotal — so pricing is
 *      computed in exactly one place too.
 */
export async function resolveAndDecrementOrderLines(
  tx: TransactionClient,
  rawLines: { productVariantId: string; quantity: number }[],
): Promise<ResolveOrderLinesResult> {
  const quantityByVariantId = new Map<string, number>();
  for (const line of rawLines) {
    quantityByVariantId.set(
      line.productVariantId,
      (quantityByVariantId.get(line.productVariantId) ?? 0) + line.quantity,
    );
  }

  const variants = await tx.productVariant.findMany({
    where: { id: { in: [...quantityByVariantId.keys()] } },
    include: { product: true },
  });
  const variantById = new Map(variants.map((variant) => [variant.id, variant]));

  const upfrontIssues: OrderLineIssue[] = [];
  for (const [variantId, quantity] of quantityByVariantId) {
    const variant = variantById.get(variantId);
    // A variant is unavailable if: it no longer exists (deleted), it or its
    // product has been deactivated since the caller last saw it (a real gap
    // found in Phase 3.2 Part 3's production-hardening review — neither
    // flow previously re-checked isActive at order-creation time, only at
    // search/listing time), it's marked OUT_OF_STOCK, or there simply isn't
    // enough quantity. All four collapse into the same "unavailable" issue
    // so the caller doesn't need to distinguish them.
    const unavailable =
      !variant ||
      !variant.isActive ||
      !variant.product.isActive ||
      !isOrderable(variant.stockStatus) ||
      variant.stockQuantity < quantity;
    if (unavailable) {
      upfrontIssues.push({
        productName: variant?.product.name ?? "Unknown item",
        size: variant?.size ?? "-",
        requestedQuantity: quantity,
        availableQuantity: Math.max(0, variant?.stockQuantity ?? 0),
      });
    }
  }
  if (upfrontIssues.length > 0) {
    return { success: false, issues: upfrontIssues };
  }

  const resolvedLines: ResolvedOrderLine[] = [];
  for (const [variantId, quantity] of quantityByVariantId) {
    const variant = variantById.get(variantId)!;

    const decrement = await tx.productVariant.updateMany({
      where: { id: variantId, stockQuantity: { gte: quantity } },
      data: { stockQuantity: { decrement: quantity } },
    });

    if (decrement.count === 0) {
      const current = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
      return {
        success: false,
        issues: [
          {
            productName: variant.product.name,
            size: variant.size,
            requestedQuantity: quantity,
            availableQuantity: Math.max(0, current.stockQuantity),
          },
        ],
      };
    }

    const current = await tx.productVariant.findUniqueOrThrow({ where: { id: variantId } });
    const newStatus = deriveStockStatus(current.stockQuantity, current.lowStockThreshold);
    if (newStatus !== current.stockStatus) {
      await tx.productVariant.update({ where: { id: variantId }, data: { stockStatus: newStatus } });
    }

    resolvedLines.push({
      productVariantId: variantId,
      productId: variant.productId,
      productName: variant.product.name,
      size: variant.size,
      skuSnapshot: variant.sku,
      unitPriceInPaise: variant.priceInPaise,
      quantity,
      lineTotalInPaise: variant.priceInPaise * quantity,
    });
  }

  const subtotalInPaise = resolvedLines.reduce((sum, line) => sum + line.lineTotalInPaise, 0);
  return { success: true, lines: resolvedLines, subtotalInPaise };
}

/**
 * Creates an Order with a fresh, DB-unique order number, retrying (up to
 * `MAX_ORDER_NUMBER_ATTEMPTS`) only on an actual collision — same contract
 * as Phase 2's original retry loop: the generator never claims uniqueness
 * itself (see src/lib/order-number.ts), the database's unique constraint
 * does. `buildData` receives a fresh (orderNumber, accessToken) pair each
 * attempt so the caller doesn't need its own retry loop. Returns `null`
 * (never throws) if every attempt collides — astronomically unlikely, but
 * the caller decides how to surface that as its own domain error.
 */
export async function createOrderWithUniqueNumber(
  tx: TransactionClient,
  buildData: (orderNumber: string, accessToken: string) => Prisma.OrderCreateInput,
) {
  for (let attempt = 0; attempt < MAX_ORDER_NUMBER_ATTEMPTS; attempt++) {
    const orderNumber = generateOrderNumber(new Date());
    const accessToken = generateAccessToken();
    try {
      return await tx.order.create({ data: buildData(orderNumber, accessToken) });
    } catch (err) {
      if (isUniqueConstraintErrorOn(err, "orderNumber")) {
        continue; // astronomically unlikely collision — try a fresh number
      }
      throw err;
    }
  }
  return null;
}

/**
 * Raw idempotency-key lookup, shared by every order-creating flow's
 * pre-check ("have we already done this?") and its P2002-on-`idempotencyKey`
 * race recovery. Each caller maps the row to its own result shape — this
 * function only does the read. See docs/PHASE_2_REPORT.md "Idempotency
 * strategy" for the full reasoning (pre-check, then guarded insert, then
 * recover on the race), reused unchanged by counter sales.
 */
export async function findOrderByIdempotencyKeyRaw(idempotencyKey: string) {
  return db.order.findUnique({ where: { idempotencyKey } });
}
