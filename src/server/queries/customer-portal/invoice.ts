import { db } from "@/lib/db";
import { getInvoiceForOrder, type Invoice } from "@/server/commerce/invoice";

/**
 * Section 10 — "Customer Portal should only access invoices belonging to
 * the authenticated customer." Mirrors `getOrderForAuthenticatedCustomer`'s
 * exact shape (src/server/queries/customer-portal/orders.ts): ownership
 * is checked in the SAME query that resolves the order — `customerId` is
 * part of the `WHERE` clause itself, not a check applied after an
 * unscoped fetch. A syntactically valid `orderNumber` belonging to a
 * DIFFERENT customer returns `null`, structurally identical to "this
 * order doesn't exist at all" — a caller (and anyone probing it) can
 * never tell the two apart. `customerId` must come from the caller's own
 * already-verified `CustomerSession`, never from a client-supplied value
 * — this function has no other way to select whose invoice it returns,
 * which is the entire authorization boundary.
 *
 * Delegates the ACTUAL invoice assembly to `getInvoiceForOrder`
 * (src/server/commerce/invoice.ts) completely unchanged — never a
 * second, duplicate invoice-calculation path (section 7). This function
 * adds ownership scoping only; it computes nothing about the invoice
 * itself.
 */
export async function getInvoiceForAuthenticatedCustomer(
  orderNumber: string,
  customerId: string,
): Promise<Invoice | null> {
  const owned = await db.order.findFirst({
    where: { orderNumber, customerId },
    select: { orderNumber: true },
  });
  if (!owned) return null;

  return getInvoiceForOrder(orderNumber);
}
