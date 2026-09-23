"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Download, Printer } from "lucide-react";
import { SendInvoiceWhatsAppButton } from "@/components/admin/send-invoice-whatsapp-button";

/**
 * The on-screen actions row for an invoice page — hidden entirely at
 * print time (`print:hidden`) so section 5's "no unnecessary buttons"
 * holds for the actual printed/PDF-saved output, while still being fully
 * available on screen. Shared by both the Admin and Customer Portal
 * invoice pages.
 *
 * `autoPrint` drives the Admin Order Detail page's own "Print" quick
 * action (section 8): that link navigates straight here with
 * `?print=1`, and this component fires `window.print()` once on mount
 * — resolved from the Server Component page's own `searchParams` prop,
 * never `useSearchParams()`, so no Suspense boundary is needed.
 *
 * `orderNumber`, when passed, additionally renders the shared "Send via
 * WhatsApp" button (Phase 3.6.6 Part 3, section 3/8) — passed ONLY by
 * the Admin invoice page, never the Customer Portal one (see
 * docs/PHASE_3_6_6_REPORT.md Part 3 "Customer Portal" for why). Omitting
 * this prop, as the Customer Portal page does, is what keeps this shared
 * component's admin-only capability admin-only, without a second,
 * near-duplicate component.
 */
export function InvoiceActions({
  backHref,
  backLabel,
  downloadHref,
  downloadFileName,
  autoPrint,
  orderNumber,
}: {
  backHref: string;
  backLabel: string;
  downloadHref: string;
  downloadFileName: string;
  autoPrint?: boolean;
  orderNumber?: string;
}) {
  useEffect(() => {
    if (autoPrint) window.print();
    // Fires exactly once, on mount — never on a later re-render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="mx-auto mb-6 flex w-full max-w-2xl flex-wrap items-center justify-between gap-3 print:hidden">
      <Link
        href={backHref}
        className="flex h-10 items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {backLabel}
      </Link>
      {/* `flex-wrap` here (not just on the outer row) is the actual
          320px fix — three buttons plus the back link never fit one row
          under ~360px, and without their own wrap they pushed the whole
          page into horizontal overflow instead of dropping to a second
          line. */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => window.print()}
          className="flex h-10 items-center gap-1.5 rounded-lg border bg-card px-3.5 text-sm font-medium hover:bg-muted"
        >
          <Printer className="size-4" aria-hidden />
          Print
        </button>
        <a
          href={downloadHref}
          download={downloadFileName}
          className="flex h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
        >
          <Download className="size-4" aria-hidden />
          Download PDF
        </a>
        {orderNumber && (
          <SendInvoiceWhatsAppButton orderNumber={orderNumber} className="h-10 bg-card px-3.5" />
        )}
      </div>
    </div>
  );
}
