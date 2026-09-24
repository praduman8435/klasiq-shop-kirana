import { z } from "zod";
import { KHATA_PAYMENT_METHODS } from "@/lib/khata";

const amount = z.coerce
  .number({ error: "Enter an amount." })
  .positive("Enter an amount more than ₹0.")
  .max(1_000_000, "That amount looks too large.");

/** "Udhaar diya" */
export const udhaarSchema = z.object({
  customerId: z.string().min(1),
  amountInRupees: amount,
  note: z.string().trim().max(200).optional(),
  entryDate: z.coerce.date(),
});

/** "Paisa mila" */
export const collectionSchema = z.object({
  customerId: z.string().min(1),
  amountInRupees: amount,
  paymentMethod: z.enum(KHATA_PAYMENT_METHODS),
  note: z.string().trim().max(200).optional(),
  collectedAt: z.coerce.date(),
});

/** Add customer to KhataBook */
export const khataCustomerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(120),
  phone: z.string().trim().min(1, "Enter the mobile number.").max(20),
  openingBalanceInRupees: z.coerce.number().min(0).max(1_000_000).optional(),
});

/** /admin/khatabook tabs, search and page */
export const khataListParamsSchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).catch(1),
  tab: z.enum(["DUE", "COLLECT", "ALL"]).catch("DUE"),
});
