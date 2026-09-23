import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { InvoiceActions } from "@/components/invoice/invoice-actions";
import { InvoiceView } from "@/components/invoice/invoice-view";
import { getAdminSession } from "@/lib/admin/session";
import { getInvoiceForOrder } from "@/server/commerce/invoice";

type PageProps = {
  params: Promise<{ orderNumber: string }>;
  searchParams: Promise<{ print?: string }>;
};

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: `Invoice — ${orderNumber}`, robots: { index: false, follow: false } };
}

/**
 * Phase 3.6.6 Part 2 — the Admin invoice page (section 8). Deliberately
 * lives OUTSIDE `admin/(protected)/`, so it never inherits `AdminShell`'s
 * sidebar/topbar chrome — section 5's "no navigation, no admin chrome"
 * is satisfied on screen, not just at print time, by construction rather
 * than by CSS hiding a layout that's still technically there. This means
 * it re-implements the same `getAdminSession()` gate
 * `admin/(protected)/layout.tsx` already applies to every other admin
 * page — see that layout's own doc comment for why a Route
 * Handler/standalone page can never simply inherit a layout's gate.
 */
export default async function AdminInvoicePage({ params, searchParams }: PageProps) {
  const admin = await getAdminSession();
  if (!admin) redirect("/admin/login");

  const { orderNumber } = await params;
  const { print } = await searchParams;
  const invoice = await getInvoiceForOrder(orderNumber);
  if (!invoice) notFound();

  return (
    // Dark Klasiq workspace around the invoice, matching the Orders/
    // Counter Sale admin system — mirrors the Customer Portal invoice
    // page's own identical wrapper (src/app/track/orders/[orderNumber]/
    // invoice/page.tsx), which already proves `InvoiceActions` renders
    // correctly against this dark scope unmodified. `InvoiceView` itself
    // stays exactly as it was: a fixed light "paper" document, never
    // theme-aware (see that component's own doc comment) and shared
    // unchanged with the Customer Portal invoice page. This wrapper is
    // the ONLY thing that changed; the document an admin prints or
    // downloads is byte-for-byte the same as before. `dark` is
    // hardcoded (not `isDarkRoute`-conditional) — this standalone route
    // (outside `admin/(protected)/`, so no `AdminShell`) has no light
    // variant to fall back to.
    <div className="dark min-h-screen bg-background px-4 py-10 text-foreground print:bg-white print:p-0">
      <InvoiceActions
        backHref={`/admin/orders/${orderNumber}`}
        backLabel="Back to Order"
        downloadHref={`/api/admin/orders/${orderNumber}/invoice`}
        downloadFileName={`Invoice-${orderNumber}.pdf`}
        autoPrint={print === "1"}
        orderNumber={orderNumber}
      />
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-lg shadow-black/30 print:rounded-none print:shadow-none">
        <InvoiceView invoice={invoice} />
      </div>
    </div>
  );
}
