import { getCustomerSession } from "@/lib/customer-portal/session";
import { getInvoiceForAuthenticatedCustomer } from "@/server/queries/customer-portal/invoice";
import { generateInvoicePdf } from "@/server/commerce/invoice-pdf";

export const runtime = "nodejs";

/**
 * Section 6/7 — Customer Portal PDF download, ownership-scoped via
 * `getInvoiceForAuthenticatedCustomer`. A syntactically valid order
 * number belonging to a DIFFERENT customer 404s here exactly like one
 * that doesn't exist at all — never a distinguishable error, mirroring
 * every other customer-portal IDOR boundary in this codebase.
 */
export async function GET(_request: Request, context: { params: Promise<{ orderNumber: string }> }) {
  const session = await getCustomerSession();
  if (!session?.customer) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { orderNumber } = await context.params;
  const invoice = await getInvoiceForAuthenticatedCustomer(orderNumber, session.customer.id);
  if (!invoice) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const pdf = await generateInvoicePdf(invoice);
    return new Response(new Uint8Array(pdf), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="Invoice-${orderNumber}.pdf"`,
        "Content-Length": String(pdf.length),
      },
    });
  } catch (err) {
    console.error(
      "track invoice route: PDF generation failed",
      err instanceof Error ? err.message : String(err),
    );
    return new Response("Could not generate invoice.", { status: 500 });
  }
}
