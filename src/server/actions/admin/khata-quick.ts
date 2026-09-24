"use server";

import { revalidatePath } from "next/cache";
import { getAdminSession } from "@/lib/admin/session";
import { collectionSchema, khataCustomerSchema, udhaarSchema } from "@/lib/validation/admin-khata-quick";
import { KhataError, createKhataCustomer, recordCollection, recordUdhaar } from "@/server/khatabook/quick-khata";

type Failure = { success: false; message: string };
const SIGN_IN_AGAIN: Failure = { success: false, message: "Please sign in again." };

function firstIssue(error: { issues: { message: string }[] }): Failure {
  return { success: false, message: error.issues[0]?.message ?? "Please check the form." };
}

function revalidateKhata(customerId: string) {
  revalidatePath("/admin/khatabook");
  revalidatePath(`/admin/khatabook/${customerId}`);
  revalidatePath("/admin/orders");
}

async function run<T>(fn: () => Promise<T>): Promise<T | Failure> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof KhataError) return { success: false, message: error.message };
    throw error;
  }
}

export async function recordUdhaarAction(input: unknown): Promise<{ success: true } | Failure> {
  const admin = await getAdminSession();
  if (!admin) return SIGN_IN_AGAIN;
  const parsed = udhaarSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  return run(async () => {
    await recordUdhaar(parsed.data, admin);
    revalidateKhata(parsed.data.customerId);
    return { success: true as const };
  });
}

export async function recordCollectionAction(
  input: unknown,
): Promise<{ success: true; dueAfterInPaise: number } | Failure> {
  const admin = await getAdminSession();
  if (!admin) return SIGN_IN_AGAIN;
  const parsed = collectionSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  return run(async () => {
    const result = await recordCollection(parsed.data, admin);
    revalidateKhata(parsed.data.customerId);
    return { success: true as const, dueAfterInPaise: result.dueAfterInPaise };
  });
}

export async function createKhataCustomerAction(
  input: unknown,
): Promise<{ success: true; customerId: string; existed: boolean } | Failure> {
  const admin = await getAdminSession();
  if (!admin) return SIGN_IN_AGAIN;
  const parsed = khataCustomerSchema.safeParse(input);
  if (!parsed.success) return firstIssue(parsed.error);
  return run(async () => {
    const result = await createKhataCustomer(parsed.data, admin);
    revalidatePath("/admin/khatabook");
    return { success: true as const, ...result };
  });
}
