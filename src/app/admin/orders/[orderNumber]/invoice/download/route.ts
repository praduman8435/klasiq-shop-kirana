import { getAdminSession } from "@/lib/admin/session";
import { getInvoiceForOrder } from "@/server/commerce/invoice";
import { generateInvoicePdf } from "@/server/commerce/invoice-pdf";

export const runtime = "nodejs";

/**
 * Section 6/8 — Admin PDF download. Requires its own `getAdminSession()`
 * check: Route Handlers are never covered by a parent `layout.tsx`'s
 * gate (see `admin/(protected)/layout.tsx`'s own doc comment) — this is
 * the enforcement point for this specific request.
 *
 * Lives under /admin (it used to be /api/admin/…) because the admin
 * session cookie is scoped to the /admin path: the browser never sent it
 * to /api/admin, so every download failed with 401 even when signed in.
 */
export async function GET(_request: Request, context: { params: Promise<{ orderNumber: string }> }) {
  const admin = await getAdminSession();
  if (!admin) {
    return new Response("Unauthorized", { status: 401 });
  }

  const { orderNumber } = await context.params;
  const invoice = await getInvoiceForOrder(orderNumber);
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
      "admin invoice route: PDF generation failed",
      err instanceof Error ? err.message : String(err),
    );
    return new Response("Could not generate invoice.", { status: 500 });
  }
}
