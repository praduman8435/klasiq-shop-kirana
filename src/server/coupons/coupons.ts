import type { Coupon, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { checkCoupon, couponStatus, normalizeCouponCode, type CouponCheck } from "@/lib/coupons";
import { normalizePhoneNumber } from "@/lib/phone";

type Client = Prisma.TransactionClient | typeof db;

const COUNTED = { status: { not: "CANCELLED" as const } };

/** How many (non-cancelled) orders used each coupon. */
export async function couponUseCounts(couponIds: string[], client: Client = db): Promise<Map<string, number>> {
  if (couponIds.length === 0) return new Map();
  const rows = await client.order.groupBy({
    by: ["couponId"],
    where: { couponId: { in: couponIds }, ...COUNTED },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.couponId!, r._count._all]));
}

/** Offers customers can see and tap at checkout (and the bag nudge uses). */
export async function getWebsiteCoupons(now: Date = new Date()) {
  const coupons = await db.coupon.findMany({
    where: {
      isActive: true,
      showOnWebsite: true,
      OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      AND: [{ OR: [{ startsAt: null }, { startsAt: { lte: now } }] }],
    },
    orderBy: [{ minOrderInPaise: "asc" }, { createdAt: "desc" }],
  });
  const used = await couponUseCounts(coupons.map((c) => c.id));
  return coupons
    .filter((c) => couponStatus(c, used.get(c.id) ?? 0, now) === "live")
    .map((c) => ({ ...c, usedCount: used.get(c.id) ?? 0 }));
}

async function customerFacts(couponId: string, customerId: string | null, client: Client) {
  if (!customerId) return { usedByCustomer: null, isFirstOrder: null };
  const [usedByCustomer, onlineOrders] = await Promise.all([
    client.order.count({ where: { couponId, customerId, ...COUNTED } }),
    client.order.count({ where: { customerId, source: "ONLINE", ...COUNTED } }),
  ]);
  return { usedByCustomer, isFirstOrder: onlineOrders === 0 };
}

export type CouponPreview =
  | { found: false; reason: string }
  | { found: true; coupon: Coupon; check: CouponCheck };

/**
 * "Apply" at checkout: is this code good for this bag? If the customer
 * has typed their mobile number, their own limits (used already? first
 * order?) are checked too; otherwise those wait until the order is placed.
 */
export async function previewCoupon(params: {
  code: string;
  subtotalInPaise: number;
  deliveryFeeInPaise: number;
  isDelivery: boolean;
  phone?: string;
  now?: Date;
}): Promise<CouponPreview> {
  const code = normalizeCouponCode(params.code);
  if (!code) return { found: false, reason: "Enter a code." };
  const coupon = await db.coupon.findUnique({ where: { code } });
  if (!coupon) return { found: false, reason: "That code doesn't exist. Check the spelling." };

  let customerId: string | null = null;
  if (params.phone) {
    const normalized = normalizePhoneNumber(params.phone);
    if (normalized.valid) {
      const customer = await db.customer.findUnique({ where: { primaryPhoneNormalized: normalized.normalized }, select: { id: true } });
      // A number the shop has never seen is by definition a first order.
      if (!customer) return { found: true, coupon, check: await checkWith(coupon, params, db, { usedByCustomer: 0, isFirstOrder: true }) };
      customerId = customer.id;
    }
  }
  const facts = await customerFacts(coupon.id, customerId, db);
  return { found: true, coupon, check: await checkWith(coupon, params, db, facts) };
}

async function checkWith(
  coupon: Coupon,
  params: { subtotalInPaise: number; deliveryFeeInPaise: number; isDelivery: boolean; now?: Date },
  client: Client,
  facts: { usedByCustomer: number | null; isFirstOrder: boolean | null },
) {
  const used = (await couponUseCounts([coupon.id], client)).get(coupon.id) ?? 0;
  return checkCoupon(coupon, {
    subtotalInPaise: params.subtotalInPaise,
    deliveryFeeInPaise: params.deliveryFeeInPaise,
    now: params.now ?? new Date(),
    usedCount: used,
    usedByCustomer: facts.usedByCustomer,
    isFirstOrder: facts.isFirstOrder,
    isDelivery: params.isDelivery,
  });
}

/**
 * The final word, inside the order's transaction: the coupon row is
 * locked so two customers can't both take the last use of a limited
 * offer, and the customer's own limits are checked now that they're known.
 */
export async function checkCouponForOrder(
  tx: Prisma.TransactionClient,
  params: { code: string; customerId: string; subtotalInPaise: number; deliveryFeeInPaise: number; isDelivery: boolean; now?: Date },
): Promise<{ coupon: Coupon; check: CouponCheck } | { coupon: null; reason: string }> {
  const code = normalizeCouponCode(params.code);
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "coupons" WHERE code = ${code} FOR UPDATE`;
  if (rows.length === 0) return { coupon: null, reason: "That offer code doesn't exist any more." };
  const coupon = await tx.coupon.findUniqueOrThrow({ where: { id: rows[0].id } });
  const facts = await customerFacts(coupon.id, params.customerId, tx);
  return { coupon, check: await checkWith(coupon, params, tx, facts) };
}

/** Admin list: every coupon with how often it's been used and what it gave away. */
export async function getAdminCoupons() {
  const coupons = await db.coupon.findMany({ orderBy: [{ isActive: "desc" }, { createdAt: "desc" }] });
  const stats = await db.order.groupBy({
    by: ["couponId"],
    where: { couponId: { in: coupons.map((c) => c.id) }, ...COUNTED },
    _count: { _all: true },
    _sum: { couponSavingInPaise: true, totalInPaise: true },
  });
  const byId = new Map(stats.map((s) => [s.couponId!, s]));
  return coupons.map((c) => {
    const s = byId.get(c.id);
    return {
      ...c,
      usedCount: s?._count._all ?? 0,
      savedInPaise: s?._sum.couponSavingInPaise ?? 0,
      salesInPaise: s?._sum.totalInPaise ?? 0,
    };
  });
}
