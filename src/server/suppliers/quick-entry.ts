import "server-only";
import type { Prisma, SupplierPaymentMethod } from "@prisma/client";
import { db } from "@/lib/db";
import { rupeesToPaise } from "@/lib/money";
import { OPENING_BALANCE_REFERENCE, allocateOldestFirst, startOfDayInIndia } from "@/lib/supplier-balance";
import { billPhotoUrl } from "@/server/supplier-bill-photos";

/**
 * The simple supplier flows — "New bill (Maal aaya)", "Pay (Paisa diya)",
 * "Add supplier" — written on top of the SAME records the detailed
 * Phase 4 screens use (SupplierPurchase + bill, SupplierPayment +
 * PaymentAllocation), so the ledger, purchase and payment pages all keep
 * working unchanged. Each write locks the supplier row first, so two
 * payments saved at the same moment can't both allocate the same unpaid
 * bill.
 */

type Tx = Prisma.TransactionClient;

export class QuickEntryError extends Error {}

async function lockSupplier(tx: Tx, supplierId: string) {
  const rows = await tx.$queryRaw<{ id: string; name: string }[]>`
    SELECT id, name FROM "suppliers" WHERE id = ${supplierId} FOR UPDATE`;
  if (rows.length === 0) throw new QuickEntryError("Supplier not found.");
  return rows[0];
}

/** Unpaid bills, oldest first, with what's still due on each — the
 * order a payment is split in. Also used read-only by the Pay page to
 * preview which bills a payment will clear. */
export async function openBillsOldestFirst(tx: Tx, supplierId: string) {
  const purchases = await tx.supplierPurchase.findMany({
    where: { supplierId },
    orderBy: [{ purchaseDate: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      purchaseDate: true,
      reference: true,
      totalInPaise: true,
      allocations: { select: { amountInPaise: true } },
      creditAllocations: { select: { amountInPaise: true } },
    },
  });
  return purchases
    .map((p) => ({
      id: p.id,
      purchaseDate: p.purchaseDate,
      reference: p.reference,
      outstandingInPaise:
        p.totalInPaise -
        p.allocations.reduce((s, a) => s + a.amountInPaise, 0) -
        p.creditAllocations.reduce((s, a) => s + a.amountInPaise, 0),
    }))
    .filter((p) => p.outstandingInPaise > 0);
}

export type QuickBillInput = {
  supplierId: string;
  amountInRupees: number;
  billDate: Date;
  billNumber?: string;
  note?: string;
  photoIds: string[];
  paid: "NONE" | "FULL" | "PART";
  paidAmountInRupees?: number;
  paymentMethod: SupplierPaymentMethod;
};

/** One bill, optionally with what was paid on the spot — both saved
 * together, the payment allocated straight to this bill. */
export async function recordQuickBill(input: QuickBillInput, admin: { id: string }) {
  const amountInPaise = rupeesToPaise(input.amountInRupees);
  const paidInPaise =
    input.paid === "FULL" ? amountInPaise : input.paid === "PART" ? rupeesToPaise(input.paidAmountInRupees ?? 0) : 0;
  if (paidInPaise > amountInPaise) throw new QuickEntryError("Paid amount can't be more than the bill.");

  return db.$transaction(async (tx) => {
    const supplier = await lockSupplier(tx, input.supplierId);

    const photoCount = input.photoIds.length
      ? await tx.supplierBillPhoto.count({ where: { id: { in: input.photoIds } } })
      : 0;
    if (photoCount !== input.photoIds.length) throw new QuickEntryError("A bill photo is missing. Please add it again.");

    const purchase = await tx.supplierPurchase.create({
      data: {
        supplierId: supplier.id,
        purchaseDate: input.billDate,
        reference: input.billNumber || null,
        notes: input.note || null,
        totalInPaise: amountInPaise,
        bills: {
          create: {
            billNumber: input.billNumber || null,
            billDate: input.billDate,
            amountInPaise,
            attachments: {
              create: input.photoIds.map((id, i) => ({
                url: billPhotoUrl(id),
                originalFilename: input.photoIds.length > 1 ? `Bill photo ${i + 1}` : "Bill photo",
              })),
            },
          },
        },
      },
      select: { id: true },
    });

    let paymentId: string | null = null;
    if (paidInPaise > 0) {
      const payment = await tx.supplierPayment.create({
        data: {
          supplierId: supplier.id,
          paymentDate: input.billDate,
          amountInPaise: paidInPaise,
          paymentMethod: input.paymentMethod,
          collectedByName: supplier.name,
          notes: "Paid with the bill",
          createdByAdminUserId: admin.id,
          allocations: { create: { purchaseId: purchase.id, amountInPaise: paidInPaise } },
        },
        select: { id: true },
      });
      paymentId = payment.id;
    }

    return { purchaseId: purchase.id, paymentId };
  });
}

export type QuickPaymentInput = {
  supplierId: string;
  amountInRupees: number;
  paymentDate: Date;
  paymentMethod: SupplierPaymentMethod;
  givenTo?: string;
  reference?: string;
  note?: string;
};

/** A payment to a supplier, split across their unpaid bills oldest
 * first; any extra stays as an advance with the supplier. */
export async function recordQuickPayment(input: QuickPaymentInput, admin: { id: string }) {
  const amountInPaise = rupeesToPaise(input.amountInRupees);

  return db.$transaction(async (tx) => {
    const supplier = await lockSupplier(tx, input.supplierId);
    const { allocations, advanceInPaise } = allocateOldestFirst(
      amountInPaise,
      await openBillsOldestFirst(tx, supplier.id),
    );

    const payment = await tx.supplierPayment.create({
      data: {
        supplierId: supplier.id,
        paymentDate: input.paymentDate,
        amountInPaise,
        paymentMethod: input.paymentMethod,
        collectedByName: input.givenTo || supplier.name,
        reference: input.reference || null,
        notes: input.note || null,
        createdByAdminUserId: admin.id,
        allocations: { create: allocations },
      },
      select: { id: true },
    });

    return { paymentId: payment.id, billsPaidCount: allocations.length, advanceInPaise };
  });
}

export type QuickSupplierInput = {
  name: string;
  phone?: string;
  businessName?: string;
  city?: string;
  addressLine?: string;
  gstNumber?: string;
  notes?: string;
  openingBalanceInRupees?: number;
};

/** Adds a supplier; an opening balance ("purana baaki") becomes one bill
 * dated at the start of today, so it shows up in the khata like any
 * other and is the first thing a payment clears. */
export async function createQuickSupplier(input: QuickSupplierInput, now: Date = new Date()) {
  const openingInPaise = rupeesToPaise(input.openingBalanceInRupees ?? 0);
  const openingDate = startOfDayInIndia(now);
  return db.$transaction(async (tx) => {
    const supplier = await tx.supplier.create({
      data: {
        name: input.name,
        phone: input.phone || null,
        businessName: input.businessName || null,
        city: input.city || null,
        addressLine: input.addressLine || null,
        gstNumber: input.gstNumber || null,
        notes: input.notes || null,
      },
      select: { id: true },
    });
    if (openingInPaise > 0) {
      await tx.supplierPurchase.create({
        data: {
          supplierId: supplier.id,
          purchaseDate: openingDate,
          reference: OPENING_BALANCE_REFERENCE,
          notes: "Amount already owed when the supplier was added (purana baaki).",
          totalInPaise: openingInPaise,
          bills: { create: { billNumber: OPENING_BALANCE_REFERENCE, billDate: openingDate, amountInPaise: openingInPaise } },
        },
      });
    }
    return supplier;
  });
}
