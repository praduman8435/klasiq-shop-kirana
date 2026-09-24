import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { startOfMonthInIndia } from "@/lib/supplier-balance";

/** Customer balances: counter-sale udhaar still open on their orders plus
 * open quick-udhaar entries, and when the oldest of it was given. */
export async function getKhataDues(customerIds?: string[]) {
  const scope = customerIds ? { customerId: { in: customerIds } } : { customerId: { not: null } };
  const [orders, entries] = await Promise.all([
    db.order.groupBy({
      by: ["customerId"],
      where: { ...scope, outstandingInPaise: { gt: 0 } } as Prisma.OrderWhereInput,
      _sum: { outstandingInPaise: true },
      _min: { createdAt: true },
    }),
    db.khataEntry.groupBy({
      by: ["customerId"],
      where: { ...(customerIds ? { customerId: { in: customerIds } } : {}), outstandingInPaise: { gt: 0 } },
      _sum: { outstandingInPaise: true },
      _min: { entryDate: true },
    }),
  ]);
  const dues = new Map<string, { dueInPaise: number; dueSince: Date | null }>();
  const add = (id: string, amount: number, since: Date | null) => {
    const current = dues.get(id) ?? { dueInPaise: 0, dueSince: null };
    current.dueInPaise += amount;
    if (since && (!current.dueSince || since < current.dueSince)) current.dueSince = since;
    dues.set(id, current);
  };
  for (const g of orders) if (g.customerId) add(g.customerId, g._sum.outstandingInPaise ?? 0, g._min.createdAt);
  for (const g of entries) add(g.customerId, g._sum.outstandingInPaise ?? 0, g._min.entryDate);
  return dues;
}

export const KHATA_LIST_TABS = ["DUE", "COLLECT", "ALL"] as const;
export type KhataListTab = (typeof KHATA_LIST_TABS)[number];

export type KhataListRow = {
  customerId: string;
  displayName: string | null;
  phone: string | null;
  whatsappPhone: string | null;
  dueInPaise: number;
  dueSince: Date | null;
  lastOrderAt: Date | null;
};

const PAGE_SIZE = 30;

/**
 * /admin/khatabook:
 * - DUE ("Lena hai"): everyone who owes, biggest dues first.
 * - COLLECT ("Collect today"): everyone who owes, oldest udhaar first —
 *   the day's collection round, with a reminder button on each row.
 * - ALL: every customer (search), most recent first.
 */
export async function getKhataList(params: { query?: string; tab?: KhataListTab; page?: number }) {
  const q = params.query?.trim();
  const tab = params.tab ?? "DUE";
  const search: Prisma.CustomerWhereInput = q
    ? {
        OR: [
          { displayName: { contains: q, mode: "insensitive" } },
          { primaryPhone: { contains: q } },
          { customerId: { contains: q, mode: "insensitive" } },
        ],
      }
    : {};
  const select = {
    id: true,
    customerId: true,
    displayName: true,
    primaryPhone: true,
    whatsappPhone: true,
    lastOrderAt: true,
  } as const;

  let rows: KhataListRow[];
  let totalCount: number;
  let page = Math.max(1, params.page ?? 1);

  if (tab === "ALL") {
    totalCount = await db.customer.count({ where: search });
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    page = Math.min(page, totalPages);
    const customers = await db.customer.findMany({
      where: search,
      orderBy: [{ lastOrderAt: { sort: "desc", nulls: "last" } }, { createdAt: "desc" }],
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select,
    });
    const dues = await getKhataDues(customers.map((c) => c.id));
    rows = customers.map((c) => toRow(c, dues.get(c.id)));
  } else {
    const dues = await getKhataDues();
    const customers = await db.customer.findMany({ where: { id: { in: [...dues.keys()] }, ...search }, select });
    rows = customers.map((c) => toRow(c, dues.get(c.id))).filter((r) => r.dueInPaise > 0);
    rows.sort(
      tab === "COLLECT"
        ? (a, b) => (a.dueSince?.getTime() ?? 0) - (b.dueSince?.getTime() ?? 0) || b.dueInPaise - a.dueInPaise
        : (a, b) => b.dueInPaise - a.dueInPaise,
    );
    totalCount = rows.length;
    const totalPages = Math.max(1, Math.ceil(totalCount / PAGE_SIZE));
    page = Math.min(page, totalPages);
    rows = rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  }

  return { rows, totalCount, page, pageSize: PAGE_SIZE, totalPages: Math.max(1, Math.ceil(totalCount / PAGE_SIZE)) };
}

function toRow(
  c: { customerId: string; displayName: string | null; primaryPhone: string | null; whatsappPhone: string | null; lastOrderAt: Date | null },
  due: { dueInPaise: number; dueSince: Date | null } | undefined,
): KhataListRow {
  return {
    customerId: c.customerId,
    displayName: c.displayName,
    phone: c.primaryPhone,
    whatsappPhone: c.whatsappPhone,
    dueInPaise: due?.dueInPaise ?? 0,
    dueSince: due?.dueSince ?? null,
    lastOrderAt: c.lastOrderAt,
  };
}

export type KhataOverview = {
  totalDueInPaise: number;
  customersDueCount: number;
  udhaarGivenThisMonthInPaise: number;
  collectedThisMonthInPaise: number;
};

/** The header card: total "lena hai", and this month's udhaar given vs
 * collected. Purana udhaar (opening balances) isn't "given this month". */
export async function getKhataOverview(now: Date = new Date()): Promise<KhataOverview> {
  const monthStart = startOfMonthInIndia(now);
  const [dues, entriesThisMonth, billsThisMonth, collectionsThisMonth, singleReceiptsThisMonth] = await Promise.all([
    getKhataDues(),
    db.khataEntry.aggregate({ where: { kind: "UDHAAR", entryDate: { gte: monthStart } }, _sum: { amountInPaise: true } }),
    db.order.findMany({
      where: {
        createdAt: { gte: monthStart },
        customerId: { not: null },
        OR: [{ outstandingInPaise: { gt: 0 } }, { paymentReceipts: { some: {} } }],
      },
      select: { outstandingInPaise: true, paymentReceipts: { select: { amountInPaise: true } } },
    }),
    db.khataCollection.aggregate({ where: { collectedAt: { gte: monthStart } }, _sum: { amountInPaise: true } }),
    db.paymentReceipt.aggregate({ where: { createdAt: { gte: monthStart }, collectionId: null }, _sum: { amountInPaise: true } }),
  ]);

  let totalDueInPaise = 0;
  for (const { dueInPaise } of dues.values()) totalDueInPaise += dueInPaise;
  const billUdhaar = billsThisMonth.reduce(
    (sum, o) => sum + o.outstandingInPaise + o.paymentReceipts.reduce((s, r) => s + r.amountInPaise, 0),
    0,
  );

  return {
    totalDueInPaise,
    customersDueCount: [...dues.values()].filter((d) => d.dueInPaise > 0).length,
    udhaarGivenThisMonthInPaise: (entriesThisMonth._sum.amountInPaise ?? 0) + billUdhaar,
    collectedThisMonthInPaise:
      (collectionsThisMonth._sum.amountInPaise ?? 0) + (singleReceiptsThisMonth._sum.amountInPaise ?? 0),
  };
}
