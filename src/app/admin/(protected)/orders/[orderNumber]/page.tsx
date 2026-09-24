import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, Eye, Printer } from "lucide-react";
import {
  OrderStatusActions,
  PaymentStatusActions,
} from "@/components/admin/order-status-actions";
import { SendInvoiceWhatsAppButton } from "@/components/admin/send-invoice-whatsapp-button";
import {
  FulfillmentBadge,
  OrderSourceBadge,
  OrderStatusBadge,
  PaymentStatusBadge,
} from "@/components/admin/order-status-badge";
import { formatPaise } from "@/lib/money";
import { getFulfillmentLabel, getPaymentMethodLabel } from "@/lib/order-message";
import { getAdminOrderByNumber } from "@/server/queries/admin/orders";

const INVOICE_ACTION_CLASS =
  "flex h-9 items-center gap-1.5 rounded-md border border-border px-3 text-sm font-medium hover:bg-muted";

type PageProps = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: orderNumber };
}

export default async function AdminOrderDetailPage({ params }: PageProps) {
  const { orderNumber } = await params;
  const order = await getAdminOrderByNumber(orderNumber);
  if (!order) notFound();

  const isPickup = order.fulfillmentType === "STORE_PICKUP";
  const isDelivery = order.fulfillmentType === "LOCAL_DELIVERY";
  const hasCustomerAddress = Boolean(
    order.customerAddressLine ||
      order.customerAddressCity ||
      order.customerAddressState ||
      order.customerAddressPincode,
  );

  return (
    // AdminShell establishes the dark scope + background for the whole
    // admin application; this page just renders directly into it.
    <div>
      <div className="mb-5 flex flex-col gap-3">
        <Link
          href="/admin/orders"
          className="inline-flex w-fit items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          Orders
        </Link>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="font-mono text-lg font-semibold">{order.orderNumber}</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {order.createdAt.toLocaleString("en-IN", { dateStyle: "full", timeStyle: "short" })}
            </p>
          </div>
          <div className="flex flex-wrap gap-1.5">
            <OrderStatusBadge status={order.status} />
            <PaymentStatusBadge status={order.paymentStatus} />
            {/* Counter Sale's own fulfillment type IS "Counter Sale"
                (COUNTER_HANDOVER) — the source badge already says it. */}
            {order.fulfillmentType !== "COUNTER_HANDOVER" && (
              <FulfillmentBadge fulfillmentType={order.fulfillmentType} className="opacity-70" />
            )}
            <OrderSourceBadge source={order.source} className="opacity-70" />
          </div>
        </div>
      </div>

      {/* Items are the primary content (left/main); status, payment,
          invoice, customer and delivery are the sidebar — always
          visible, never requiring a scroll past the items to act on the
          order. Same two-column + `lg:sticky` technique as Counter
          Sale/Bag/Checkout. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex flex-1 flex-col gap-5 lg:max-w-2xl">
          <section>
            <h2 className="text-sm font-semibold">Items</h2>
            <ul className="mt-2 divide-y divide-border">
              {order.items.map((item) => {
                const discounted = item.effectiveLineTotalInPaise !== item.lineTotalInPaise;
                return (
                  <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-medium">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.size} &middot; SKU {item.skuSnapshot} &middot; Qty {item.quantity} &middot;{" "}
                        {formatPaise(item.unitPriceInPaise)} each
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      {discounted && (
                        <p className="text-xs text-muted-foreground line-through">
                          {formatPaise(item.lineTotalInPaise)}
                        </p>
                      )}
                      <p className="font-semibold">{formatPaise(item.effectiveLineTotalInPaise)}</p>
                    </div>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 border-t border-border pt-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Subtotal</span>
                <span>{formatPaise(order.subtotalInPaise)}</span>
              </div>
              {order.discountInPaise > 0 && (
                <div className="mt-1 flex justify-between">
                  <span className="text-muted-foreground">
                    Discount
                    {order.discountType === "PERCENTAGE" && order.discountValue !== null
                      ? ` (${order.discountValue}%)`
                      : ""}
                    {order.discountReason ? ` — ${order.discountReason}` : ""}
                  </span>
                  <span>-{formatPaise(order.discountInPaise)}</span>
                </div>
              )}
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Delivery fee</span>
                <span>{order.deliveryFeeInPaise > 0 ? formatPaise(order.deliveryFeeInPaise) : "Free"}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Grand Total</span>
                <span>{formatPaise(order.totalInPaise)}</span>
              </div>
              {/* Phase 3.6.5 Part 3 — Counter Sale only (see
                  docs/PHASE_3_6_5_REPORT.md Part 3 "Online checkout
                  scope"). Every ONLINE order has amountReceivedInPaise ==
                  totalInPaise / outstandingInPaise == 0 unconditionally,
                  so showing this pair there would just duplicate the
                  Grand Total line next to Online's own UNPAID-until-COD
                  paymentStatus badge. */}
              {order.source === "COUNTER" && (
                <>
                  <div className="mt-1 flex justify-between">
                    <span className="text-muted-foreground">Received</span>
                    <span>{formatPaise(order.amountReceivedInPaise)}</span>
                  </div>
                  <div
                    className={
                      order.outstandingInPaise > 0
                        ? "mt-1 flex justify-between font-semibold text-amber-500"
                        : "mt-1 flex justify-between text-muted-foreground"
                    }
                  >
                    <span>Outstanding</span>
                    <span>{formatPaise(order.outstandingInPaise)}</span>
                  </div>
                </>
              )}
            </div>
          </section>

          {order.inventoryAdjustments.length > 0 && (
            <>
              <div className="border-t border-border" />
              <section>
                <h2 className="text-sm font-semibold text-muted-foreground">Inventory adjustments</h2>
                <ul className="mt-2 space-y-1 text-xs text-muted-foreground">
                  {order.inventoryAdjustments.map((adj) => (
                    <li key={adj.id}>
                      {adj.createdAt.toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })} —{" "}
                      {adj.reason.replace(/_/g, " ").toLowerCase()}: {adj.previousQuantity} → {adj.newQuantity}
                    </li>
                  ))}
                </ul>
              </section>
            </>
          )}
        </div>

        <div className="flex flex-col gap-5 border-t border-border pt-5 lg:sticky lg:top-6 lg:w-[360px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <section>
            <h2 className="text-sm font-semibold">Order status</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {getFulfillmentLabel(order.fulfillmentType)} order
            </p>
            <div className="mt-2">
              <OrderStatusActions
                orderNumber={order.orderNumber}
                status={order.status}
                fulfillmentType={order.fulfillmentType}
              />
            </div>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Payment</h2>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {getPaymentMethodLabel({
                paymentMethod: order.paymentMethod,
                fulfillmentType: order.fulfillmentType,
              })}
            </p>
            <div className="mt-2">
              <PaymentStatusActions
                orderNumber={order.orderNumber}
                paymentStatus={order.paymentStatus}
                orderStatus={order.status}
              />
            </div>
          </section>

          <div className="border-t border-border" />

          {/* Phase 3.6.6 Part 2 — Invoice (section 8): View/Print/Download,
              each a direct link/anchor rather than a client-side action,
              since none of the three need a pending/success state of
              their own. */}
          <section>
            <h2 className="text-sm font-semibold">Invoice</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/admin/orders/${order.orderNumber}/invoice`}
                className="flex h-9 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                <Eye className="size-4" aria-hidden />
                View Invoice
              </Link>
              <Link href={`/admin/orders/${order.orderNumber}/invoice?print=1`} className={INVOICE_ACTION_CLASS}>
                <Printer className="size-4" aria-hidden />
                Print
              </Link>
              <a
                href={`/admin/orders/${order.orderNumber}/invoice/download`}
                download={`Invoice-${order.orderNumber}.pdf`}
                className={INVOICE_ACTION_CLASS}
              >
                <Download className="size-4" aria-hidden />
                Download PDF
              </a>
              <SendInvoiceWhatsAppButton orderNumber={order.orderNumber} />
            </div>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Customer</h2>
            {order.customerName || order.customerMobile ? (
              <>
                <p className="mt-1.5 text-sm">{order.customerName ?? "—"}</p>
                <p className="text-sm text-muted-foreground">{order.customerMobile ?? "—"}</p>
                {order.customerWhatsapp && (
                  <p className="text-sm text-muted-foreground">
                    WhatsApp: {order.customerWhatsapp}
                    {order.customerWhatsapp === order.customerMobile && " (same as primary)"}
                  </p>
                )}
              </>
            ) : (
              <p className="mt-1.5 text-sm text-muted-foreground">Guest customer — no details taken.</p>
            )}
            {order.customer && (
              <p className="mt-1 text-xs font-mono text-muted-foreground">
                {order.customer.customerId}
                {order.customer.displayName ? ` · ${order.customer.displayName}` : ""}
              </p>
            )}
            {/* Phase 3.6.6 Part 1 — the customer's postal address snapshot
                for invoicing, shown only when at least one field was
                actually provided. Deliberately labeled "Address," never
                "Delivery Address" — that's the sibling section's own,
                unrelated concept (WHERE a Local Delivery order physically
                ships to). */}
            {hasCustomerAddress && (
              <div className="mt-1.5 text-xs text-muted-foreground">
                <p className="font-medium text-foreground">Address</p>
                {order.customerAddressLine && <p>{order.customerAddressLine}</p>}
                <p>
                  {[order.customerAddressCity, order.customerAddressState, order.customerAddressPincode]
                    .filter(Boolean)
                    .join(", ")}
                </p>
              </div>
            )}
            {order.createdByAdminUser && (
              <p className="mt-1 text-xs text-muted-foreground">
                Processed by: {order.createdByAdminUser.name}
              </p>
            )}
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">
              {isPickup ? "Store Pickup" : isDelivery ? "Delivery Address" : "Counter Sale"}
            </h2>
            {isPickup && (
              <p className="mt-1.5 text-sm text-muted-foreground">Customer collects at the store.</p>
            )}
            {isDelivery && (
              <div className="mt-1.5 text-sm text-muted-foreground">
                <p>{order.deliveryAddressLine}</p>
                {order.deliveryFormattedAddress && <p>{order.deliveryFormattedAddress}</p>}
                {order.deliveryArea && <p>{order.deliveryArea}</p>}
                {order.deliveryLandmark && <p>Landmark: {order.deliveryLandmark}</p>}
                {order.deliveryRouteDistanceMeters !== null && (
                  <p className="mt-1 text-xs">
                    Route distance: {(order.deliveryRouteDistanceMeters / 1000).toFixed(1)}km
                  </p>
                )}
                {order.deliveryLatitude !== null && order.deliveryLongitude !== null && (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${order.deliveryLatitude},${order.deliveryLongitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block text-xs font-medium text-primary underline underline-offset-2"
                  >
                    Open Location
                  </a>
                )}
              </div>
            )}
            {!isPickup && !isDelivery && (
              <p className="mt-1.5 text-sm text-muted-foreground">
                Goods handed over at the counter at time of sale.
              </p>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
