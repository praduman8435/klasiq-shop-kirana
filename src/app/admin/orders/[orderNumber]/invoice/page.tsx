import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { INVOICE_DESIGN_COOKIE, InvoiceWorkspace } from "@/components/invoice/invoice-workspace";
import { getAdminSession } from "@/lib/admin/session";
import { db } from "@/lib/db";
import { INVOICE_DESIGNS, parseInvoiceDesign } from "@/lib/invoice-model";
import { SITE_URL } from "@/lib/site-config";
import { getInvoiceForOrder } from "@/server/commerce/invoice";

type PageProps = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ print?: string; design?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Bill — ${orderNumber}`, robots: { index: false, follow: false } };
}

/**
 * Admin bill screen (outside the admin shell, so nothing but the bill
 * prints): choose a design, print it, or send the customer a WhatsApp
 * link to it. The link is the order's own unguessable access token, the
 * same capability the customer's order page already uses.
 */
export default async function AdminInvoicePage({ params, searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const { orderNumber } = await params;
  const { print, design } = await searchParams;
  const [invoice, order] = await Promise.all([
    getInvoiceForOrder(orderNumber),
    db.order.findUnique({ where: { orderNumber }, select: { accessToken: true } }),
  ]);
  if (!invoice || !order) notFound();

  const requested = INVOICE_DESIGNS.find((d) => d === design);
  const saved = (await cookies()).get(INVOICE_DESIGN_COOKIE)?.value;

  return (
    <div className="dark">
      <InvoiceWorkspace
        invoice={invoice}
        publicUrl={`${SITE_URL}/bill/${orderNumber}/${order.accessToken}`}
        backHref={`/admin/orders/${orderNumber}`}
        pdfHref={`/admin/orders/${orderNumber}/invoice/download`}
        autoPrint={print === "1"}
        initialDesign={requested ?? parseInvoiceDesign(saved)}
      />
    </div>
  );
}
