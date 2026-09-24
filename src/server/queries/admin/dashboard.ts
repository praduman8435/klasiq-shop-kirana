import type { PaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { getKhataDues, getKhataOverview } from "@/server/queries/admin/khata-list";
import { getSupplierOverview } from "@/server/queries/admin/supplier-balances";
import { getOrderStatusCounts } from "@/server/queries/admin/orders";

const IST_OFFSET_MS = (5 * 60 + 30) * 60_000;
const DAY_MS = 86_400_000;

/** Midnight in India, `daysAgo` days back, as a UTC instant. The server
 * runs in UTC, so "today" must be computed in India time explicitly. */
export function startOfIndiaDay(now: Date, daysAgo = 0): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() - daysAgo) - IST_OFFSET_MS);
}

export type DashboardOverview = Awaited<ReturnType<typeof getDashboardOverview>>;

/**
 * Everything the owner's dashboard shows, in one parallel read:
 * - today's sales (online + counter, cancelled excluded) vs yesterday,
 * - money received at the shop today by method (counter sales paid at
 *   the counter, plus udhaar collected), and udhaar given today,
 * - what needs attention (orders to act on, stock, udhaar, suppliers),
 * - the last 7 days' sales and this week's top items.
 */
export async function getDashboardOverview(now: Date = new Date()) {
  const today = startOfIndiaDay(now);
  const yesterday = startOfIndiaDay(now, 1);
  const weekStart = startOfIndiaDay(now, 6);
  const notCancelled = { status: { not: "CANCELLED" as const } };

  const [
    salesToday,
    salesYesterday,
    receiptsToday,
    collectionsToday,
    counterOrdersToday,
    udhaarEntriesToday,
    weekOrders,
    topItems,
    statusCounts,
    lowStockCount,
    outOfStockCount,
    khata,
    khataDues,
    suppliers,
  ] = await Promise.all([
    db.order.groupBy({
      by: ["source"],
      where: { createdAt: { gte: today }, ...notCancelled },
      _count: { _all: true },
      _sum: { totalInPaise: true },
    }),
    db.order.aggregate({
      where: { createdAt: { gte: yesterday, lt: today }, ...notCancelled },
      _sum: { totalInPaise: true },
    }),
    // Udhaar paid against bills today (single payments and Paisa mila).
    db.paymentReceipt.groupBy({
      by: ["paymentMethod"],
      where: { createdAt: { gte: today } },
      _sum: { amountInPaise: true },
    }),
    // Paisa mila today, for the part that cleared quick-udhaar entries.
    db.khataCollection.findMany({
      where: { collectedAt: { gte: today } },
      select: { paymentMethod: true, allocations: { select: { amountInPaise: true } } },
    }),
    db.order.findMany({
      where: { source: "COUNTER", createdAt: { gte: today }, ...notCancelled },
      select: {
        paymentMethod: true,
        amountReceivedInPaise: true,
        outstandingInPaise: true,
        paymentReceipts: { select: { amountInPaise: true } },
      },
    }),
    db.khataEntry.aggregate({ where: { kind: "UDHAAR", entryDate: { gte: today } }, _sum: { amountInPaise: true } }),
    db.order.findMany({
      where: { createdAt: { gte: weekStart }, ...notCancelled },
      select: { createdAt: true, totalInPaise: true },
    }),
    db.orderItem.groupBy({
      by: ["productName", "size"],
      where: { order: { createdAt: { gte: weekStart }, ...notCancelled } },
      _sum: { quantity: true, effectiveLineTotalInPaise: true },
      orderBy: { _sum: { quantity: "desc" } },
      take: 5,
    }),
    getOrderStatusCounts(),
    db.productVariant.count({ where: { isActive: true, product: { isActive: true }, stockStatus: "LOW_STOCK" } }),
    db.productVariant.count({ where: { isActive: true, product: { isActive: true }, stockStatus: "OUT_OF_STOCK" } }),
    getKhataOverview(now),
    getKhataDues(),
    getSupplierOverview(now),
  ]);

  const bySource = (source: "ONLINE" | "COUNTER") => {
    const g = salesToday.find((x) => x.source === source);
    return { count: g?._count._all ?? 0, valueInPaise: g?._sum.totalInPaise ?? 0 };
  };
  const online = bySource("ONLINE");
  const counter = bySource("COUNTER");

  const received: Record<"CASH" | "UPI" | "CARD", number> = { CASH: 0, UPI: 0, CARD: 0 };
  const addReceived = (method: PaymentMethod | null, amount: number) => {
    const key = method === "UPI" || method === "CARD" ? method : "CASH";
    received[key] += amount;
  };
  // Paid at the counter when today's bills were made: what each received,
  // minus later payments against it (those are counted as receipts).
  for (const o of counterOrdersToday) {
    addReceived(o.paymentMethod, o.amountReceivedInPaise - o.paymentReceipts.reduce((s, r) => s + r.amountInPaise, 0));
  }
  for (const g of receiptsToday) addReceived(g.paymentMethod, g._sum.amountInPaise ?? 0);
  for (const c of collectionsToday) addReceived(c.paymentMethod, c.allocations.reduce((s, a) => s + a.amountInPaise, 0));

  // Udhaar given on today's counter bills = what's still open plus
  // anything already paid back against them (so a same-day repayment
  // doesn't hide the udhaar), plus quick udhaar written today.
  const udhaarGivenTodayInPaise =
    counterOrdersToday.reduce(
      (sum, o) => sum + o.outstandingInPaise + o.paymentReceipts.reduce((s, r) => s + r.amountInPaise, 0),
      0,
    ) + (udhaarEntriesToday._sum.amountInPaise ?? 0);
  const days = Array.from({ length: 7 }, (_, i) => {
    const start = startOfIndiaDay(now, 6 - i);
    const end = new Date(start.getTime() + DAY_MS);
    const valueInPaise = weekOrders
      .filter((o) => o.createdAt >= start && o.createdAt < end)
      .reduce((s, o) => s + o.totalInPaise, 0);
    return { date: start, valueInPaise, isToday: i === 6 };
  });

  let oldestDueSince: Date | null = null;
  for (const d of khataDues.values()) {
    if (d.dueInPaise > 0 && d.dueSince && (!oldestDueSince || d.dueSince < oldestDueSince)) oldestDueSince = d.dueSince;
  }

  return {
    today: {
      salesInPaise: online.valueInPaise + counter.valueInPaise,
      billCount: online.count + counter.count,
      online,
      counter,
      yesterdaySalesInPaise: salesYesterday._sum.totalInPaise ?? 0,
      received,
      receivedTotalInPaise: received.CASH + received.UPI + received.CARD,
      udhaarGivenInPaise: udhaarGivenTodayInPaise,
    },
    attention: {
      newOrders: statusCounts.PENDING ?? 0,
      packing: (statusCounts.CONFIRMED ?? 0) + (statusCounts.PREPARING ?? 0),
      readyForPickup: statusCounts.READY_FOR_PICKUP ?? 0,
      outForDelivery: statusCounts.OUT_FOR_DELIVERY ?? 0,
      lowStock: lowStockCount,
      outOfStock: outOfStockCount,
      udhaarDueInPaise: khata.totalDueInPaise,
      udhaarCustomers: khata.customersDueCount,
      oldestDueSince,
      supplierOwedInPaise: suppliers.totalOwedInPaise,
      suppliersOwed: suppliers.suppliersOwedCount,
    },
    week: days,
    topItems: topItems.map((t) => ({
      name: t.productName,
      size: t.size,
      quantity: t._sum.quantity ?? 0,
      valueInPaise: t._sum.effectiveLineTotalInPaise ?? 0,
    })),
  };
}
