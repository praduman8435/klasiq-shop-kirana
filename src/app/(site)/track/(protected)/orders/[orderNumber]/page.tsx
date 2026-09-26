import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, BookOpen, ChevronRight, Download, FileText, IndianRupee, MapPin, MessageCircle, Phone } from "lucide-react";
import { CancelOrderButton } from "@/components/customer-portal/cancel-order-button";
import { OrderStatusHero } from "@/components/customer-portal/order-status-hero";
import { ReorderButton } from "@/components/customer-portal/reorder-button";
import { ReturnHistory } from "@/components/customer-portal/return-history";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import { getOrderTotalQuantity } from "@/lib/customer-portal/order-presentation";
import { isActiveOrder, orderItemsSummary } from "@/lib/customer-portal/order-status-copy";
import { getCustomerSession } from "@/lib/customer-portal/session";
import { formatPaise } from "@/lib/money";
import { checkCustomerCanCancel } from "@/lib/order-lifecycle";
import { getOrderReturnEligibility } from "@/lib/return-eligibility";
import { RETURN_WINDOW_DAYS } from "@/lib/return-lifecycle";
import { getOrderForAuthenticatedCustomer } from "@/server/queries/customer-portal/orders";
import { getReturnRequestsForOrder, getReturnableItemsForOrder } from "@/server/queries/customer-portal/returns";

type PageProps = { params: Promise<{ orderNumber: string }> };

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { orderNumber } = await params;
  return { title: orderNumber, robots: { index: false, follow: false } };
}

const DATE_TIME = new Intl.DateTimeFormat("en-IN", {
  timeZone: "Asia/Kolkata",
  day: "numeric",
  month: "short",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

const secondaryAction =
  "inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-border bg-card px-3 text-sm font-bold text-foreground transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

/**
 * One order, scoped to the verified customer: someone else's order is
 * indistinguishable from one that doesn't exist (both 404). Status and
 * what to do next come first; the bill, delivery details and invoice
 * follow.
 */
export default async function TrackOrderDetailPage({ params }: PageProps) {
  const { orderNumber } = await params;
  const session = await getCustomerSession();
  if (!session) return null;
  if (!session.customer) notFound();

  const order = await getOrderForAuthenticatedCustomer(orderNumber, session.customer.id);
  if (!order) notFound();

  const [returnableItems, returnRequests] = await Promise.all([
    getReturnableItemsForOrder(orderNumber, session.customer.id),
    getReturnRequestsForOrder(orderNumber, session.customer.id),
  ]);
  const returnableByItemId = new Map((returnableItems ?? []).map((item) => [item.orderItemId, item]));
  const orderEligibility = getOrderReturnEligibility({ orderStatus: order.status, deliveredAt: order.deliveredAt, now: new Date() });
  const anyItemEligible = (returnableItems ?? []).some((item) => item.eligible);
  const showReturnNote = order.status === "DELIVERED" && order.fulfillmentType !== "COUNTER_HANDOVER";
  const returnUnavailableReason = !orderEligibility.eligible
    ? orderEligibility.error.type === "ORDER_NOT_DELIVERED"
      ? null
      : `Returns close ${RETURN_WINDOW_DAYS} days after delivery.`
    : anyItemEligible
      ? null
      : "Every item on this order already has a return or exchange request.";

  const active = isActiveOrder(order.status, order.fulfillmentType);
  const cancel = checkCustomerCanCancel(order);
  const count = getOrderTotalQuantity(order.items);
  const shopName = BRAND.legacyStoreNames[0] ?? BRAND.name;
  const isPickup = order.fulfillmentType === "STORE_PICKUP";
  const isDelivery = order.fulfillmentType === "LOCAL_DELIVERY";
  const whatsapp = `https://wa.me/${STORE_CONTACT.whatsapp}?text=${encodeURIComponent(
    `Namaste, mera order ${order.orderNumber} (${formatPaise(order.totalInPaise)}) ke baare mein baat karni hai.`,
  )}`;

  const payment = (() => {
    if (order.status === "CANCELLED") return { title: "Nothing to pay", detail: "This order was cancelled." };
    if (order.paymentStatus === "PAID") return { title: "Paid", detail: `${formatPaise(order.totalInPaise)} received by the shop.` };
    if (order.paymentStatus === "REFUNDED") return { title: "Refunded", detail: "The shop returned your money." };
    if (order.fulfillmentType === "COUNTER_HANDOVER") {
      return {
        title: order.amountReceivedInPaise > 0 ? `${formatPaise(order.amountReceivedInPaise)} paid` : "On your khata",
        detail: `${formatPaise(order.outstandingInPaise)} added to your khata with the shop.`,
        khata: true,
      };
    }
    return {
      title: `${formatPaise(order.totalInPaise)} to pay`,
      detail: isPickup ? "Pay in cash or UPI when you collect it." : "Pay in cash or UPI when it arrives.",
    };
  })();

  return (
    <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 py-5 sm:px-6 sm:py-8">
      <div className="flex items-center justify-between gap-3">
        <Link
          href="/track/orders"
          className="-ml-2 inline-flex h-10 items-center gap-1.5 rounded-xl px-2 text-sm font-bold text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ArrowLeft className="size-4" aria-hidden />
          My orders
        </Link>
        <div className="text-right">
          <h1 className="font-mono text-sm font-semibold">{order.orderNumber}</h1>
          <p className="text-xs text-muted-foreground">{DATE_TIME.format(order.createdAt)}</p>
        </div>
      </div>

      <OrderStatusHero order={order}>
        {!active && <ReorderButton orderNumber={order.orderNumber} variant="primary" className="h-12 w-full text-base" />}
        <div className="grid grid-cols-2 gap-2">
          <a href={STORE_CONTACT.phoneHref} className={secondaryAction}>
            <Phone className="size-4" aria-hidden />
            Call shop
          </a>
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className={secondaryAction}>
            <MessageCircle className="size-4" aria-hidden />
            WhatsApp
          </a>
        </div>
        {cancel.allowed && (
          <CancelOrderButton
            orderNumber={order.orderNumber}
            summary={`${order.orderNumber} · ${count} item${count === 1 ? "" : "s"} · ${formatPaise(order.totalInPaise)}. The shop sees the cancellation on their orders screen.`}
          />
        )}
        {!cancel.allowed && order.status === "OUT_FOR_DELIVERY" && (
          <p className="text-center text-xs text-muted-foreground">{cancel.reason}</p>
        )}
      </OrderStatusHero>

      <section aria-labelledby="items-heading" className="rounded-3xl border border-border bg-card p-5">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="items-heading" className="font-heading text-lg font-extrabold">
            {count} item{count === 1 ? "" : "s"}
          </h2>
          <span className="truncate text-xs text-muted-foreground">{orderItemsSummary(order.items, 1)}</span>
        </div>
        <ul className="mt-3 flex flex-col divide-y divide-border">
          {order.items.map((item) => {
            const returnInfo = returnableByItemId.get(item.id);
            const unit = Math.round(item.effectiveLineTotalInPaise / item.quantity);
            return (
              <li key={item.id} className="flex items-center gap-3 py-3">
                <ProductThumbnail
                  imageUrl={item.product?.imageUrl}
                  alt=""
                  categorySlug={item.product?.category.slug ?? ""}
                  compact
                  className="size-12 shrink-0 rounded-xl border border-border bg-card"
                />
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-2 text-sm font-semibold leading-snug">{item.productName}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                    {item.size} · {item.quantity} × {formatPaise(unit)}
                  </p>
                  {returnInfo && returnInfo.claimedQuantity > 0 && (
                    <p className="mt-0.5 text-xs font-semibold text-amber-700">
                      {returnInfo.returnableQuantity > 0
                        ? `${returnInfo.claimedQuantity} in a return · ${returnInfo.returnableQuantity} left`
                        : "In a return request"}
                    </p>
                  )}
                </div>
                <p className="shrink-0 text-sm font-extrabold tabular-nums">{formatPaise(item.effectiveLineTotalInPaise)}</p>
              </li>
            );
          })}
        </ul>

        <dl className="mt-2 flex flex-col gap-1.5 border-t border-dashed border-border pt-3 text-sm">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Items total</dt>
            <dd className="tabular-nums">{formatPaise(order.subtotalInPaise)}</dd>
          </div>
          {order.discountInPaise > 0 && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Discount</dt>
              <dd className="font-semibold text-emerald-700 tabular-nums">−{formatPaise(order.discountInPaise)}</dd>
            </div>
          )}
          {isDelivery && (
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Delivery</dt>
              <dd className="tabular-nums">{order.deliveryFeeInPaise > 0 ? formatPaise(order.deliveryFeeInPaise) : "Free"}</dd>
            </div>
          )}
          <div className="mt-1 flex justify-between border-t border-border pt-2.5 text-base font-extrabold">
            <dt>Bill total</dt>
            <dd className="tabular-nums">{formatPaise(order.totalInPaise)}</dd>
          </div>
        </dl>

        {anyItemEligible ? (
          <Link
            href={`/track/orders/${orderNumber}/return`}
            className="mt-4 flex h-12 items-center justify-between rounded-xl border border-border px-4 text-sm font-bold hover:bg-muted"
          >
            Return or exchange an item
            <ChevronRight className="size-4 text-muted-foreground" aria-hidden />
          </Link>
        ) : (
          showReturnNote &&
          returnUnavailableReason && <p className="mt-4 rounded-xl bg-muted px-3.5 py-2.5 text-xs text-muted-foreground">{returnUnavailableReason}</p>
        )}
      </section>

      <section aria-label="Delivery and payment" className="grid gap-4 rounded-3xl border border-border bg-card p-5">
        {(isPickup || isDelivery) && (
          <div className="flex gap-3">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
              <MapPin className="size-5" aria-hidden />
            </span>
            <div className="min-w-0 text-sm">
              <h2 className="font-bold">{isPickup ? "Collect from the shop" : "Delivering to"}</h2>
              {isPickup ? (
                <p className="mt-0.5 text-muted-foreground">
                  {shopName} ·{" "}
                  <a href={STORE_CONTACT.mapsUrl} target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline-offset-2 hover:underline">
                    Get directions
                  </a>
                </p>
              ) : (
                <div className="mt-0.5 text-muted-foreground">
                  <p>{order.deliveryAddressLine}</p>
                  {order.deliveryFormattedAddress && <p>{order.deliveryFormattedAddress}</p>}
                  {order.deliveryLandmark && <p>Near {order.deliveryLandmark}</p>}
                </div>
              )}
            </div>
          </div>
        )}
        <div className="flex gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
            <IndianRupee className="size-5" aria-hidden />
          </span>
          <div className="min-w-0 text-sm">
            <h2 className="font-bold">{payment.title}</h2>
            <p className="mt-0.5 text-muted-foreground">{payment.detail}</p>
            {"khata" in payment && payment.khata && order.outstandingInPaise > 0 && (
              <Link href="/track/khata" className="mt-1.5 inline-flex items-center gap-1 font-semibold text-primary hover:underline">
                <BookOpen className="size-4" aria-hidden />
                See Mera Khata
              </Link>
            )}
          </div>
        </div>
      </section>

      {order.status !== "CANCELLED" && (
        <section aria-labelledby="bill-heading" className="flex items-center gap-3 rounded-3xl border border-border bg-card p-4">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted">
            <FileText className="size-5" aria-hidden />
          </span>
          <h2 id="bill-heading" className="min-w-0 flex-1 text-sm font-bold">
            Bill
          </h2>
          <Link href={`/track/orders/${orderNumber}/invoice`} className="inline-flex h-10 items-center rounded-xl px-3 text-sm font-bold text-primary hover:bg-accent">
            View
          </Link>
          <a
            href={`/api/track/orders/${orderNumber}/invoice`}
            download={`Bill-${orderNumber}.pdf`}
            className="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border px-3 text-sm font-bold hover:bg-muted"
          >
            <Download className="size-4" aria-hidden />
            PDF
          </a>
        </section>
      )}

      {returnRequests && returnRequests.length > 0 && <ReturnHistory requests={returnRequests} />}
    </div>
  );
}
