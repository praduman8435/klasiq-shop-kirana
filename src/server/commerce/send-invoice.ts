import "server-only";
import { getInvoiceForOrder } from "@/server/commerce/invoice";
import { generateInvoicePdf } from "@/server/commerce/invoice-pdf";
import { sendInvoiceOverWhatsApp, type SendInvoiceWhatsAppError } from "@/server/whatsapp/invoice-notification-service";

export type SendInvoiceWhatsAppResult =
  | { success: true }
  | { success: false; error: { type: "NOT_FOUND"; message: string } | SendInvoiceWhatsAppError };

/**
 * Section 3/4 — the ONE shared implementation every "Send Invoice over
 * WhatsApp" entry point calls (Counter Sale Success screen, Admin Order
 * Detail, Admin Invoice page — see
 * `src/server/actions/admin/invoice.ts`/`src/components/admin/send-invoice-whatsapp-button.tsx`).
 * Orchestrates the two already-existing, unchanged pieces this phase
 * reuses rather than reimplements: `getInvoiceForOrder` (Part 2 — the
 * single invoice data model) and `generateInvoicePdf` (Part 2 — the
 * single PDF renderer). Never a second invoice assembly or PDF
 * generation path.
 *
 * Performs NO authorization check of its own — same convention as
 * `getInvoiceForOrder` itself (Part 2): callers must already be
 * authorized. The only caller in this codebase is the admin Server
 * Action (`getAdminSession()`-gated); there is no customer-portal call
 * site — see docs/PHASE_3_6_6_REPORT.md Part 3 "Customer Portal" for why
 * a customer-facing send action was deliberately not built, and what an
 * ownership-scoped version would need to look like if one ever is.
 */
export async function sendInvoiceWhatsApp(orderNumber: string): Promise<SendInvoiceWhatsAppResult> {
  const invoice = await getInvoiceForOrder(orderNumber);
  if (!invoice) {
    return { success: false, error: { type: "NOT_FOUND", message: "Order not found." } };
  }

  const pdf = await generateInvoicePdf(invoice);
  return sendInvoiceOverWhatsApp(invoice, pdf);
}
