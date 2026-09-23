import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { InvoiceActions } from "@/components/invoice/invoice-actions";
import { InvoiceView } from "@/components/invoice/invoice-view";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { getInvoiceForAuthenticatedCustomer } from "@/server/queries/customer-portal/invoice";

type PageProps = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Invoice — ${orderNumber}`, robots: { index: false, follow: false } };
}

/**
 * Phase 3.6.6 Part 2 — the Customer Portal invoice page (section 7).
 * Deliberately lives OUTSIDE `(site)/track/(protected)/`, so it never
 * inherits `(site)/layout.tsx`'s storefront header/footer — section 5's
 * "no navigation" holds on screen, not just at print time. This means it
 * re-implements the same `getCustomerSession()` gate
 * `(site)/track/(protected)/layout.tsx` already applies to every other
 * portal page (see that layout's own doc comment for why a standalone
 * page can never simply inherit a layout's gate).
 *
 * Authorization is delegated entirely to
 * `getInvoiceForAuthenticatedCustomer` (src/server/queries/customer-portal/invoice.ts)
 * — a syntactically valid order number belonging to a different customer
 * 404s here exactly like one that doesn't exist at all, mirroring
 * `TrackOrderDetailPage`'s own identical `notFound()` shape.
 */
export default async function TrackInvoicePage({ params }: PageProps) {
  const session = await getCustomerSession();
  if (!session) redirect("/track");
  if (!session.customer) notFound();

  const { orderNumber } = await params;
  const invoice = await getInvoiceForAuthenticatedCustomer(orderNumber, session.customer.id);
  if (!invoice) notFound();

  return (
    // Storefront chrome (`.store-theme`) around the invoice, matching
    // every other customer-portal screen — this standalone route sits
    // outside the `(site)` layout, so it applies the scope itself.
    // `InvoiceView` stays a fixed light "paper" document, deliberately
    // never theme-aware and shared unchanged with the Admin invoice page.
    <div className="store-theme min-h-screen bg-background px-4 py-10 text-foreground print:bg-white print:p-0">
      <InvoiceActions
        backHref={`/track/orders/${orderNumber}`}
        backLabel="Back to Order"
        downloadHref={`/api/track/orders/${orderNumber}/invoice`}
        downloadFileName={`Invoice-${orderNumber}.pdf`}
      />
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-sm border border-foreground bg-white print:rounded-none print:border-0 print:shadow-none">
        <InvoiceView invoice={invoice} />
      </div>

      <div className="mx-auto mt-4 w-full max-w-2xl print:hidden">
        <Button
          render={<Link href="/" />}
          nativeButton={false}
          variant="ghost"
          className="h-10 w-full text-muted-foreground sm:w-auto"
        >
          Continue Shopping
        </Button>
      </div>
    </div>
  );
}
