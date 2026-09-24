"use client";

import { Printer } from "lucide-react";

/** "Print / Save as PDF" on the customer's bill page: the phone's print
 * screen offers Save as PDF, so no separate download is needed. */
export function PrintBillButton() {
  return (
    <button
      type="button"
      onClick={() => window.print()}
      className="inline-flex h-10 items-center gap-2 rounded-lg bg-neutral-900 px-4 text-sm font-medium text-white hover:bg-neutral-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
    >
      <Printer className="size-4" aria-hidden />
      Print / Save as PDF
    </button>
  );
}
