import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, ChevronRight, Download, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CustomerLogoutButton } from "@/components/customer-portal/logout-button";
import { OrderTrackingTimeline } from "@/components/customer-portal/order-tracking-timeline";
import { ReturnHistory } from "@/components/customer-portal/return-history";
import { ORDER_STATUS_BADGE_CLASS, ORDER_STATUS_LABEL, PAYMENT_STATUS_LABEL } from "@/lib/order-lifecycle";
import { getFulfillmentLabel, getPaymentMethodLabel } from "@/lib/order-message";
import { getPortalSourceLabel } from "@/lib/customer-portal/order-presentation";
import { getOrderReturnEligibility } from "@/lib/return-eligibility";
import { RETURN_WINDOW_DAYS } from "@/lib/return-lifecycle";
import { formatPaise } from "@/lib/money";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import { cn } from "@/lib/utils";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { getOrderForAuthenticatedCustomer } from "@/server/queries/customer-portal/orders";
import { getReturnableItemsForOrder, getReturnRequestsForOrder } from "@/server/queries/customer-portal/returns";

type PageProps = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: orderNumber, robots: { index: false, follow: false } };
}

/**
 * A single order's detail, scoped to the authenticated session's Customer
 * — see getOrderForAuthenticatedCustomer's doc comment for exactly why an
 * order belonging to a DIFFERENT customer is indistinguishable from one
 * that doesn't exist at all: both hit `notFound()` here, never a
 * different error, never a hint about whose order it might be. Knowing
 * this order's number is never, by itself, enough to see it — only the
 * verified session is.
 */
export default async function TrackOrderDetailPage({ params }: PageProps) {
  const { orderNumber } = await params;
  const session = await getCustomerSession();
  if (!session) return null;

  // No linked Customer means this session can own no orders at all —
  // never attempt the lookup with a fabricated or absent id.
  if (!session.customer) notFound();

  const order = await getOrderForAuthenticatedCustomer(orderNumber, session.customer.id);
  if (!order) notFound();

  const isPickup = order.fulfillmentType === "STORE_PICKUP";
  const isDelivery = order.fulfillmentType === "LOCAL_DELIVERY";
  const isCounter = order.fulfillmentType === "COUNTER_HANDOVER";

  const [returnableItems, returnRequests] = await Promise.all([
    getReturnableItemsForOrder(orderNumber, session.customer.id),
    getReturnRequestsForOrder(orderNumber, session.customer.id),
  ]);
  const returnableByItemId = new Map((returnableItems ?? []).map((item) => [item.orderItemId, item]));

  const orderEligibility = getOrderReturnEligibility({
    orderStatus: order.status,
    deliveredAt: order.deliveredAt,
    now: new Date(),
  });
  const anyItemEligible = (returnableItems ?? []).some((item) => item.eligible);

  // Section 18: explain WHY, never just hide the action silently.
  let returnUnavailableReason: string | null = null;
  if (!orderEligibility.eligible) {
    returnUnavailableReason =
      orderEligibility.error.type === "ORDER_NOT_DELIVERED"
        ? "Return/exchange will be available once this order has been delivered."
        : `The return window (${RETURN_WINDOW_DAYS} days after delivery) has passed for this order.`;
  } else if (!anyItemEligible) {
    returnUnavailableReason = "Every item on this order has already been fully claimed by a return or exchange request.";
  }

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-5 px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/track/orders"
          className="flex h-10 w-fit items-center gap-1.5 text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          My Orders
        </Link>
        <CustomerLogoutButton />
      </div>

      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-mono text-xl font-semibold">{order.orderNumber}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {order.createdAt.toLocaleDateString("en-IN", { day: "numeric", month: "long", year: "numeric" })}
            {" · "}
            {getPortalSourceLabel(order.source)}
          </p>
          {order.customerWhatsapp && (
            <p className="mt-0.5 text-xs text-muted-foreground">
              Updates sent to WhatsApp at {order.customerWhatsapp}
            </p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-3 py-1.5 text-sm font-medium",
            ORDER_STATUS_BADGE_CLASS[order.status],
          )}
        >
          {ORDER_STATUS_LABEL[order.status]}
        </span>
      </div>

      {/* One continuous surface with hairline dividers between sections,
          instead of five independent bordered boxes stacked on top of each
          other — matches the "no card-in-card" precedent established on
          the Product Detail, Bag, and Checkout redesigns. */}
      <div className="flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        <section aria-labelledby="tracking-heading" className="flex flex-col gap-3 p-4">
          <h2 id="tracking-heading" className="font-heading text-base font-medium text-foreground">
            Order Status
          </h2>
          <OrderTrackingTimeline fulfillmentType={order.fulfillmentType} status={order.status} />
        </section>

        <section aria-labelledby="items-heading" className="flex flex-col gap-3 p-4">
          <h2 id="items-heading" className="font-heading text-base font-medium">
            Items
          </h2>
          <ul className="divide-y">
            {order.items.map((item) => {
              const returnInfo = returnableByItemId.get(item.id);
              // Section 13 — the customer sees what they actually paid
              // (effectiveLineTotalInPaise), never the catalog price, and
              // never any hint of how an order-level discount was
              // allocated across items. Equals the original price/total
              // whenever no discount applied — no visible change for the
              // vast majority of orders.
              const effectiveUnitPriceInPaise = Math.round(item.effectiveLineTotalInPaise / item.quantity);
              return (
                <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <div>
                    <p className="font-medium">{item.productName}</p>
                    <p className="text-xs text-muted-foreground">
                      Size {item.size} &middot; Qty {item.quantity} &middot; {formatPaise(effectiveUnitPriceInPaise)} each
                    </p>
                    {returnInfo && returnInfo.claimedQuantity > 0 && (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {returnInfo.returnableQuantity > 0
                          ? `${returnInfo.claimedQuantity} claimed · ${returnInfo.returnableQuantity} remaining`
                          : "Fully claimed"}
                      </p>
                    )}
                  </div>
                  <p className="font-medium">{formatPaise(item.effectiveLineTotalInPaise)}</p>
                </li>
              );
            })}
          </ul>

          {anyItemEligible ? (
            <Link
              href={`/track/orders/${orderNumber}/return`}
              className="flex h-11 items-center justify-between rounded-lg border px-3.5 text-sm font-medium hover:bg-muted"
            >
              Return or Exchange an Item
              <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
            </Link>
          ) : (
            returnUnavailableReason && (
              <p className="rounded-lg bg-muted/50 p-3 text-xs text-muted-foreground">{returnUnavailableReason}</p>
            )
          )}

          <div className="border-t pt-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPaise(order.subtotalInPaise)}</span>
            </div>
            {order.discountInPaise > 0 && (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatPaise(order.discountInPaise)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between">
              <span className="text-muted-foreground">Delivery</span>
              <span>{order.deliveryFeeInPaise > 0 ? formatPaise(order.deliveryFeeInPaise) : "Free"}</span>
            </div>
            <div className="mt-1 flex justify-between text-xs text-muted-foreground">
              <span>Taxes</span>
              <span>Included where applicable</span>
            </div>
            <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
              <span>Total</span>
              <span>{formatPaise(order.totalInPaise)}</span>
            </div>
          </div>
        </section>

        <section aria-labelledby="fulfillment-heading" className="flex flex-col gap-2 p-4">
          <h2 id="fulfillment-heading" className="font-heading text-base font-medium">
            {getFulfillmentLabel(order.fulfillmentType)}
          </h2>
          <div className="text-sm text-muted-foreground">
            {isPickup && (
              <div className="flex flex-col gap-1.5">
                <p>Collect from: {BRAND.legacyStoreNames[0]}</p>
                <p className="flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  <a href={STORE_CONTACT.phoneHref} className="underline underline-offset-2 hover:text-foreground">
                    Call {STORE_CONTACT.phone}
                  </a>
                  <a
                    href={STORE_CONTACT.mapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="underline underline-offset-2 hover:text-foreground"
                  >
                    Get Directions
                  </a>
                </p>
              </div>
            )}
            {isDelivery && (
              <div className="flex flex-col gap-0.5">
                <p className="font-medium text-foreground">Delivery to:</p>
                <p>{order.deliveryAddressLine}</p>
                {order.deliveryFormattedAddress && <p>{order.deliveryFormattedAddress}</p>}
                {order.deliveryLandmark && <p>Landmark: {order.deliveryLandmark}</p>}
              </div>
            )}
            {isCounter && <p>Completed at the store at time of purchase.</p>}
          </div>
        </section>

        <section aria-labelledby="payment-heading" className="flex flex-col gap-2 p-4">
          <h2 id="payment-heading" className="font-heading text-base font-medium">
            Payment
          </h2>
          <div className="text-sm">
            <p className="font-medium text-foreground">
              {getPaymentMethodLabel({ paymentMethod: order.paymentMethod, fulfillmentType: order.fulfillmentType })}
            </p>
            <p className="mt-1 text-muted-foreground">{PAYMENT_STATUS_LABEL[order.paymentStatus]}</p>
          </div>
        </section>

        <section aria-labelledby="invoice-heading" className="flex flex-col gap-2 p-4">
          <h2 id="invoice-heading" className="font-heading text-base font-medium">
            Invoice
          </h2>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/track/orders/${orderNumber}/invoice`}
              className="flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium hover:bg-muted"
            >
              <Eye className="size-4" aria-hidden />
              View Invoice
            </Link>
            <a
              href={`/api/track/orders/${orderNumber}/invoice`}
              download={`Invoice-${orderNumber}.pdf`}
              className="flex h-10 items-center gap-1.5 rounded-lg border px-3.5 text-sm font-medium hover:bg-muted"
            >
              <Download className="size-4" aria-hidden />
              Download Invoice
            </a>
          </div>
        </section>
      </div>

      {returnRequests && <ReturnHistory requests={returnRequests} />}

      <Button
        render={<Link href="/" />}
        nativeButton={false}
        variant="ghost"
        className="h-10 w-full text-muted-foreground"
      >
        Continue Shopping
      </Button>
    </div>
  );
}
