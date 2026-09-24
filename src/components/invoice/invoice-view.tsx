import { InvoiceDocument } from "@/components/invoice/invoice-document";
import type { Invoice } from "@/server/commerce/invoice";

/**
 * The customer portal's invoice: the Classic bill design, the same one
 * the shop prints by default. Kept as its own export so the portal page
 * doesn't need to know about designs.
 */
export function InvoiceView({ invoice }: { invoice: Invoice }) {
  return <InvoiceDocument invoice={invoice} design="classic" />;
}
