import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AlertTriangle, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { CheckoutForm } from "@/components/checkout/checkout-form";
import {
  basketTotalInPaise,
  getBasket,
  getConvertedBasketOrderLink,
} from "@/lib/basket";
import { computeCheckoutBlockingIssues } from "@/lib/basket-math";
import { FULFILLMENT_CONFIG } from "@/lib/fulfillment-config";
import { isGeoapifyConfigured } from "@/server/geoapify";

export const metadata: Metadata = {
  title: "Checkout",
  robots: { index: false },
};

export default async function CheckoutPage() {
  const basket = await getBasket();
  if (!basket || basket.items.length === 0) {
    // If this basket already produced an order (parent hit back/refresh
    // after placing it), send them straight to that confirmation instead
    // of confusingly telling them their bag is empty.
    const convertedOrder = await getConvertedBasketOrderLink();
    if (convertedOrder) {
      redirect(`/order/${convertedOrder.orderNumber}/${convertedOrder.accessToken}`);
    }

    return (
      <div className="mx-auto flex max-w-md flex-col items-center px-4 py-14 text-center sm:px-6">
        <span className="flex size-12 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <ShoppingBag className="size-5" aria-hidden />
        </span>
        <h1 className="mt-3 font-heading text-xl font-semibold">
          Your bag is empty
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Add something to your bag before checking out.
        </p>
        <Button render={<Link href="/" />} nativeButton={false} className="mt-5 h-11">
          Start Shopping
        </Button>
      </div>
    );
  }

  // Phase 3.7 Part 5 — Part 4 deliberately left unavailable/over-quantity
  // lines visible in the Bag (with an inline warning) rather than removing
  // them, but never gated Checkout on them — a customer could reach the
  // payment step with a deactivated/out-of-stock/over-quantity line and
  // only find out reactively, via the STOCK_ISSUE error, after submitting.
  // `resolveAndDecrementOrderLines` already rejects these at order-creation
  // time (the hard safety net), but that is not a substitute for telling
  // the customer clearly, before they fill in the rest of the form.
  const unavailableIssues = computeCheckoutBlockingIssues(basket.items);

  if (unavailableIssues.length > 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6 sm:px-6">
        <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
          Checkout
        </h1>
        <div className="mt-4 flex gap-3 rounded-xl border border-destructive/30 bg-destructive/5 p-4">
          <AlertTriangle className="mt-0.5 size-5 shrink-0 text-destructive" aria-hidden />
          <div>
            <p className="text-sm font-medium text-destructive">
              Some items in your bag need attention before you can check out
            </p>
            <ul className="mt-2 space-y-1 text-sm text-muted-foreground">
              {unavailableIssues.map((issue) => (
                <li key={issue.id}>
                  <span className="font-medium text-foreground">{issue.label}</span>
                  {" — "}
                  {issue.reason}.
                </li>
              ))}
            </ul>
            <p className="mt-3 text-sm text-muted-foreground">
              Go back to your bag to remove or adjust these items — nothing has been changed
              for you.
            </p>
          </div>
        </div>
        <Button render={<Link href="/bag" />} nativeButton={false} className="mt-5 h-11">
          Go to your Bag
        </Button>
      </div>
    );
  }

  const subtotalInPaise = basketTotalInPaise(basket);
  const items = basket.items.map((item) => ({
    id: item.id,
    productName: item.productVariant.product.name,
    size: item.productVariant.size,
    quantity: item.quantity,
    unitPriceInPaise: item.productVariant.priceInPaise,
    priceInPaiseAtAdd: item.priceInPaiseAtAdd,
    imageUrl: item.productVariant.product.imageUrl,
    categorySlugForPlaceholder: item.productVariant.product.category.slug,
  }));

  return (
    // Full dark redesign — matches the Bag/PDP "one continuous surface"
    // precedent (no card-in-card) and this round's compact-consumer-app
    // spacing discipline throughout `CheckoutForm` itself. Bottom padding
    // + `pb-28` clear the mobile-only sticky "Place Order" bar the form
    // renders internally, the same pattern as the Bag's own sticky bar.
    <div className="mx-auto max-w-5xl px-4 py-6 pb-28 sm:px-6 sm:pb-6">
      <h1 className="font-heading text-2xl font-semibold tracking-tight sm:text-3xl">
        Checkout
      </h1>
      <p className="mt-0.5 text-sm text-muted-foreground">
        No account needed — just a few details.
      </p>

      <CheckoutForm
        items={items}
        subtotalInPaise={subtotalInPaise}
        fulfillment={{
          pickupEnabled: FULFILLMENT_CONFIG.pickupEnabled,
          deliveryEnabled: FULFILLMENT_CONFIG.deliveryEnabled,
          deliveryFeeInPaise: FULFILLMENT_CONFIG.deliveryFeeInPaise,
          freeDeliveryThresholdInPaise: FULFILLMENT_CONFIG.freeDeliveryThresholdInPaise,
          freeDeliveryRadiusMeters: FULFILLMENT_CONFIG.freeDeliveryRadiusMeters,
          serviceableAreaNote: FULFILLMENT_CONFIG.serviceableAreaNote,
        }}
        geoapifyConfigured={isGeoapifyConfigured()}
      />
    </div>
  );
}
