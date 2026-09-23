import { formatPaise } from "@/lib/money";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-lifecycle";
import { getFulfillmentLabel, getPaymentMethodLabel } from "@/lib/order-message";
import {
  formatInvoiceDate,
  getInvoiceAddressLines,
  getInvoiceDiscountLabel,
  getInvoiceNumber,
  getInvoiceSourceLabel,
} from "@/lib/invoice-presentation";
import { BRAND, getBackedByLine } from "@/lib/constants";
import type { Invoice } from "@/server/commerce/invoice";

/**
 * The single shared invoice rendering pipeline's on-screen/print half
 * (section 2) — used, unchanged, by both the Admin invoice page and the
 * Customer Portal invoice page. Reads only the `Invoice` model and the
 * same src/lib/invoice-presentation.ts helpers the PDF generator
 * (src/server/commerce/invoice-pdf.ts) uses, so the two outputs can
 * never disagree about a figure, only about pixels-vs-PDF-drawing-ops.
 *
 * Deliberately fixed to light "paper" colors (`bg-white`/`text-neutral-*`),
 * never the theme's `bg-background`/`text-foreground` tokens — a real
 * paper invoice (viewed, printed, or downloaded) should look identical
 * regardless of the viewer's dark-mode preference, exactly like it would
 * on actual paper.
 */
export function InvoiceView({ invoice }: { invoice: Invoice }) {
  const addressLines = getInvoiceAddressLines(invoice.address);
  const discountLabel = getInvoiceDiscountLabel(invoice);

  return (
    <div className="mx-auto w-full max-w-2xl bg-white p-4 text-neutral-900 sm:p-8 print:p-0">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-heading text-2xl font-bold tracking-tight">{BRAND.wordmark}</p>
          <p className="mt-1 text-xs text-neutral-500">{BRAND.tagline}</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-semibold">INVOICE</p>
          <p className="mt-1 text-xs text-neutral-500">Invoice No: {getInvoiceNumber(invoice)}</p>
          <p className="text-xs text-neutral-500">Order No: {invoice.orderNumber}</p>
          <p className="text-xs text-neutral-500">Date: {formatInvoiceDate(invoice.invoiceDate)}</p>
        </div>
      </div>

      <hr className="my-5 border-neutral-200" />

      <div>
        <p className="text-xs font-semibold tracking-wide text-neutral-500">BILLED TO</p>
        <p className="mt-1 text-sm font-semibold">{invoice.customerName ?? "Guest Customer"}</p>
        {invoice.customerId && <p className="text-xs text-neutral-600">Customer ID: {invoice.customerId}</p>}
        {invoice.customerMobile && <p className="text-xs text-neutral-600">Mobile: {invoice.customerMobile}</p>}
        {addressLines.map((line) => (
          <p key={line} className="text-xs text-neutral-600">
            {line}
          </p>
        ))}
      </div>

      <hr className="my-5 border-neutral-200" />

      <div className="flex flex-wrap gap-x-6 gap-y-1 text-xs text-neutral-600">
        <p>Order Source: {getInvoiceSourceLabel(invoice.source)}</p>
        <p>
          Payment Method:{" "}
          {getPaymentMethodLabel({ paymentMethod: invoice.paymentMethod, fulfillmentType: invoice.fulfillmentType })}
        </p>
        <p>Fulfillment: {getFulfillmentLabel(invoice.fulfillmentType)}</p>
      </div>

      <hr className="my-5 border-neutral-200" />

      <div>
        <p className="text-xs font-semibold tracking-wide text-neutral-500">ITEMS</p>
        <ul className="mt-2 divide-y divide-neutral-100">
          {invoice.items.map((item, index) => {
            const discounted = item.effectiveLineTotalInPaise !== item.lineTotalInPaise;
            return (
              <li key={index} className="flex items-start justify-between gap-3 py-2.5 text-sm">
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="mt-0.5 text-xs text-neutral-500">
                    Size {item.size} &middot; SKU {item.sku} &middot; Qty {item.quantity} &middot;{" "}
                    {formatPaise(item.unitPriceInPaise)} each
                  </p>
                </div>
                <div className="text-right">
                  {discounted && (
                    <p className="text-xs text-neutral-400 line-through">{formatPaise(item.lineTotalInPaise)}</p>
                  )}
                  <p className="font-semibold">{formatPaise(item.effectiveLineTotalInPaise)}</p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="mt-4 border-t border-neutral-200 pt-4 text-sm">
        <div className="flex justify-between">
          <span className="text-neutral-500">Subtotal</span>
          <span>{formatPaise(invoice.subtotalInPaise)}</span>
        </div>
        {discountLabel && (
          <div className="mt-1 flex justify-between">
            <span className="text-neutral-500">{discountLabel}</span>
            <span>-{formatPaise(invoice.discountInPaise)}</span>
          </div>
        )}
        <div className="mt-1 flex justify-between">
          <span className="text-neutral-500">Delivery Fee</span>
          <span>{invoice.deliveryFeeInPaise > 0 ? formatPaise(invoice.deliveryFeeInPaise) : "Free"}</span>
        </div>
        <div className="mt-2 flex justify-between border-t border-neutral-200 pt-2 text-base font-semibold">
          <span>Grand Total</span>
          <span>{formatPaise(invoice.totalInPaise)}</span>
        </div>
        {invoice.source === "COUNTER" ? (
          <>
            <div className="mt-1 flex justify-between">
              <span className="text-neutral-500">Amount Received</span>
              <span>{formatPaise(invoice.amountReceivedInPaise)}</span>
            </div>
            <div
              className={
                invoice.outstandingInPaise > 0
                  ? "mt-1 flex justify-between font-semibold text-amber-700"
                  : "mt-1 flex justify-between text-neutral-500"
              }
            >
              <span>Outstanding</span>
              <span>{formatPaise(invoice.outstandingInPaise)}</span>
            </div>
          </>
        ) : (
          // Phase 3.7 Part 1 — previously this whole payment-status block
          // was gated to `source === "COUNTER"`, so an ONLINE order's
          // invoice never showed payment status at all, even though the
          // order-confirmation and order-detail pages both already show it
          // unconditionally. `amountReceivedInPaise`/`outstandingInPaise`
          // stay COUNTER-only (a Khata/partial-payment concept that never
          // applies to Online Checkout — see docs/PHASE_3_6_5_REPORT.md
          // Part 3), but the simple Paid/Unpaid/Refunded/Failed status is
          // just as real a fact for an ONLINE order and belongs here too.
          <div
            className={
              invoice.paymentStatus === "PAID"
                ? "mt-1 flex justify-between text-neutral-500"
                : "mt-1 flex justify-between font-semibold text-amber-700"
            }
          >
            <span>Payment Status</span>
            <span>{PAYMENT_STATUS_LABEL[invoice.paymentStatus]}</span>
          </div>
        )}
      </div>

      <hr className="my-5 border-neutral-200" />

      <div className="text-center text-xs text-neutral-500">
        <p>Thank you for shopping with us!</p>
        <p className="mt-0.5">{getBackedByLine()}</p>
      </div>
    </div>
  );
}
