import { db } from "@/lib/db";
import { openKhataItemsOldestFirst } from "@/server/khatabook/quick-khata";

/** A KhataBook customer by their customer code, with what they owe now. */
export async function getKhataCustomerWithDue(customerCode: string) {
  const customer = await db.customer.findUnique({
    where: { customerId: customerCode },
    select: { id: true, customerId: true, displayName: true },
  });
  if (!customer) return null;
  const open = await openKhataItemsOldestFirst(db, customer.id);
  return { ...customer, dueInPaise: open.reduce((s, i) => s + i.outstandingInPaise, 0) };
}
