import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Bookmark, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import { formatPaise } from "@/lib/money";
import { getFulfillmentLabel, getPaymentMethodLabel } from "@/lib/order-message";
import { PAYMENT_STATUS_LABEL } from "@/lib/order-lifecycle";
import { getOrderByNumberAndToken } from "@/server/queries/orders";

type PageProps = {
  params: Promise<{ orderNumber: string; token: string }>;
};

export const metadata: Metadata = {
  title: "Order Confirmed",
  robots: { index: false, follow: false },
};

export default async function OrderConfirmationPage({ params }: PageProps) {
  const { orderNumber, token } = await params;
  const order = await getOrderByNumberAndToken(orderNumber, token);

  if (!order) {
    notFound();
  }

  const isPickup = order.fulfillmentType === "STORE_PICKUP";
  const isDelivery = order.fulfillmentType === "LOCAL_DELIVERY";

  return (
    <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6 sm:py-8">
      <div className="flex flex-col items-center text-center">
        <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <h1 className="mt-3 font-heading text-2xl font-semibold sm:text-3xl">
          Order confirmed
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          We&apos;ll have this ready for you soon.
          {order.customerWhatsapp && ` Updates go to WhatsApp at ${order.customerWhatsapp}.`}
        </p>
        <p className="mt-3 rounded-full bg-secondary px-4 py-1.5 font-mono text-sm font-medium">
          {order.orderNumber}
        </p>
      </div>

      <div className="mt-5 flex items-start gap-2.5 rounded-2xl bg-accent p-3.5">
        <Bookmark className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground">Save this page&apos;s link</span> — it&apos;s the
          only way to view this order again without verifying your mobile number.
        </p>
      </div>

      {/* One continuous surface with hairline dividers, matching the same
          "no card-in-card" precedent used on the customer portal's own
          order-detail page (see track/(protected)/orders/[orderNumber]). */}
      <div className="mt-5 flex flex-col divide-y overflow-hidden rounded-xl border bg-card">
        <section className="flex flex-col gap-3 p-4 sm:p-5">
          <h2 className="font-heading text-base font-medium">Items</h2>
          <ul className="divide-y">
            {order.items.map((item) => (
              <li key={item.id} className="flex items-center justify-between gap-3 py-3 text-sm">
                <div>
                  <p className="font-medium">{item.productName}</p>
                  <p className="text-xs text-muted-foreground">
                    {item.size} &middot; Qty {item.quantity}
                  </p>
                </div>
                {/* Section 13 — the customer's actual paid amount, never the
                    catalog price; identical to lineTotalInPaise whenever no
                    discount applied (every ONLINE order, always). */}
                <p className="font-medium">{formatPaise(item.effectiveLineTotalInPaise)}</p>
              </li>
            ))}
          </ul>

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
              <span>
                {order.deliveryFeeInPaise > 0 ? formatPaise(order.deliveryFeeInPaise) : "Free"}
              </span>
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

        <section className="flex flex-col gap-2 p-4 sm:p-5">
          <h2 className="font-heading text-base font-medium">
            {isPickup ? "Store Pickup" : isDelivery ? "Local Delivery" : "Counter Sale"}
          </h2>
          {isPickup && (
            <div className="flex flex-col gap-2 text-sm text-muted-foreground">
              <p>
                Bring this order number when you collect your order at {BRAND.legacyStoreNames[0]}.
              </p>
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
            <div className="text-sm text-muted-foreground">
              <p>{order.deliveryAddressLine}</p>
              {order.deliveryFormattedAddress && <p>{order.deliveryFormattedAddress}</p>}
              {order.deliveryArea && <p>{order.deliveryArea}</p>}
              {order.deliveryLandmark && <p>Landmark: {order.deliveryLandmark}</p>}
            </div>
          )}
          {!isPickup && !isDelivery && (
            <p className="text-sm text-muted-foreground">Collected in-store at time of sale.</p>
          )}
        </section>

        <section className="flex flex-col gap-2 p-4 sm:p-5">
          <h2 className="font-heading text-base font-medium">Payment</h2>
          <p className="text-sm text-muted-foreground">
            {getPaymentMethodLabel({
              paymentMethod: order.paymentMethod,
              fulfillmentType: order.fulfillmentType,
            })}
          </p>
          <p className="text-xs font-medium text-muted-foreground">
            Status: {PAYMENT_STATUS_LABEL[order.paymentStatus] ?? order.paymentStatus}
          </p>
        </section>

        <section className="flex flex-col gap-2 p-4 sm:p-5">
          <h2 className="font-heading text-base font-medium">Contact details</h2>
          <p className="text-sm text-muted-foreground">
            {order.customerName || order.customerMobile
              ? [order.customerName, order.customerMobile].filter(Boolean).join(" · ")
              : "Guest customer"}
          </p>
          <p className="text-xs text-muted-foreground">
            Fulfillment: {getFulfillmentLabel(order.fulfillmentType)}
          </p>
        </section>
      </div>

      <div className="mt-5 rounded-xl bg-secondary/30 p-4 text-center sm:p-5">
        <p className="text-sm font-medium text-foreground">Want updates on this order?</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Verify your mobile number anytime to see live status, your invoice, and request a return or exchange.
        </p>
        <Button render={<Link href="/track" />} nativeButton={false} className="mt-4 h-11 w-full sm:w-auto">
          Track My Orders
        </Button>
      </div>

      <Button
        render={<Link href="/" />}
        nativeButton={false}
        variant="ghost"
        className="mt-2 h-10 w-full text-muted-foreground"
      >
        Continue Shopping
      </Button>
    </div>
  );
}
