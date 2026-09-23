import type { DiscountType, FulfillmentType, OrderSource, PaymentMethod, PaymentStatus } from "@prisma/client";
import { db } from "@/lib/db";

export type InvoiceLineItem = {
  productName: string;
  size: string;
  sku: string;
  quantity: number;
  unitPriceInPaise: number;
  lineTotalInPaise: number;
  effectiveLineTotalInPaise: number;
};

export type InvoiceAddress = {
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

export type Invoice = {
  orderNumber: string;
  /// Reused directly from Order.createdAt — never a second, duplicated
  /// "invoice number"/"invoice date" concept. See docs/PHASE_3_6_6_REPORT.md
  /// Part 1 "Invoice foundation".
  invoiceDate: Date;
  source: OrderSource;
  fulfillmentType: FulfillmentType;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  customerName: string | null;
  customerMobile: string | null;
  customerWhatsapp: string | null;
  /// The linked Customer's permanent, public-facing code (e.g.
  /// "KLQ-7A41K2") — null for a Guest order or one placed before Phase
  /// 3.1. Phase 3.6.6 Part 2's one narrow, deliberate exception to "no
  /// join to Customer": `Customer.customerId` is documented as assigned
  /// once at creation and never mutated by any code path in this
  /// codebase (see its own schema doc comment) — unlike name/address/
  /// phone, which genuinely drift and must come from Order's own
  /// snapshot columns instead. Reading it live can never produce a
  /// different answer than a snapshot would have, so it carries none of
  /// the historical-accuracy risk section 8 warns about. See
  /// docs/PHASE_3_6_6_REPORT.md Part 2 "Customer ID".
  customerId: string | null;
  /// Null when no address was ever provided for this sale (`mode: "NONE"`
  /// — the overwhelmingly common case, and the only possibility for
  /// every order that predates Phase 3.6.6) — never a struct of four
  /// nulls a renderer would have to detect itself.
  address: InvoiceAddress | null;
  items: InvoiceLineItem[];
  subtotalInPaise: number;
  discountType: DiscountType | null;
  discountValue: number | null;
  discountReason: string | null;
  discountInPaise: number;
  deliveryFeeInPaise: number;
  /// The Grand Total — see Order.totalInPaise's own doc comment.
  totalInPaise: number;
  amountReceivedInPaise: number;
  outstandingInPaise: number;
};

function isBlankAddress(address: InvoiceAddress): boolean {
  return !address.addressLine && !address.city && !address.state && !address.pincode;
}

/**
 * THE single source of truth for invoice content (section 7) — every
 * future PDF/Print/WhatsApp/Download output MUST call this function,
 * never recompute or re-derive invoice data of its own.
 *
 * Reads `Order` and `OrderItem` — the two tables that already snapshot
 * everything an invoice needs (confirmed by this phase's own "Order
 * snapshots review" — see docs/PHASE_3_6_6_REPORT.md Part 1) — plus, as
 * of Part 2, a `select`-scoped read of `Customer.customerId` ONLY (see
 * the `Invoice.customerId` doc comment above for why this one field is
 * safe). No join to `Product`, `ProductVariant`, or `School` anywhere in
 * this function, and no OTHER `Customer` field is ever read. Section 8's
 * "never read: current Product price, current Product name, current
 * Customer address, current Inventory" is satisfied STRUCTURALLY, not by
 * convention or discipline, for every one of those specific fields —
 * there is no code path here that could read any of them, because
 * nothing is ever fetched from them in the first place.
 *
 * Returns raw, unformatted data — paise integers (not "₹" strings), enum
 * values (not display labels). Formatting is a presentation concern for
 * whichever future renderer (a PDF layout, print HTML, WhatsApp plain
 * text) consumes this, never baked in here — this keeps exactly ONE
 * function computing "what happened" and lets every output independently
 * decide "how to show it," so two outputs can never disagree about the
 * underlying facts (section 7's "never duplicate invoice calculations").
 *
 * Performs NO authorization check of its own — the same convention every
 * other query function in this codebase already follows
 * (`getAdminOrderByNumber`, `getKhataBookCustomerProfile`, etc.): callers
 * must verify the request is authorized BEFORE calling this. Admin
 * routes rely on the shared `(protected)` layout's session gate; a
 * Customer Portal caller MUST go through
 * `getInvoiceForAuthenticatedCustomer`
 * (src/server/queries/customer-portal/invoice.ts) instead of calling
 * this directly — see docs/PHASE_3_6_6_REPORT.md Part 1 "Security".
 */
export async function getInvoiceForOrder(orderNumber: string): Promise<Invoice | null> {
  const order = await db.order.findUnique({
    where: { orderNumber },
    include: {
      items: { orderBy: { id: "asc" } },
      customer: { select: { customerId: true } },
    },
  });
  if (!order) return null;

  const address: InvoiceAddress = {
    addressLine: order.customerAddressLine,
    city: order.customerAddressCity,
    state: order.customerAddressState,
    pincode: order.customerAddressPincode,
  };

  return {
    orderNumber: order.orderNumber,
    invoiceDate: order.createdAt,
    source: order.source,
    fulfillmentType: order.fulfillmentType,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    customerName: order.customerName,
    customerMobile: order.customerMobile,
    customerWhatsapp: order.customerWhatsapp,
    customerId: order.customer?.customerId ?? null,
    address: isBlankAddress(address) ? null : address,
    items: order.items.map((item) => ({
      productName: item.productName,
      size: item.size,
      sku: item.skuSnapshot,
      quantity: item.quantity,
      unitPriceInPaise: item.unitPriceInPaise,
      lineTotalInPaise: item.lineTotalInPaise,
      effectiveLineTotalInPaise: item.effectiveLineTotalInPaise,
    })),
    subtotalInPaise: order.subtotalInPaise,
    discountType: order.discountType,
    discountValue: order.discountValue,
    discountReason: order.discountReason,
    discountInPaise: order.discountInPaise,
    deliveryFeeInPaise: order.deliveryFeeInPaise,
    totalInPaise: order.totalInPaise,
    amountReceivedInPaise: order.amountReceivedInPaise,
    outstandingInPaise: order.outstandingInPaise,
  };
}
