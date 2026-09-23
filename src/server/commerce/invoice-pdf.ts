import "server-only";
import PDFDocument from "pdfkit";
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

const PAGE_MARGIN = 50;
const INK = "#1a1a1a";
const MUTED = "#6b6b6b";
const RULE = "#d8d8d8";

function streamToBuffer(doc: InstanceType<typeof PDFDocument>): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
}

function drawRule(doc: InstanceType<typeof PDFDocument>) {
  const x = doc.page.margins.left;
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  doc.moveTo(x, doc.y).lineTo(x + width, doc.y).strokeColor(RULE).lineWidth(1).stroke();
  doc.moveDown(0.75);
}

function drawTotalsRow(doc: InstanceType<typeof PDFDocument>, label: string, value: string, opts?: { bold?: boolean; color?: string }) {
  const width = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const y = doc.y;
  doc
    .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.bold ? 12 : 10)
    .fillColor(opts?.color ?? INK)
    .text(label, doc.page.margins.left, y, { width: width * 0.7, align: "left" });
  doc
    .font(opts?.bold ? "Helvetica-Bold" : "Helvetica")
    .fontSize(opts?.bold ? 12 : 10)
    .fillColor(opts?.color ?? INK)
    .text(value, doc.page.margins.left + width * 0.7, y, { width: width * 0.3, align: "right" });
  doc.y = y;
  doc.moveDown(opts?.bold ? 1.3 : 1.1);
}

/**
 * Renders `invoice` (src/server/commerce/invoice.ts — THE single invoice
 * data model, section 2) as a professional, single-column A4 PDF. Reads
 * nothing beyond the `Invoice` object passed in — no DB access, no
 * authorization check — so it can never disagree with the Print/View
 * layout (src/components/invoice/invoice-view.tsx) about what an order
 * actually contains; both consume the exact same
 * src/lib/invoice-presentation.ts formatting helpers. Callers (the admin
 * and customer-portal PDF Route Handlers) are responsible for resolving
 * and authorizing `invoice` before calling this.
 *
 * Uses pdfkit directly (no headless browser) — a pure-Node PDF writer
 * with no native binary or browser dependency, appropriate for a
 * long-running Next.js server process. See docs/PHASE_3_6_6_REPORT.md
 * Part 2 "PDF generation" for why this was chosen over Puppeteer/
 * @react-pdf/renderer.
 */
export async function generateInvoicePdf(invoice: Invoice): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margin: PAGE_MARGIN, bufferPages: true });
  const bufferPromise = streamToBuffer(doc);
  const contentWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;

  // Header — brand (placeholder "logo": the wordmark itself, styled
  // large — section 4/10's "logo (placeholder if necessary)") on the
  // left, Invoice No / Order No / Date on the right. A fixed-height
  // block, so absolute x/y positioning here is safe regardless of how
  // long the items list below turns out to be.
  doc.font("Helvetica-Bold").fontSize(22).fillColor(INK).text(BRAND.wordmark, PAGE_MARGIN, PAGE_MARGIN);
  doc.font("Helvetica").fontSize(9).fillColor(MUTED).text(BRAND.tagline, PAGE_MARGIN, PAGE_MARGIN + 26);

  const metaX = PAGE_MARGIN + contentWidth * 0.55;
  const metaWidth = contentWidth * 0.45;
  doc
    .font("Helvetica-Bold")
    .fontSize(14)
    .fillColor(INK)
    .text("INVOICE", metaX, PAGE_MARGIN, { width: metaWidth, align: "right" });
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text(`Invoice No: ${getInvoiceNumber(invoice)}`, metaX, PAGE_MARGIN + 20, { width: metaWidth, align: "right" })
    .text(`Order No: ${invoice.orderNumber}`, metaX, PAGE_MARGIN + 33, { width: metaWidth, align: "right" })
    .text(`Date: ${formatInvoiceDate(invoice.invoiceDate)}`, metaX, PAGE_MARGIN + 46, { width: metaWidth, align: "right" });

  doc.y = PAGE_MARGIN + 70;
  drawRule(doc);

  // Customer block.
  const addressLines = getInvoiceAddressLines(invoice.address);
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("BILLED TO");
  doc.moveDown(0.3);
  doc
    .font("Helvetica-Bold")
    .fontSize(11)
    .fillColor(INK)
    .text(invoice.customerName ?? "Guest Customer");
  doc.font("Helvetica").fontSize(10).fillColor(MUTED);
  if (invoice.customerId) doc.text(`Customer ID: ${invoice.customerId}`);
  if (invoice.customerMobile) doc.text(`Mobile: ${invoice.customerMobile}`);
  for (const line of addressLines) doc.text(line);
  doc.moveDown(0.75);
  drawRule(doc);

  // Order meta — Source and Payment Method (section 4).
  doc.font("Helvetica").fontSize(10).fillColor(MUTED);
  doc.text(`Order Source: ${getInvoiceSourceLabel(invoice.source)}`);
  doc.text(
    `Payment Method: ${getPaymentMethodLabel({ paymentMethod: invoice.paymentMethod, fulfillmentType: invoice.fulfillmentType })}`,
  );
  doc.text(`Fulfillment: ${getFulfillmentLabel(invoice.fulfillmentType)}`);
  doc.moveDown(0.75);
  drawRule(doc);

  // Items. Deliberately flowing text (no explicit y) from here on, so
  // pdfkit's own automatic page-break-on-overflow applies for an
  // arbitrarily long item list — no hand-rolled pagination needed.
  doc.font("Helvetica-Bold").fontSize(9).fillColor(MUTED).text("ITEMS");
  doc.moveDown(0.4);

  for (const item of invoice.items) {
    const discounted = item.effectiveLineTotalInPaise !== item.lineTotalInPaise;
    const rowTop = doc.y;
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(INK)
      .text(item.productName, PAGE_MARGIN, rowTop, { width: contentWidth * 0.7, continued: false });
    doc
      .font("Helvetica-Bold")
      .fontSize(10)
      .fillColor(INK)
      .text(formatPaise(item.effectiveLineTotalInPaise), PAGE_MARGIN + contentWidth * 0.7, rowTop, {
        width: contentWidth * 0.3,
        align: "right",
      });
    doc.y = rowTop;
    doc.moveDown(1.15);
    doc
      .font("Helvetica")
      .fontSize(8.5)
      .fillColor(MUTED)
      .text(
        `${item.size} · SKU ${item.sku} · Qty ${item.quantity} · ${formatPaise(item.unitPriceInPaise)} each${
          discounted ? ` · was ${formatPaise(item.lineTotalInPaise)}` : ""
        }`,
      );
    doc.moveDown(0.5);
  }

  doc.moveDown(0.25);
  drawRule(doc);

  // Totals.
  drawTotalsRow(doc, "Subtotal", formatPaise(invoice.subtotalInPaise));
  const discountLabel = getInvoiceDiscountLabel(invoice);
  if (discountLabel) {
    drawTotalsRow(doc, discountLabel, `-${formatPaise(invoice.discountInPaise)}`);
  }
  drawTotalsRow(doc, "Delivery Fee", invoice.deliveryFeeInPaise > 0 ? formatPaise(invoice.deliveryFeeInPaise) : "Free");
  drawTotalsRow(doc, "Grand Total", formatPaise(invoice.totalInPaise), { bold: true });

  // Received/Outstanding — Counter Sale only (mirrors the identical rule
  // already established on the Admin Order Detail page: every ONLINE
  // order trivially has amountReceivedInPaise === totalInPaise, so
  // showing this pair there would only duplicate the Grand Total line).
  // Phase 3.7 Part 1 — the ONLINE branch now draws a plain Payment Status
  // row instead, mirroring InvoiceView's own on-screen fix: a PARTIALLY_PAID/
  // FAILED online order previously had no payment-status indication
  // anywhere on its invoice at all. Keeping the PDF and on-screen view in
  // sync here is required — InvoiceView's own doc comment already commits
  // to the two never disagreeing about a figure.
  if (invoice.source === "COUNTER") {
    drawTotalsRow(doc, "Amount Received", formatPaise(invoice.amountReceivedInPaise));
    drawTotalsRow(doc, "Outstanding", formatPaise(invoice.outstandingInPaise), {
      color: invoice.outstandingInPaise > 0 ? "#92400e" : MUTED,
    });
  } else {
    drawTotalsRow(doc, "Payment Status", PAYMENT_STATUS_LABEL[invoice.paymentStatus], {
      color: invoice.paymentStatus === "PAID" ? MUTED : "#92400e",
      bold: invoice.paymentStatus !== "PAID",
    });
  }

  doc.moveDown(1);
  drawRule(doc);
  doc
    .font("Helvetica")
    .fontSize(9)
    .fillColor(MUTED)
    .text("Thank you for shopping with us!", { align: "center" });
  doc.text(getBackedByLine(), { align: "center" });

  doc.end();
  return bufferPromise;
}
