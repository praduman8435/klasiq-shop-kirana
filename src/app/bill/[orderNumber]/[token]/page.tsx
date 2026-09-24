import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import { PrintBillButton } from "@/components/invoice/print-bill-button";
import { parseInvoiceDesign } from "@/lib/invoice-model";
import { getInvoiceForOrder } from "@/server/commerce/invoice";
import { getOrderByNumberAndToken } from "@/server/queries/orders";

type PageProps = {
  params: Promise<{ orderNumber: string; token: string }>;
  searchParams: Promise<{ design?: string }>;
};

export const metadata: Metadata = { title: "Your bill", robots: { index: false, follow: false } };

/**
 * The bill a customer opens from the shop's WhatsApp message. No login:
 * the link carries the order's unguessable access token (the same check
 * as the order page), and `?design=` picks the layout the shop chose.
 */
export default async function CustomerBillPage({ params, searchParams }: PageProps) {
  const { orderNumber, token } = await params;
  const { design } = await searchParams;
  const order = await getOrderByNumberAndToken(orderNumber, token);
  if (!order) notFound();
  const invoice = await getInvoiceForOrder(orderNumber);
  if (!invoice) notFound();

  return (
    <div className="min-h-screen bg-neutral-100 px-3 py-6 sm:px-6 print:bg-white print:p-0">
      <div className="mx-auto mb-4 flex max-w-2xl justify-end print:hidden">
        <PrintBillButton />
      </div>
      <InvoiceDocument invoice={invoice} design={parseInvoiceDesign(design)} />
    </div>
  );
}
