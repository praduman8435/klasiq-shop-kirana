import type { DiscountType, OrderSource } from "@prisma/client";
import { formatPaise } from "@/lib/money";
import type { Invoice, InvoiceAddress } from "@/server/commerce/invoice";

/**
 * Every derived, formatted piece of text an invoice renderer needs,
 * computed once here so the PDF (src/server/commerce/invoice-pdf.ts) and
 * the Print/View layout (src/components/invoice/invoice-view.tsx) can
 * never disagree about how a figure reads — section 2's "single invoice
 * engine": one data model (`Invoice`), one set of formatting rules,
 * multiple renderers. Pure and DB-free, like src/lib/discount.ts and
 * src/lib/payment.ts before it.
 */

/**
 * Phase 3.6.6 Part 2, section 9 — the Invoice Number IS the Order
 * Number, never a second sequence. Centralized here (rather than every
 * renderer reading `invoice.orderNumber` directly under its own local
 * "Invoice No" label) so the decision has exactly one place to change if
 * a future phase ever needs to revisit it. See docs/PHASE_3_6_6_REPORT.md
 * Part 2 "Invoice Number" for the full reasoning.
 */
export function getInvoiceNumber(invoice: Pick<Invoice, "orderNumber">): string {
  return invoice.orderNumber;
}

const INVOICE_DATE_FORMATTER = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "long",
  year: "numeric",
});

export function formatInvoiceDate(date: Date): string {
  return INVOICE_DATE_FORMATTER.format(date);
}

/**
 * Invoice-specific wording for `Order.source` — deliberately its own
 * label set, distinct from both the admin badge's internal shorthand
 * ("Online"/"Counter Sale", src/components/admin/order-status-badge.tsx)
 * and the customer portal's own casual phrasing ("Purchased in Store",
 * src/lib/customer-portal/order-presentation.ts). A printed/downloaded
 * invoice is a formal document read by both audiences at once, so it
 * gets a third, neutral register rather than reusing either.
 */
export function getInvoiceSourceLabel(source: OrderSource): string {
  switch (source) {
    case "ONLINE":
      return "Online Order";
    case "COUNTER":
      return "In-Store Purchase";
  }
}

/**
 * A single human-readable discount line (e.g. "10% off — Festival Sale",
 * "Flat ₹100 off"), or null when no discount applied. Null exactly when
 * `invoice.discountInPaise === 0` — mirrors every existing "only show a
 * Discount row when non-zero" convention already used on the Admin Order
 * Detail and Track Order pages.
 */
export function getInvoiceDiscountLabel(invoice: {
  discountType: DiscountType | null;
  discountValue: number | null;
  discountReason: string | null;
  discountInPaise: number;
}): string | null {
  if (invoice.discountInPaise <= 0) return null;

  const amount =
    invoice.discountType === "PERCENTAGE" && invoice.discountValue !== null
      ? `${invoice.discountValue}% off`
      : `Flat ${formatPaise(invoice.discountInPaise)} off`;

  return invoice.discountReason ? `${amount} — ${invoice.discountReason}` : amount;
}

/**
 * The customer address block as an ordered list of non-empty display
 * lines — never a struct of four possibly-null fields a renderer has to
 * pick apart itself. Empty array (not null) when there is nothing to
 * show, so every renderer can just do `lines.length > 0 && ...` /
 * `lines.map(...)` without a separate null check.
 */
export function getInvoiceAddressLines(address: InvoiceAddress | null): string[] {
  if (!address) return [];

  const lines: string[] = [];
  if (address.addressLine) lines.push(address.addressLine);
  const cityStatePincode = [address.city, address.state, address.pincode].filter(Boolean).join(", ");
  if (cityStatePincode) lines.push(cityStatePincode);
  return lines;
}
