import "server-only";
import type { PaymentMethod, Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { allocateOldestFirst } from "@/lib/allocate-oldest-first";
import { rupeesToPaise } from "@/lib/money";
import { derivePaymentStatus } from "@/lib/payment";
import { startOfDayInIndia } from "@/lib/supplier-balance";
import { findOrCreateCustomerByPrimaryPhone } from "@/server/commerce/customer";
import type { KhataEventLike } from "@/lib/khata";

/**
 * KhataBook the way a shopkeeper keeps it: "Udhaar diya" (quick credit,
 * no bill), "Paisa mila" (one amount, cleared oldest first across bills
 * and udhaar), and adding a customer with their purana udhaar.
 *
 * A customer's balance = their orders' `outstandingInPaise` (counter-sale
 * udhaar, exactly as before) + their KhataEntry `outstandingInPaise`.
 * A collection pays orders through ordinary PaymentReceipt rows (same
 * order updates as a single receive-payment) and entries through
 * KhataCollectionAllocation rows. Every write locks the customer row.
 */

type Tx = Prisma.TransactionClient;

export class KhataError extends Error {}

async function lockCustomer(tx: Tx, customerCode: string) {
  const rows = await tx.$queryRaw<{ id: string; displayName: string | null }[]>`
    SELECT id, "displayName" FROM "customers" WHERE "customerId" = ${customerCode} FOR UPDATE`;
  if (rows.length === 0) throw new KhataError("Customer not found.");
  return rows[0];
}

export type OpenKhataItem =
  | { kind: "ORDER"; id: string; date: Date; outstandingInPaise: number; orderNumber: string; orderId: string }
  | { kind: "ENTRY"; id: string; date: Date; outstandingInPaise: number; note: string | null; opening: boolean };

/** Everything still unpaid, oldest first — purana udhaar always first. */
export async function openKhataItemsOldestFirst(tx: Tx, customerDbId: string): Promise<OpenKhataItem[]> {
  const [orders, entries] = await Promise.all([
    tx.order.findMany({
      where: { customerId: customerDbId, outstandingInPaise: { gt: 0 } },
      select: { id: true, orderNumber: true, createdAt: true, outstandingInPaise: true },
    }),
    tx.khataEntry.findMany({
      where: { customerId: customerDbId, outstandingInPaise: { gt: 0 } },
      select: { id: true, entryDate: true, outstandingInPaise: true, note: true, kind: true },
    }),
  ]);
  const items: OpenKhataItem[] = [
    ...orders.map((o) => ({
      kind: "ORDER" as const,
      id: `order:${o.id}`,
      orderId: o.id,
      orderNumber: o.orderNumber,
      date: o.createdAt,
      outstandingInPaise: o.outstandingInPaise,
    })),
    ...entries.map((e) => ({
      kind: "ENTRY" as const,
      id: e.id,
      date: e.entryDate,
      outstandingInPaise: e.outstandingInPaise,
      note: e.note,
      opening: e.kind === "OPENING_BALANCE",
    })),
  ];
  const openingFirst = (i: OpenKhataItem) => (i.kind === "ENTRY" && i.opening ? 0 : 1);
  return items.sort((a, b) => openingFirst(a) - openingFirst(b) || a.date.getTime() - b.date.getTime());
}

export type UdhaarInput = { customerId: string; amountInRupees: number; note?: string; entryDate: Date };

/** "Udhaar diya" — goods given on credit, written straight into the khata. */
export async function recordUdhaar(input: UdhaarInput, admin: { id: string }) {
  const amountInPaise = rupeesToPaise(input.amountInRupees);
  return db.$transaction(async (tx) => {
    const customer = await lockCustomer(tx, input.customerId);
    return tx.khataEntry.create({
      data: {
        customerId: customer.id,
        kind: "UDHAAR",
        amountInPaise,
        outstandingInPaise: amountInPaise,
        note: input.note || null,
        entryDate: input.entryDate,
        createdByAdminUserId: admin.id,
      },
      select: { id: true },
    });
  });
}

export type CollectionInput = {
  customerId: string;
  amountInRupees: number;
  paymentMethod: Extract<PaymentMethod, "CASH" | "UPI" | "CARD">;
  note?: string;
  collectedAt: Date;
};

/** "Paisa mila" — one amount from the customer, cleared oldest first
 * across unpaid bills and udhaar. Can't be more than what's due. */
export async function recordCollection(input: CollectionInput, admin: { id: string }) {
  const amountInPaise = rupeesToPaise(input.amountInRupees);

  return db.$transaction(async (tx) => {
    const customer = await lockCustomer(tx, input.customerId);
    const open = await openKhataItemsOldestFirst(tx, customer.id);
    const dueInPaise = open.reduce((s, i) => s + i.outstandingInPaise, 0);
    if (dueInPaise === 0) throw new KhataError("Nothing is due from this customer.");
    if (amountInPaise > dueInPaise) {
      throw new KhataError(`That's more than the ₹${dueInPaise / 100} due. Enter ₹${dueInPaise / 100} or less.`);
    }

    const { allocations } = allocateOldestFirst(amountInPaise, open);
    const byId = new Map(open.map((i) => [i.id, i]));

    const collection = await tx.khataCollection.create({
      data: {
        customerId: customer.id,
        amountInPaise,
        paymentMethod: input.paymentMethod,
        note: input.note || null,
        collectedAt: input.collectedAt,
        createdByAdminUserId: admin.id,
      },
      select: { id: true },
    });

    for (const allocation of allocations) {
      const item = byId.get(allocation.purchaseId)!;
      if (item.kind === "ORDER") {
        const order = await tx.order.findUniqueOrThrow({
          where: { id: item.orderId },
          select: { id: true, totalInPaise: true, amountReceivedInPaise: true, outstandingInPaise: true },
        });
        const received = order.amountReceivedInPaise + allocation.amountInPaise;
        const outstandingAfter = order.outstandingInPaise - allocation.amountInPaise;
        const updated = await tx.order.updateMany({
          where: { id: order.id, outstandingInPaise: order.outstandingInPaise },
          data: {
            amountReceivedInPaise: received,
            outstandingInPaise: outstandingAfter,
            paymentStatus: derivePaymentStatus(received, order.totalInPaise),
          },
        });
        if (updated.count === 0) throw new KhataError("This khata just changed. Please try again.");
        await tx.paymentReceipt.create({
          data: {
            orderId: order.id,
            customerId: customer.id,
            amountInPaise: allocation.amountInPaise,
            paymentMethod: input.paymentMethod,
            note: input.note || null,
            outstandingBeforeInPaise: order.outstandingInPaise,
            outstandingAfterInPaise: outstandingAfter,
            createdByAdminUserId: admin.id,
            collectionId: collection.id,
          },
        });
      } else {
        const updated = await tx.khataEntry.updateMany({
          where: { id: item.id, outstandingInPaise: item.outstandingInPaise },
          data: { outstandingInPaise: item.outstandingInPaise - allocation.amountInPaise },
        });
        if (updated.count === 0) throw new KhataError("This khata just changed. Please try again.");
        await tx.khataCollectionAllocation.create({
          data: { collectionId: collection.id, entryId: item.id, amountInPaise: allocation.amountInPaise },
        });
      }
    }

    return {
      collectionId: collection.id,
      itemsClearedCount: allocations.filter((a) => a.amountInPaise === byId.get(a.purchaseId)!.outstandingInPaise).length,
      dueAfterInPaise: dueInPaise - amountInPaise,
    };
  });
}

export type KhataCustomerInput = { name: string; phone: string; openingBalanceInRupees?: number };

/** Adds a customer to KhataBook. A mobile number already in the khata
 * opens that customer instead of creating a second one. Purana udhaar
 * becomes the customer's first (oldest) entry. */
export async function createKhataCustomer(input: KhataCustomerInput, admin: { id: string }, now: Date = new Date()) {
  const found = await findOrCreateCustomerByPrimaryPhone({ rawPhone: input.phone, displayName: input.name });
  if (!found.success) throw new KhataError("Enter a valid 10-digit mobile number.");
  const customer = found.customer;
  if (!found.wasCreated) return { customerId: customer.customerId, existed: true };

  const openingInPaise = rupeesToPaise(input.openingBalanceInRupees ?? 0);
  if (openingInPaise > 0) {
    await db.khataEntry.create({
      data: {
        customerId: customer.id,
        kind: "OPENING_BALANCE",
        amountInPaise: openingInPaise,
        outstandingInPaise: openingInPaise,
        note: "Purana udhaar",
        entryDate: startOfDayInIndia(now),
        createdByAdminUserId: admin.id,
      },
    });
  }
  return { customerId: customer.customerId, existed: false };
}

export type KhataEvent = KhataEventLike & { key: string; balanceInPaise: number; href: string | null };

export type KhataTimeline = {
  /** Newest first, each with the running balance after it. */
  events: KhataEvent[];
  totalCount: number;
  dueInPaise: number;
  /** When the oldest still-unpaid udhaar was given; null if nothing due. */
  dueSince: Date | null;
};

/**
 * A customer's khata: udhaar (bill udhaar, quick udhaar, purana udhaar)
 * and payments, with a running balance that always ends at the true
 * balance. A bill's udhaar is shown as its outstanding plus everything
 * paid against it later, so the running total can't drift from the
 * orders' own figures.
 */
export async function getKhataTimeline(customerDbId: string, limit = 40): Promise<KhataTimeline> {
  const [orders, entries, collections, open] = await Promise.all([
    db.order.findMany({
      where: { customerId: customerDbId },
      select: {
        id: true,
        orderNumber: true,
        createdAt: true,
        outstandingInPaise: true,
        paymentReceipts: {
          select: { id: true, amountInPaise: true, createdAt: true, paymentMethod: true, collectionId: true, note: true },
        },
      },
    }),
    db.khataEntry.findMany({
      where: { customerId: customerDbId },
      select: { id: true, kind: true, amountInPaise: true, note: true, entryDate: true },
    }),
    db.khataCollection.findMany({
      where: { customerId: customerDbId },
      select: { id: true, amountInPaise: true, paymentMethod: true, collectedAt: true, note: true },
    }),
    openKhataItemsOldestFirst(db, customerDbId),
  ]);

  type Raw = Omit<KhataEvent, "balanceInPaise"> & { order: number };
  const raw: Raw[] = [];
  for (const order of orders) {
    const paidLater = order.paymentReceipts.reduce((s, r) => s + r.amountInPaise, 0);
    const udhaar = order.outstandingInPaise + paidLater;
    if (udhaar > 0) {
      raw.push({
        key: `bill:${order.id}`,
        type: "BILL",
        date: order.createdAt,
        amountInPaise: udhaar,
        note: null,
        orderNumber: order.orderNumber,
        paymentMethod: null,
        href: `/admin/orders/${order.orderNumber}`,
        order: 1,
      });
    }
    for (const receipt of order.paymentReceipts) {
      if (receipt.collectionId) continue; // shown once, as its collection
      raw.push({
        key: `receipt:${receipt.id}`,
        type: "PAYMENT",
        date: receipt.createdAt,
        amountInPaise: receipt.amountInPaise,
        note: receipt.note,
        orderNumber: order.orderNumber,
        paymentMethod: receipt.paymentMethod,
        href: `/admin/orders/${order.orderNumber}`,
        order: 2,
      });
    }
  }
  for (const entry of entries) {
    raw.push({
      key: `entry:${entry.id}`,
      type: entry.kind === "OPENING_BALANCE" ? "OPENING" : "UDHAAR",
      date: entry.entryDate,
      amountInPaise: entry.amountInPaise,
      note: entry.kind === "OPENING_BALANCE" ? null : entry.note,
      orderNumber: null,
      paymentMethod: null,
      href: null,
      order: entry.kind === "OPENING_BALANCE" ? 0 : 1,
    });
  }
  for (const c of collections) {
    raw.push({
      key: `collection:${c.id}`,
      type: "PAYMENT",
      date: c.collectedAt,
      amountInPaise: c.amountInPaise,
      note: c.note,
      orderNumber: null,
      paymentMethod: c.paymentMethod,
      href: null,
      order: 2,
    });
  }

  raw.sort((a, b) => a.date.getTime() - b.date.getTime() || a.order - b.order);
  let running = 0;
  const events: KhataEvent[] = raw.map((event) => {
    running += event.type === "PAYMENT" ? -event.amountInPaise : event.amountInPaise;
    return {
      key: event.key,
      type: event.type,
      date: event.date,
      amountInPaise: event.amountInPaise,
      note: event.note,
      orderNumber: event.orderNumber,
      paymentMethod: event.paymentMethod,
      href: event.href,
      balanceInPaise: running,
    };
  });

  return {
    events: events.slice(-limit).reverse(),
    totalCount: events.length,
    dueInPaise: open.reduce((s, i) => s + i.outstandingInPaise, 0),
    dueSince: open.length ? new Date(Math.min(...open.map((i) => i.date.getTime()))) : null,
  };
}
