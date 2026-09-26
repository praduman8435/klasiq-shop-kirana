"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { rupeesToPaise } from "@/lib/money";
import { PaymentClaimError, createKhataPaymentClaim } from "@/server/khatabook/payment-claims";

type Failure = { success: false; message: string };

const claimSchema = z.object({
  amountInRupees: z.coerce
    .number({ message: "Enter the amount you paid." })
    .positive("Enter the amount you paid.")
    .max(10_00_000, "That amount looks too large.")
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, "Use at most 2 decimals."),
  upiReference: z
    .string()
    .trim()
    .max(40, "That reference looks too long.")
    .regex(/^[A-Za-z0-9 -]*$/, "Use only letters and numbers for the reference.")
    .optional(),
});

/** "I've paid" on Mera Khata. Nothing in the khata changes until the shop
 * finds the money in its UPI app and confirms it. */
export async function claimKhataPaymentAction(input: unknown): Promise<{ success: true } | Failure> {
  const session = await getCustomerSession();
  if (!session?.customer) return { success: false, message: "Please enter your mobile number again." };
  const parsed = claimSchema.safeParse(input);
  if (!parsed.success) return { success: false, message: parsed.error.issues[0]?.message ?? "Please check the amount." };

  try {
    await createKhataPaymentClaim({
      customerDbId: session.customer.id,
      amountInPaise: rupeesToPaise(parsed.data.amountInRupees),
      upiReference: parsed.data.upiReference,
    });
  } catch (error) {
    if (error instanceof PaymentClaimError) return { success: false, message: error.message };
    throw error;
  }
  revalidatePath("/track/khata");
  revalidatePath("/admin/khatabook");
  revalidatePath("/admin");
  return { success: true };
}
