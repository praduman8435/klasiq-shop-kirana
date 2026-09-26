import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, MessageCircle, Phone, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderNextStepButton } from "@/components/admin/order-next-step-button";
import { OrderProgress } from "@/components/admin/order-progress";
import { BRAND } from "@/lib/constants";
import { ORDER_STATUS_BADGE_CLASS } from "@/lib/order-lifecycle";
import { customerStatusMessage, nextStep, paymentSummary, simpleStatusLabel } from "@/lib/order-queue";
import { telLink, whatsAppLink } from "@/lib/supplier-statement";
import { cn } from "@/lib/utils";
import {
  OrderStatusActions,
  PaymentStatusActions,
} from "@/components/admin/order-status-actions";
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
  const primaryStep = nextStep(order.status, order.fulfillmentType);
  const payment = paymentSummary(order);
  const call = telLink(order.customerMobile);
  const chatPhone = order.customerWhatsapp || order.customerMobile;
  const message = whatsAppLink(
    chatPhone,
    customerStatusMessage({
      shopName: BRAND.legacyStoreNames[0] ?? BRAND.name,
      customerName: order.customerName,
      orderNumber: order.orderNumber,
      totalInPaise: order.totalInPaise,
      status: order.status,
      fulfillmentType: order.fulfillmentType,
    }),
  );
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
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-heading text-xl font-semibold tracking-tight">
                {order.customerName || (order.source === "COUNTER" ? "Walk-in customer" : "Customer")}
              </h1>
              <span className={cn("rounded-full px-2.5 py-0.5 text-xs font-medium", ORDER_STATUS_BADGE_CLASS[order.status])}>
                {simpleStatusLabel(order.status, order.fulfillmentType)}
              </span>
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">
              <span className="font-mono">{order.orderNumber}</span> ·{" "}
              {order.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} ·{" "}
              {order.source === "COUNTER" ? "Counter sale" : `Online · ${getFulfillmentLabel(order.fulfillmentType)}`}
            </p>
          </div>
          {(call || chatPhone) && (
            <div className="flex shrink-0 flex-wrap gap-2">
              {call && (
                <Button render={<a href={call} />} nativeButton={false} variant="outline" className="h-10">
                  <Phone className="size-4" aria-hidden />
                  Call
                </Button>
              )}
              {chatPhone && (
                <Button
                  render={<a href={message} target="_blank" rel="noopener noreferrer" />}
                  nativeButton={false}
                  variant="outline"
                  className="h-10"
                >
                  <MessageCircle className="size-4" aria-hidden />
                  WhatsApp update
                </Button>
              )}
            </div>
          )}
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
                        {item.size} &middot; {item.quantity} &times; {formatPaise(item.unitPriceInPaise)}
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
                <span className="text-muted-foreground">
                  Delivery fee
                  {order.couponCode && order.discountInPaise === 0 && order.couponSavingInPaise > 0
                    ? ` — offer ${order.couponCode} (saved ${formatPaise(order.couponSavingInPaise)})`
                    : ""}
                </span>
                <span>{order.deliveryFeeInPaise > 0 ? formatPaise(order.deliveryFeeInPaise) : "Free"}</span>
              </div>
              <div className="mt-2 flex justify-between border-t border-border pt-2 text-base font-semibold">
                <span>Total</span>
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
                    <span className="text-muted-foreground">Paid</span>
                    <span>{formatPaise(order.amountReceivedInPaise)}</span>
                  </div>
                  <div
                    className={
                      order.outstandingInPaise > 0
                        ? "mt-1 flex justify-between font-semibold text-amber-500"
                        : "mt-1 flex justify-between text-muted-foreground"
                    }
                  >
                    <span>
                      On khata
                      {order.customer && order.outstandingInPaise > 0 && (
                        <Link
                          href={`/admin/khatabook/${order.customer.customerId}`}
                          className="ml-2 text-xs font-normal underline underline-offset-2"
                        >
                          Open khata
                        </Link>
                      )}
                    </span>
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
                      {adj.createdAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium", timeStyle: "short" })} —{" "}
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
            <div className="mt-3 flex flex-col gap-3">
              <OrderProgress status={order.status} fulfillmentType={order.fulfillmentType} />
              {order.status === "CANCELLED" && order.cancelledBy && (
                <p className="rounded-lg bg-secondary px-3 py-2 text-sm">
                  <span className="font-medium">{order.cancelledBy === "CUSTOMER" ? "Cancelled by the customer" : "Cancelled by the shop"}</span>
                  {order.cancelledAt && (
                    <span className="text-muted-foreground">
                      {" "}
                      ·{" "}
                      {order.cancelledAt.toLocaleString("en-IN", { timeZone: "Asia/Kolkata", day: "numeric", month: "short", hour: "numeric", minute: "2-digit", hour12: true })}
                    </span>
                  )}
                  {order.cancelReason && <span className="mt-0.5 block text-muted-foreground">Reason: {order.cancelReason}</span>}
                  <span className="mt-0.5 block text-xs text-muted-foreground">Stock for these items was put back.</span>
                </p>
              )}
              <OrderNextStepButton
                orderNumber={order.orderNumber}
                status={order.status}
                fulfillmentType={order.fulfillmentType}
                size="lg"
              />
              <OrderStatusActions
                orderNumber={order.orderNumber}
                status={order.status}
                fulfillmentType={order.fulfillmentType}
                exclude={primaryStep}
              />
            </div>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Payment</h2>
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                payment.tone === "due" ? "text-amber-500" : payment.tone === "paid" ? "text-emerald-400" : "text-muted-foreground",
              )}
            >
              {payment.label}
            </p>
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
            <h2 className="text-sm font-semibold">Bill</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <Link
                href={`/admin/orders/${order.orderNumber}/invoice`}
                className="flex h-10 items-center gap-1.5 rounded-md bg-primary px-3.5 text-sm font-medium text-primary-foreground hover:bg-primary/80"
              >
                <Printer className="size-4" aria-hidden />
                Print or send bill
              </Link>
              <a
                href={`/admin/orders/${order.orderNumber}/invoice/download`}
                download={`Bill-${order.orderNumber}.pdf`}
                className={INVOICE_ACTION_CLASS}
              >
                <Download className="size-4" aria-hidden />
                PDF
              </a>
            </div>
            <p className="mt-1.5 text-xs text-muted-foreground">Pick a design, print it, or send it on WhatsApp.</p>
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
