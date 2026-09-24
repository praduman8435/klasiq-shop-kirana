"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { ArrowLeft, Check, Copy, Download, MessageCircle, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { InvoiceDocument } from "@/components/invoice/invoice-document";
import {
  INVOICE_DESIGN_INFO,
  INVOICE_DESIGNS,
  buildInvoiceModel,
  buildInvoiceShareText,
  type InvoiceDesign,
} from "@/lib/invoice-model";
import { whatsAppLink } from "@/lib/supplier-statement";
import { cn } from "@/lib/utils";
import type { Invoice } from "@/server/commerce/invoice";

/** The last design picked on this device, read by the page on the server
 * (so the right design renders first time, with no flash). */
export const INVOICE_DESIGN_COOKIE = "klasiq_invoice_design";

function rememberDesign(design: InvoiceDesign) {
  document.cookie = `${INVOICE_DESIGN_COOKIE}=${design}; path=/admin; max-age=31536000; samesite=lax`;
}

/**
 * The admin bill screen: pick one of four designs (remembered on this
 * device), see it live, then print it, send the customer a WhatsApp link
 * to it, copy the link, or download the PDF.
 */
export function InvoiceWorkspace({
  invoice,
  publicUrl,
  backHref,
  pdfHref,
  autoPrint,
  initialDesign,
}: {
  invoice: Invoice;
  /** The customer's link to this bill, without the design parameter. */
  publicUrl: string;
  backHref: string;
  pdfHref: string;
  autoPrint: boolean;
  /** ?design= if the link asked for one, else this device's last choice. */
  initialDesign: InvoiceDesign;
}) {
  const [design, setDesign] = useState<InvoiceDesign>(initialDesign);
  const [copied, setCopied] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    if (!autoPrint || printed.current) return;
    printed.current = true;
    const timer = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(timer);
  }, [autoPrint]);

  function choose(next: InvoiceDesign) {
    setDesign(next);
    rememberDesign(next);
  }

  const link = `${publicUrl}?design=${design}`;
  const phone = invoice.customerWhatsapp || invoice.customerMobile;
  const share = whatsAppLink(phone, buildInvoiceShareText(buildInvoiceModel(invoice), link));

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy. Long-press the link instead.");
    }
  }

  return (
    <div className="min-h-screen bg-background text-foreground print:bg-white">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-6 lg:flex-row lg:items-start print:block print:p-0">
        <aside className="flex flex-col gap-5 lg:sticky lg:top-6 lg:w-72 lg:shrink-0 print:hidden">
          <Link href={backHref} className="inline-flex h-9 w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="size-4" aria-hidden />
            Back to order
          </Link>

          <fieldset>
            <legend className="mb-2 text-sm font-semibold">Bill design</legend>
            <div className="grid grid-cols-2 gap-2">
              {INVOICE_DESIGNS.map((d) => (
                <button
                  key={d}
                  type="button"
                  aria-pressed={design === d}
                  onClick={() => choose(d)}
                  className={cn(
                    "flex flex-col items-start gap-1.5 rounded-lg border p-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    design === d ? "border-primary bg-primary/10" : "border-border hover:bg-secondary/40",
                  )}
                >
                  <DesignThumb design={d} />
                  <span className="text-sm font-medium">{INVOICE_DESIGN_INFO[d].name}</span>
                  <span className="text-xs text-muted-foreground">{INVOICE_DESIGN_INFO[d].hint}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <div className="flex flex-col gap-2">
            <Button type="button" className="h-11" onClick={() => window.print()}>
              <Printer className="size-4" aria-hidden />
              Print bill
            </Button>
            <Button render={<a href={share} target="_blank" rel="noopener noreferrer" />} nativeButton={false} variant="outline" className="h-11">
              <MessageCircle className="size-4" aria-hidden />
              Send on WhatsApp
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-10" onClick={copyLink}>
                {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                {copied ? "Copied" : "Copy link"}
              </Button>
              <Button render={<a href={pdfHref} download={`Bill-${invoice.orderNumber}.pdf`} />} nativeButton={false} variant="outline" className="h-10">
                <Download className="size-4" aria-hidden />
                PDF
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">
              WhatsApp sends the customer a link to this bill in the design you picked. They can open, print or save it.
              {design === "thermal" && " Thermal prints on an 80 mm roll: pick your receipt printer in the print window."}
            </p>
          </div>
        </aside>

        <main className="min-w-0 flex-1 rounded-2xl bg-neutral-100 p-3 sm:p-6 print:rounded-none print:bg-white print:p-0">
          <InvoiceDocument invoice={invoice} design={design} />
        </main>
      </div>
    </div>
  );
}

/** A tiny drawing of each design, so the choice is visual, not just a word. */
function DesignThumb({ design }: { design: InvoiceDesign }) {
  const line = "h-1 rounded-full bg-neutral-300";
  if (design === "thermal") {
    return (
      <span aria-hidden className="flex h-14 w-full items-center justify-center rounded-md bg-neutral-100">
        <span className="flex h-12 w-7 flex-col gap-1 bg-white p-1">
          <span className="h-1 w-4 self-center rounded-full bg-neutral-500" />
          <span className="border-t border-dashed border-neutral-300" />
          <span className={line} />
          <span className={line} />
          <span className="mt-auto h-1 rounded-full bg-neutral-600" />
        </span>
      </span>
    );
  }
  return (
    <span aria-hidden className="flex h-14 w-full items-center justify-center rounded-md bg-neutral-100">
      <span className="flex h-12 w-10 flex-col gap-1 overflow-hidden bg-white">
        {design === "modern" ? (
          <span className="h-3 bg-[oklch(0.54_0.21_27)]" />
        ) : (
          <span className={cn("mx-1 mt-1 h-1.5 w-5 rounded-full", design === "minimal" ? "bg-neutral-900" : "bg-neutral-500")} />
        )}
        <span className={cn("mx-1", line)} />
        <span className={cn("mx-1", line)} />
        <span className={cn("mx-1", line)} />
        <span className={cn("mx-1 mt-auto mb-1 h-1 w-4 self-end rounded-full", design === "modern" ? "bg-[oklch(0.54_0.21_27)]" : "bg-neutral-600")} />
      </span>
    </span>
  );
}
