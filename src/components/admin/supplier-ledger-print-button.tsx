"use client";

import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Section 22 — reuses the exact `window.print()` pattern already
 * established by `InvoiceActions` (src/components/invoice/invoice-actions.tsx)
 * rather than inventing a new print/export mechanism. `print:hidden` on
 * the wrapping element (applied by the caller) keeps this button itself
 * out of the printed page.
 */
export function SupplierLedgerPrintButton() {
  return (
    <Button type="button" size="sm" variant="outline" className="h-8" onClick={() => window.print()}>
      <Printer className="size-3.5" aria-hidden />
      Print Statement
    </Button>
  );
}
