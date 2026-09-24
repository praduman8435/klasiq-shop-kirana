import { z } from "zod";

/** The payment methods a shopkeeper actually uses, as one-tap chips. The
 * full enum (CARD/OTHER) stays available on the detailed forms. */
export const QUICK_PAYMENT_METHODS = ["CASH", "UPI", "BANK_TRANSFER", "CHEQUE"] as const;

const amount = z.coerce
  .number({ error: "Enter an amount." })
  .positive("Enter an amount more than ₹0.")
  .max(10_000_000, "That amount looks too large.");

const photoId = z.string().regex(/^[a-z0-9]{1,40}$/);

/** "Maal aaya" — one bill, entered in a few taps. */
export const quickBillSchema = z
  .object({
    supplierId: z.string().min(1),
    amountInRupees: amount,
    billDate: z.coerce.date(),
    billNumber: z.string().trim().max(60).optional(),
    note: z.string().trim().max(300).optional(),
    photoIds: z.array(photoId).max(5).default([]),
    paid: z.enum(["NONE", "FULL", "PART"]),
    paidAmountInRupees: z.coerce.number().min(0).optional(),
    paymentMethod: z.enum(QUICK_PAYMENT_METHODS).default("CASH"),
  })
  .refine((v) => v.paid !== "PART" || (v.paidAmountInRupees ?? 0) > 0, {
    message: "Enter how much you paid.",
    path: ["paidAmountInRupees"],
  })
  .refine((v) => v.paid !== "PART" || (v.paidAmountInRupees ?? 0) <= v.amountInRupees, {
    message: "Paid amount can't be more than the bill.",
    path: ["paidAmountInRupees"],
  });

/** "Paisa diya" — the shop pays a supplier; split across unpaid bills
 * oldest first on the server. */
export const quickPaymentSchema = z.object({
  supplierId: z.string().min(1),
  amountInRupees: amount,
  paymentDate: z.coerce.date(),
  paymentMethod: z.enum(QUICK_PAYMENT_METHODS),
  /** Who on the supplier's side took the money; the supplier's own name
   * when left empty. */
  givenTo: z.string().trim().max(120).optional(),
  reference: z.string().trim().max(120).optional(),
  note: z.string().trim().max(300).optional(),
});

/** Add supplier: name and phone up front, everything else optional, plus
 * what the shop already owes them ("purana baaki"). */
export const quickSupplierSchema = z.object({
  name: z.string().trim().min(2, "Enter the supplier's name.").max(120),
  phone: z.string().trim().max(20).optional(),
  businessName: z.string().trim().max(120).optional(),
  city: z.string().trim().max(80).optional(),
  addressLine: z.string().trim().max(200).optional(),
  gstNumber: z.string().trim().max(20).optional(),
  notes: z.string().trim().max(500).optional(),
  openingBalanceInRupees: z.coerce.number().min(0).max(10_000_000).optional(),
});
