import "server-only";
import { cookies } from "next/headers";
import { db } from "@/lib/db";
import { generateAccessToken } from "@/lib/access-token";

export const BASKET_COOKIE_NAME = "shop_basket_id";
const BASKET_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 60; // 60 days

/**
 * Read-only basket id lookup — safe to call from Server Components.
 *
 * Phase 3.7 Part 4 — the cookie itself holds `Basket.accessToken` (an
 * unguessable, cryptographically-random bearer token), never `Basket.id`
 * directly — see that field's own doc comment in prisma/schema.prisma
 * for why a plain `cuid()` primary key isn't a safe bearer credential by
 * itself. This function resolves that token to the basket's real `id`
 * so every existing caller keeps working exactly as before (a usable
 * `Basket.id` for FK lookups/comparisons) — the token-vs-id indirection
 * is fully contained here, nowhere else needed to change. Mirrors the
 * original contract exactly: returns an id if the token resolves to a
 * real row, `null` otherwise — no opinion on that basket's `status`
 * (callers like `getBasket()`/`getConvertedBasketOrderLink()` already
 * make their own status decision after this resolves).
 */
export async function getBasketId(): Promise<string | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(BASKET_COOKIE_NAME)?.value;
  if (!token) return null;

  const basket = await db.basket.findUnique({ where: { accessToken: token }, select: { id: true } });
  return basket?.id ?? null;
}

/**
 * Gets the current basket id, creating a new Basket row and setting the
 * cookie if none exists yet. Only callable from a Server Action or Route
 * Handler (cookie writes are not allowed during Server Component render).
 *
 * A basket whose cookie still points at an already-CONVERTED basket (the
 * parent placed an order, then came back and tried to add something new)
 * transparently gets a fresh ACTIVE basket instead of reusing the old one —
 * see docs/PHASE_2_REPORT.md "Basket conversion strategy".
 *
 * Phase 3.7 Part 4 — a freshly-created basket is issued a real
 * `generateAccessToken()` value (never its own `id`) as both its
 * `accessToken` column and the cookie value; see `getBasketId`'s own
 * doc comment above for the full reasoning.
 */
export async function getOrCreateBasketId(): Promise<string> {
  const cookieStore = await cookies();
  const existingToken = cookieStore.get(BASKET_COOKIE_NAME)?.value;
  if (existingToken) {
    const basket = await db.basket.findUnique({ where: { accessToken: existingToken } });
    if (basket && basket.status === "ACTIVE") return basket.id;
  }

  const accessToken = generateAccessToken();
  const basket = await db.basket.create({ data: { accessToken } });
  cookieStore.set(BASKET_COOKIE_NAME, accessToken, {
    httpOnly: true,
    // Personal-data audit (2026-08-10) — was missing `secure`, unlike the
    // admin/customer session cookies (src/lib/admin/session.ts,
    // src/lib/customer-portal/session.ts), which already set it. Matches
    // their exact rule: only require HTTPS-only transmission once actually
    // deployed over HTTPS, never in local HTTP development.
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: BASKET_COOKIE_MAX_AGE_SECONDS,
  });
  return basket.id;
}

/**
 * The full basket with everything needed to render it, re-read fresh from
 * the database on every call — quantity, price and stock displayed to the
 * parent are never cached client state.
 *
 * Returns null for a CONVERTED basket: once an order has been placed, the
 * basket that produced it no longer behaves like an active shopping
 * basket, even though its rows still exist for order-history/debugging
 * purposes. Every caller already handles `null` as "empty bag".
 */
export async function getBasket() {
  const basketId = await getBasketId();
  if (!basketId) return null;

  const basket = await db.basket.findUnique({
    where: { id: basketId },
    include: {
      items: {
        orderBy: { createdAt: "asc" },
        include: {
          productVariant: {
            include: {
              product: {
                include: {
                  category: { select: { slug: true } },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!basket || basket.status !== "ACTIVE") return null;
  return basket;
}

export function basketItemCount(
  basket: Awaited<ReturnType<typeof getBasket>>,
): number {
  if (!basket) return 0;
  return basket.items.reduce((sum, item) => sum + item.quantity, 0);
}

/** How many of each variant are in the bag, keyed by variant id — what a
 * product card needs to show its ADD button or its − n + stepper. */
export function basketVariantQuantities(
  basket: Awaited<ReturnType<typeof getBasket>>,
): Record<string, number> {
  if (!basket) return {};
  return Object.fromEntries(basket.items.map((item) => [item.productVariantId, item.quantity]));
}

export function basketTotalInPaise(
  basket: Awaited<ReturnType<typeof getBasket>>,
): number {
  if (!basket) return 0;
  return basket.items.reduce(
    (sum, item) => sum + item.productVariant.priceInPaise * item.quantity,
    0,
  );
}

/**
 * If the current basket cookie points at a basket that already produced an
 * order (e.g. the parent placed an order, then hit back/refresh on
 * /checkout), returns that order's confirmation link so the page can
 * redirect them there instead of confusingly claiming their bag is empty.
 */
export async function getConvertedBasketOrderLink(): Promise<{
  orderNumber: string;
  accessToken: string;
} | null> {
  const basketId = await getBasketId();
  if (!basketId) return null;

  const basket = await db.basket.findUnique({ where: { id: basketId } });
  if (!basket || basket.status !== "CONVERTED" || !basket.convertedOrderId) return null;

  const order = await db.order.findUnique({ where: { id: basket.convertedOrderId } });
  if (!order) return null;

  return { orderNumber: order.orderNumber, accessToken: order.accessToken };
}
