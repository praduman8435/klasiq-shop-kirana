import type { PaymentMethod, SupplierPaymentMethod } from "@prisma/client";
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
export async function getDashboardOverview(now: Date = new Date(), range: SalesRangeInput = { range: "week" }) {
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
    topItems,
    statusCounts,
    lowStockCount,
    outOfStockCount,
    khata,
    khataDues,
    suppliers,
    onlinePaidToday,
    supplierPaidToday,
    supplierRefundsToday,
    series,
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
    // Single payments against bills today. Receipts that are part of a
    // Paisa mila collection are counted with that collection instead, on
    // the date the owner picked for it.
    db.paymentReceipt.groupBy({
      by: ["paymentMethod"],
      where: { createdAt: { gte: today }, collectionId: null },
      _sum: { amountInPaise: true },
    }),
    // Paisa mila dated today: the part that cleared bills (receipts) and
    // the part that cleared quick-udhaar entries (allocations).
    db.khataCollection.findMany({
      where: { collectedAt: { gte: today, lt: new Date(today.getTime() + DAY_MS) } },
      select: {
        paymentMethod: true,
        receipts: { select: { amountInPaise: true } },
        allocations: { select: { amountInPaise: true } },
      },
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
    // Online orders marked Paid today (collected at pickup / on delivery).
    db.order.aggregate({
      where: { source: "ONLINE", paidAt: { gte: today }, paymentStatus: "PAID" },
      _sum: { totalInPaise: true },
      _count: { _all: true },
    }),
    // Money paid out to suppliers today.
    db.supplierPayment.groupBy({
      by: ["paymentMethod"],
      where: { paymentDate: { gte: today, lt: new Date(today.getTime() + DAY_MS) } },
      _sum: { amountInPaise: true },
    }),
    // Money suppliers gave back today.
    db.supplierRefund.groupBy({
      by: ["refundMethod"],
      where: { refundDate: { gte: today, lt: new Date(today.getTime() + DAY_MS) } },
      _sum: { amountInPaise: true },
    }),
    getSalesSeries(range, now),
  ]);

  const bySource = (source: "ONLINE" | "COUNTER") => {
    const g = salesToday.find((x) => x.source === source);
    return { count: g?._count._all ?? 0, valueInPaise: g?._sum.totalInPaise ?? 0 };
  };
  const online = bySource("ONLINE");
  const counter = bySource("COUNTER");

  type Split = { CASH: number; UPI: number; CARD: number };
  const split = (): Split => ({ CASH: 0, UPI: 0, CARD: 0 });
  const add = (into: Split, method: PaymentMethod | null, amount: number) => {
    const key = method === "UPI" || method === "CARD" ? method : "CASH";
    into[key] += amount;
  };
  // Paid at the counter when today's bills were made: what each received,
  // minus later payments against it (those are counted as udhaar repaid).
  const counterSales = split();
  for (const o of counterOrdersToday) {
    add(counterSales, o.paymentMethod, o.amountReceivedInPaise - o.paymentReceipts.reduce((s, r) => s + r.amountInPaise, 0));
  }
  const udhaarRepaid = split();
  for (const g of receiptsToday) add(udhaarRepaid, g.paymentMethod, g._sum.amountInPaise ?? 0);
  for (const c of collectionsToday) {
    const amount = [...c.receipts, ...c.allocations].reduce((s, a) => s + a.amountInPaise, 0);
    add(udhaarRepaid, c.paymentMethod, amount);
  }
  // Online orders' pay-at-store / cash-on-delivery money: counted as cash
  // (the method at collection isn't recorded).
  const onlinePaid = split();
  onlinePaid.CASH = onlinePaidToday._sum.totalInPaise ?? 0;
  // Only cash, UPI and card touch the galla; bank transfers, cheques and
  // "other" don't come out of the drawer or the UPI account's day total.
  const supplierSplit = (method: SupplierPaymentMethod, amount: number, into: Split) => {
    if (method === "CASH" || method === "UPI" || method === "CARD") into[method] += amount;
  };
  const paidToSuppliers = split();
  for (const g of supplierPaidToday) supplierSplit(g.paymentMethod, g._sum.amountInPaise ?? 0, paidToSuppliers);
  const supplierRefunds = split();
  for (const g of supplierRefundsToday) supplierSplit(g.refundMethod, g._sum.amountInPaise ?? 0, supplierRefunds);
  const received: Split = {
    CASH: counterSales.CASH + udhaarRepaid.CASH + onlinePaid.CASH + supplierRefunds.CASH,
    UPI: counterSales.UPI + udhaarRepaid.UPI + supplierRefunds.UPI,
    CARD: counterSales.CARD + udhaarRepaid.CARD + supplierRefunds.CARD,
  };
  const net: Split = {
    CASH: received.CASH - paidToSuppliers.CASH,
    UPI: received.UPI - paidToSuppliers.UPI,
    CARD: received.CARD - paidToSuppliers.CARD,
  };

  // Udhaar given on today's counter bills = what's still open plus
  // anything already paid back against them (so a same-day repayment
  // doesn't hide the udhaar), plus quick udhaar written today.
  const udhaarGivenTodayInPaise =
    counterOrdersToday.reduce(
      (sum, o) => sum + o.outstandingInPaise + o.paymentReceipts.reduce((s, r) => s + r.amountInPaise, 0),
      0,
    ) + (udhaarEntriesToday._sum.amountInPaise ?? 0);
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
      galla: {
        counterSales,
        udhaarRepaid,
        onlinePaid,
        onlinePaidCount: onlinePaidToday._count._all,
        paidToSuppliers,
        supplierRefunds,
        net,
      },
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
    series,
    topItems: topItems.map((t) => ({
      name: t.productName,
      size: t.size,
      quantity: t._sum.quantity ?? 0,
      valueInPaise: t._sum.effectiveLineTotalInPaise ?? 0,
    })),
  };
}

export const SALES_RANGES = ["week", "month", "year", "custom"] as const;
export type SalesRange = (typeof SALES_RANGES)[number];
export type SalesRangeInput = { range: SalesRange; from?: string; to?: string };

const DAY_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric" });
const DAY_FULL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short", day: "numeric", month: "short" });
const WEEKDAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", weekday: "short" });
const MONTH_LABEL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "short" });
const MONTH_FULL = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", month: "long", year: "numeric" });
const RANGE_DAY = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });

/** "YYYY-MM-DD" (a date input's value) → midnight that day in India. */
function indiaDateStart(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split("-").map(Number);
  const date = new Date(Date.UTC(y, m - 1, d) - IST_OFFSET_MS);
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfIndiaMonth(now: Date, monthsAgo: number): Date {
  const ist = new Date(now.getTime() + IST_OFFSET_MS);
  return new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() - monthsAgo, 1) - IST_OFFSET_MS);
}

export type SalesPoint = { key: string; label: string; fullLabel: string; valueInPaise: number; billCount: number; isCurrent: boolean };

/**
 * Sales (non-cancelled orders, online + counter) for the dashboard chart:
 * last 7 days, last 30 days, last 12 months, or a custom range — daily
 * bars for up to 62 days, monthly bars beyond that.
 */
export async function getSalesSeries(input: SalesRangeInput, now: Date = new Date()) {
  let start: Date;
  let end = new Date(startOfIndiaDay(now).getTime() + DAY_MS);
  let unit: "day" | "month";
  let range = input.range;

  if (range === "custom") {
    const from = input.from ? indiaDateStart(input.from) : null;
    const to = input.to ? indiaDateStart(input.to) : null;
    if (from && to && from <= to) {
      start = from;
      end = new Date(Math.min(to.getTime() + DAY_MS, end.getTime()));
      const days = Math.round((end.getTime() - start.getTime()) / DAY_MS);
      unit = days <= 62 ? "day" : "month";
    } else {
      range = "week";
      start = startOfIndiaDay(now, 6);
      unit = "day";
    }
  } else if (range === "year") {
    start = startOfIndiaMonth(now, 11);
    unit = "month";
  } else if (range === "month") {
    start = startOfIndiaDay(now, 29);
    unit = "day";
  } else {
    start = startOfIndiaDay(now, 6);
    unit = "day";
  }

  const orders = await db.order.findMany({
    where: { createdAt: { gte: start, lt: end }, status: { not: "CANCELLED" } },
    select: { createdAt: true, totalInPaise: true },
  });

  const points: SalesPoint[] = [];
  const todayStart = startOfIndiaDay(now);
  if (unit === "day") {
    for (let t = start.getTime(); t < end.getTime(); t += DAY_MS) {
      const dayStart = new Date(t);
      points.push({
        key: dayStart.toISOString(),
        label: range === "week" ? WEEKDAY.format(dayStart) : DAY_LABEL.format(dayStart),
        fullLabel: DAY_FULL.format(dayStart),
        valueInPaise: 0,
        billCount: 0,
        isCurrent: t === todayStart.getTime(),
      });
    }
  } else {
    for (let cursor = start; cursor < end; ) {
      const ist = new Date(cursor.getTime() + IST_OFFSET_MS);
      const next = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth() + 1, 1) - IST_OFFSET_MS);
      points.push({
        key: cursor.toISOString(),
        label: MONTH_LABEL.format(cursor),
        fullLabel: MONTH_FULL.format(cursor),
        valueInPaise: 0,
        billCount: 0,
        isCurrent: now >= cursor && now < next,
      });
      cursor = next;
    }
  }
  const starts = points.map((p) => new Date(p.key).getTime());
  for (const o of orders) {
    const t = o.createdAt.getTime();
    let i = starts.length - 1;
    while (i > 0 && starts[i] > t) i--;
    points[i].valueInPaise += o.totalInPaise;
    points[i].billCount += 1;
  }

  const totalInPaise = points.reduce((s, p) => s + p.valueInPaise, 0);
  const dayCount = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY_MS));
  const best = points.reduce<SalesPoint | null>((b, p) => (p.valueInPaise > (b?.valueInPaise ?? 0) ? p : b), null);
  return {
    range,
    unit,
    points,
    totalInPaise,
    billCount: orders.length,
    /** Per day for daily bars, per month for monthly bars. */
    averageInPaise: Math.round(totalInPaise / (unit === "day" ? dayCount : Math.max(1, points.length))),
    best,
    rangeLabel: `${RANGE_DAY.format(start)} – ${RANGE_DAY.format(new Date(end.getTime() - 1))}`,
  };
}
