import { BRAND, STORE_CONTACT, getBackedByLine } from "@/lib/constants";
import { formatPaise } from "@/lib/money";
import { getInvoiceAddressLines, getInvoiceDiscountLabel } from "@/lib/invoice-presentation";
import type { Invoice } from "@/server/commerce/invoice";

/** The four bill designs a shopkeeper can pick when printing or sending. */
export const INVOICE_DESIGNS = ["classic", "modern", "thermal", "minimal"] as const;
export type InvoiceDesign = (typeof INVOICE_DESIGNS)[number];

export const INVOICE_DESIGN_INFO: Record<InvoiceDesign, { name: string; hint: string }> = {
  classic: { name: "Classic", hint: "Clean A4 bill" },
  modern: { name: "Modern", hint: "Bold total, brand colour" },
  thermal: { name: "Thermal", hint: "80 mm counter receipt" },
  minimal: { name: "Minimal", hint: "Black & white, saves ink" },
};

export function parseInvoiceDesign(value: string | null | undefined): InvoiceDesign {
  return INVOICE_DESIGNS.find((d) => d === value) ?? "classic";
}

const DATE = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric" });
const TIME = new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", hour: "numeric", minute: "2-digit", hour12: true });

export type InvoiceModel = ReturnType<typeof buildInvoiceModel>;

/**
 * Everything every bill design prints, computed once so the designs can
 * never disagree on a number: shop, customer, rows, totals and how the
 * bill was paid (in plain words).
 */
export function buildInvoiceModel(invoice: Invoice) {
  const shopName = BRAND.legacyStoreNames[0] ?? BRAND.name;
  const totalQuantity = invoice.items.reduce((s, i) => s + i.quantity, 0);
  const discountLabel = getInvoiceDiscountLabel(invoice);

  const payment = (() => {
    if (invoice.source === "COUNTER") {
      if (invoice.outstandingInPaise > 0) {
        return {
          status: invoice.amountReceivedInPaise > 0 ? "Part paid" : "On khata",
          paid: invoice.amountReceivedInPaise,
          due: invoice.outstandingInPaise,
          dueLabel: "Baaki (on khata)",
        };
      }
      return { status: "Paid", paid: invoice.totalInPaise, due: 0, dueLabel: null };
    }
    if (invoice.paymentStatus === "PAID") return { status: "Paid", paid: invoice.totalInPaise, due: 0, dueLabel: null };
    if (invoice.paymentStatus === "REFUNDED") return { status: "Refunded", paid: 0, due: 0, dueLabel: null };
    return {
      status: invoice.fulfillmentType === "LOCAL_DELIVERY" ? "Cash on delivery" : "Pay at store",
      paid: 0,
      due: invoice.totalInPaise,
      dueLabel: "To pay",
    };
  })();

  const methodLabel =
    invoice.paymentMethod === "UPI"
      ? "UPI"
      : invoice.paymentMethod === "CARD"
        ? "Card"
        : invoice.paymentMethod === "CASH_ON_DELIVERY"
          ? "Cash on delivery"
          : "Cash";

  return {
    shop: {
      name: shopName,
      brand: BRAND.name,
      phone: STORE_CONTACT.phone,
      backedBy: getBackedByLine(),
    },
    number: invoice.orderNumber,
    date: DATE.format(invoice.invoiceDate),
    time: TIME.format(invoice.invoiceDate),
    kind:
      invoice.source === "COUNTER"
        ? "Counter sale"
        : invoice.fulfillmentType === "LOCAL_DELIVERY"
          ? "Home delivery"
          : "Store pickup",
    customer: {
      name: invoice.customerName,
      mobile: invoice.customerMobile,
      addressLines: getInvoiceAddressLines(invoice.address),
    },
    rows: invoice.items.map((item, index) => ({
      n: index + 1,
      name: item.productName,
      size: item.size,
      quantity: item.quantity,
      rate: formatPaise(item.unitPriceInPaise),
      amount: formatPaise(item.effectiveLineTotalInPaise),
      struck: item.effectiveLineTotalInPaise !== item.lineTotalInPaise ? formatPaise(item.lineTotalInPaise) : null,
    })),
    itemCount: invoice.items.length,
    totalQuantity,
    subtotal: formatPaise(invoice.subtotalInPaise),
    discount: discountLabel ? { label: discountLabel, amount: `−${formatPaise(invoice.discountInPaise)}` } : null,
    delivery:
      invoice.fulfillmentType === "LOCAL_DELIVERY"
        ? invoice.deliveryFeeInPaise > 0
          ? formatPaise(invoice.deliveryFeeInPaise)
          : "Free"
        : null,
    total: formatPaise(invoice.totalInPaise),
    totalInPaise: invoice.totalInPaise,
    payment: {
      status: payment.status,
      method: methodLabel,
      paid: payment.paid > 0 ? formatPaise(payment.paid) : null,
      due: payment.due > 0 ? formatPaise(payment.due) : null,
      dueLabel: payment.dueLabel,
      isPaid: payment.due === 0 && payment.status === "Paid",
    },
  };
}

/** The WhatsApp message that goes with a bill link (Hinglish, polite). */
export function buildBillShareText(params: {
  shopName: string;
  customerName: string | null;
  orderNumber: string;
  total: string;
  due?: { label: string; amount: string } | null;
  link: string;
}): string {
  const hi = params.customerName ? `Namaste ${params.customerName} ji,` : "Namaste,";
  const lines = [hi, `${params.shopName} ka bill ${params.orderNumber}: ${params.total}.`];
  if (params.due) lines.push(`${params.due.label}: ${params.due.amount}`);
  lines.push("", `Bill dekhein: ${params.link}`, "", "Dhanyavaad 🙏");
  return lines.join("\n");
}

export function buildInvoiceShareText(model: InvoiceModel, link: string): string {
  return buildBillShareText({
    shopName: model.shop.name,
    customerName: model.customer.name,
    orderNumber: model.number,
    total: model.total,
    due: model.payment.due && model.payment.dueLabel ? { label: model.payment.dueLabel, amount: model.payment.due } : null,
    link,
  });
}

/** Reads the admin's last-picked bill design from its cookie (browser only). */
export function readInvoiceDesignCookie(): InvoiceDesign {
  const match = document.cookie.match(/(?:^|; )klasiq_invoice_design=([^;]+)/);
  return parseInvoiceDesign(match?.[1]);
}
