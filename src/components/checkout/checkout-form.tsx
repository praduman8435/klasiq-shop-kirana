"use client";

import { useId, useReducer, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProductThumbnail } from "@/components/product/product-thumbnail";
import { DeliveryAddressSearch } from "@/components/checkout/delivery-address-search";
import { checkoutFulfillmentReducer, type FulfillmentType } from "@/lib/checkout-fulfillment-state";
import { BRAND, STORE_CONTACT } from "@/lib/constants";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import { placeOrder } from "@/server/actions/checkout";
import { previewDeliveryFeeAction } from "@/server/actions/checkout-address";

type CheckoutItem = {
  id: string;
  productName: string;
  size: string;
  quantity: number;
  unitPriceInPaise: number;
  priceInPaiseAtAdd: number;
  imageUrl: string | null;
  categorySlugForPlaceholder: string;
};

type FulfillmentConfig = {
  pickupEnabled: boolean;
  deliveryEnabled: boolean;
  deliveryFeeInPaise: number;
  freeDeliveryThresholdInPaise: number;
  freeDeliveryRadiusMeters: number;
  serviceableAreaNote: string;
};

type FieldErrors = Record<string, string[]>;

type StockIssue = {
  productName: string;
  size: string;
  requestedQuantity: number;
  availableQuantity: number;
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  // Extremely old-browser fallback — never exercised by any evergreen
  // browser, but keeps this from throwing outright.
  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function CheckoutForm({
  items,
  subtotalInPaise,
  fulfillment,
  geoapifyConfigured,
}: {
  items: CheckoutItem[];
  subtotalInPaise: number;
  fulfillment: FulfillmentConfig;
  geoapifyConfigured: boolean;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const nameId = useId();
  const mobileId = useId();
  const whatsappId = useId();
  const addressId = useId();
  const landmarkId = useId();

  const defaultFulfillment: FulfillmentType = fulfillment.pickupEnabled
    ? "STORE_PICKUP"
    : "LOCAL_DELIVERY";

  const [customerName, setCustomerName] = useState("");
  const [customerMobile, setCustomerMobile] = useState("");
  const [whatsappSameAsPrimary, setWhatsappSameAsPrimary] = useState(true);
  const [whatsappPhone, setWhatsappPhone] = useState("");
  const [deliveryAddressLine, setDeliveryAddressLine] = useState("");
  const [deliveryLandmark, setDeliveryLandmark] = useState("");
  // fulfillmentType/destination/deliveryPreview are kept as ONE unit of
  // state via a reducer (not three independent useState calls) specifically
  // so that switching fulfillment type can never leave a stale selected
  // location/quote behind — see src/lib/checkout-fulfillment-state.ts and
  // docs/PHASE_3_3_REPORT.md Part 3 "Fulfillment switching".
  const [fulfillmentState, dispatchFulfillment] = useReducer(checkoutFulfillmentReducer, {
    fulfillmentType: defaultFulfillment,
    destination: null,
    deliveryPreview: null,
  });
  const { fulfillmentType, destination, deliveryPreview } = fulfillmentState;
  const setDestination = (next: typeof destination) =>
    dispatchFulfillment({ type: "SET_DESTINATION", destination: next });
  const setDeliveryPreview = (next: typeof deliveryPreview) =>
    dispatchFulfillment({ type: "SET_DELIVERY_PREVIEW", deliveryPreview: next });
  const [isRefreshingQuote, setIsRefreshingQuote] = useState(false);

  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [stockIssues, setStockIssues] = useState<StockIssue[] | null>(null);

  // Generated once per checkout page visit and resent unchanged on every
  // submit attempt (including retries after an error) — this is what lets
  // the server recognize "this is the same submission" for double-tap
  // protection. A brand new key is only ever created by loading this page
  // again, e.g. after starting a fresh checkout on a different basket.
  const [idempotencyKey] = useState(generateIdempotencyKey);

  // Store Pickup is always free and needs no server round-trip. Local
  // Delivery's fee is never computed in the browser — it's only known once
  // the server-backed preview (triggered by DeliveryAddressSearch after a
  // location is selected) returns. `null` means "not yet known", which
  // keeps the submit button disabled rather than showing a guessed amount.
  const deliveryFeeInPaise =
    fulfillmentType === "STORE_PICKUP" ? 0 : deliveryPreview?.deliveryFeeInPaise ?? null;
  const totalInPaise = subtotalInPaise + (deliveryFeeInPaise ?? 0);

  const paymentLabel = fulfillmentType === "STORE_PICKUP" ? "Pay at Store" : "Cash on Delivery";

  const canSubmit =
    fulfillmentType === "STORE_PICKUP" || (destination !== null && deliveryPreview !== null);

  function handleFulfillmentChange(next: FulfillmentType) {
    dispatchFulfillment({ type: "SET_FULFILLMENT_TYPE", fulfillmentType: next });
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return; // guards against a second click landing before React re-renders the disabled button

    setFormError(null);
    setStockIssues(null);

    startTransition(async () => {
      const result = await placeOrder({
        customerName,
        customerMobile,
        whatsappSameAsPrimary,
        whatsappPhone: !whatsappSameAsPrimary && whatsappPhone ? whatsappPhone : undefined,
        fulfillmentType,
        deliveryAddressLine: fulfillmentType === "LOCAL_DELIVERY" ? deliveryAddressLine : undefined,
        deliveryLandmark:
          fulfillmentType === "LOCAL_DELIVERY" && deliveryLandmark ? deliveryLandmark : undefined,
        destinationLat: fulfillmentType === "LOCAL_DELIVERY" ? destination?.lat : undefined,
        destinationLon: fulfillmentType === "LOCAL_DELIVERY" ? destination?.lon : undefined,
        destinationFormattedAddress:
          fulfillmentType === "LOCAL_DELIVERY" ? destination?.formattedAddress : undefined,
        expectedDeliveryFeeInPaise:
          fulfillmentType === "LOCAL_DELIVERY" ? deliveryPreview?.deliveryFeeInPaise : undefined,
        idempotencyKey,
      });

      if (result.success) {
        router.push(`/order/${result.orderNumber}/${result.accessToken}`);
        return;
      }

      const { error } = result;
      if (error.type === "VALIDATION") {
        setFieldErrors(error.fieldErrors);
        setFormError(error.message);
      } else if (error.type === "STOCK_ISSUE") {
        setFormError(error.message);
        setStockIssues(error.issues);
      } else if (error.type === "DELIVERY_QUOTE_STALE" && destination) {
        // The delivery cost changed between preview and submission (e.g.
        // the basket's subtotal crossed the free-delivery threshold). Never
        // silently resubmit the old amount — refresh the preview so the
        // customer sees the current total before trying again. See
        // docs/PHASE_3_3_REPORT.md Part 2 "Delivery quote consistency".
        setFormError(error.message);
        setDeliveryPreview(null);
        setIsRefreshingQuote(true);
        previewDeliveryFeeAction({ lat: destination.lat, lon: destination.lon })
          .then((preview) => {
            if (preview.success) {
              setDeliveryPreview({
                deliveryFeeInPaise: preview.deliveryFeeInPaise,
                routeDistanceMeters: preview.routeDistanceMeters,
              });
            }
          })
          .finally(() => setIsRefreshingQuote(false));
      } else {
        setFormError(error.message);
      }
    });
  }

  // Full dark redesign — compact consumer-app density throughout: 48px
  // inputs (`h-12`), 12px radii (`rounded-xl`) instead of the shared
  // `Input` component's own smaller defaults, tighter section rhythm
  // (`gap-5` instead of `gap-8`). Kept as one local constant so every
  // field below stays pixel-identical rather than drifting one at a
  // time.
  const fieldClassName = "h-12 rounded-xl px-3.5";

  return (
    <form onSubmit={handleSubmit} className="mt-5 flex flex-col gap-6" noValidate>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-xl border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{formError}</p>
            {stockIssues && (
              <ul className="mt-2 space-y-1">
                {stockIssues.map((issue) => (
                  <li key={`${issue.productName}-${issue.size}`}>
                    {issue.productName} ({issue.size}): only {issue.availableQuantity}{" "}
                    available, you requested {issue.requestedQuantity}.
                  </li>
                ))}
              </ul>
            )}
            {stockIssues && (
              <Link href="/bag" className="mt-2 inline-block underline underline-offset-2">
                Go back to your bag to adjust
              </Link>
            )}
          </div>
        </div>
      )}

      {/* Phase 3.7 Part 7 — two columns at desktop (contact/fulfillment/
          payment on the left, an always-visible sticky order summary +
          submit on the right), single stacked column unchanged below
          `lg`. Purely a layout change — every field, handler, and piece
          of state above is untouched. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-10">
      <div className="flex flex-1 flex-col gap-6 lg:max-w-xl">
      <section aria-labelledby="contact-heading" className="flex flex-col gap-2.5">
        <h2 id="contact-heading" className="font-heading text-lg font-semibold">
          Contact
        </h2>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={nameId}>Name</Label>
          <Input
            id={nameId}
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            autoComplete="name"
            required
            aria-invalid={Boolean(fieldErrors.customerName)}
            className={fieldClassName}
          />
          {fieldErrors.customerName && (
            <p className="text-xs text-destructive">{fieldErrors.customerName[0]}</p>
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={mobileId}>Mobile number</Label>
          <Input
            id={mobileId}
            type="tel"
            inputMode="tel"
            value={customerMobile}
            onChange={(e) => setCustomerMobile(e.target.value)}
            autoComplete="tel"
            placeholder="98765 43210"
            required
            aria-invalid={Boolean(fieldErrors.customerMobile)}
            className={fieldClassName}
          />
          {fieldErrors.customerMobile && (
            <p className="text-xs text-destructive">{fieldErrors.customerMobile[0]}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Checkbox
            id={`${whatsappId}-same`}
            checked={whatsappSameAsPrimary}
            onCheckedChange={setWhatsappSameAsPrimary}
          />
          <Label htmlFor={`${whatsappId}-same`} className="text-sm font-normal">
            WhatsApp number is same as primary phone
          </Label>
        </div>
        {!whatsappSameAsPrimary && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={whatsappId}>WhatsApp number</Label>
            <Input
              id={whatsappId}
              type="tel"
              inputMode="tel"
              value={whatsappPhone}
              onChange={(e) => setWhatsappPhone(e.target.value)}
              autoComplete="tel"
              placeholder="98765 43210"
              aria-invalid={Boolean(fieldErrors.whatsappPhone)}
              className={fieldClassName}
            />
            {fieldErrors.whatsappPhone && (
              <p className="text-xs text-destructive">{fieldErrors.whatsappPhone[0]}</p>
            )}
          </div>
        )}
      </section>

      <section aria-labelledby="fulfillment-heading" className="flex flex-col gap-2.5">
        <h2 id="fulfillment-heading" className="font-heading text-lg font-semibold">
          Delivery
        </h2>
        {/* A compact rectangular segmented control (not the pill-tab
            shape used for genuinely "selectable chip" controls elsewhere
            in the system, e.g. category chips) — the brief for this
            round explicitly calls for a modest 12px radius here, matching
            how Swiggy/Zomato/Blinkit-style checkouts render a pickup/
            delivery toggle as a real two-cell control rather than a pill
            tab bar. `flex-1` on each button (not a fixed `grid-cols-2`)
            keeps this correct even if only one fulfillment method is
            ever enabled, since it degrades to one full-width cell rather
            than leaving an empty grid track. */}
        <div role="tablist" aria-label="Fulfillment method" className="flex h-12 items-stretch gap-1 rounded-xl border bg-muted p-1">
          {fulfillment.pickupEnabled && (
            <button
              type="button"
              role="tab"
              aria-selected={fulfillmentType === "STORE_PICKUP"}
              onClick={() => handleFulfillmentChange("STORE_PICKUP")}
              className={cn(
                "flex-1 rounded-lg text-sm font-medium transition-colors",
                fulfillmentType === "STORE_PICKUP"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Store Pickup
            </button>
          )}
          {fulfillment.deliveryEnabled && (
            <button
              type="button"
              role="tab"
              aria-selected={fulfillmentType === "LOCAL_DELIVERY"}
              onClick={() => handleFulfillmentChange("LOCAL_DELIVERY")}
              className={cn(
                "flex-1 rounded-lg text-sm font-medium transition-colors",
                fulfillmentType === "LOCAL_DELIVERY"
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              Local Delivery
            </button>
          )}
        </div>

        {fulfillmentType === "STORE_PICKUP" && (
          <div className="flex flex-col gap-1.5 text-xs text-muted-foreground">
            <p>Free — no address needed. Collect your order at {BRAND.legacyStoreNames[0]}.</p>
            <p className="flex flex-wrap gap-x-3 gap-y-1">
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

        {fulfillmentType === "LOCAL_DELIVERY" && (
          <div className="flex flex-col gap-2.5 rounded-xl border bg-secondary/30 p-3.5">
            <p className="text-xs text-muted-foreground">{fulfillment.serviceableAreaNote}</p>
            <p className="text-xs text-muted-foreground">
              Free within {(fulfillment.freeDeliveryRadiusMeters / 1000).toFixed(1)}km of the
              store. Beyond that, delivery is free on orders of{" "}
              {formatPaise(fulfillment.freeDeliveryThresholdInPaise)} or more — otherwise a flat{" "}
              {formatPaise(fulfillment.deliveryFeeInPaise)} delivery fee applies.
            </p>
            {!geoapifyConfigured && (
              <p className="rounded-lg border border-amber-300 bg-amber-50 p-2.5 text-xs text-amber-900 dark:border-amber-900 dark:bg-amber-950 dark:text-amber-200">
                Address lookup is temporarily unavailable. Please choose Store Pickup, or{" "}
                <a href={STORE_CONTACT.phoneHref} className="underline underline-offset-2">
                  call us at {STORE_CONTACT.phone}
                </a>{" "}
                to arrange delivery.
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={addressId}>House / flat number, street</Label>
              <Input
                id={addressId}
                value={deliveryAddressLine}
                onChange={(e) => setDeliveryAddressLine(e.target.value)}
                autoComplete="address-line1"
                required
                disabled={!geoapifyConfigured}
                aria-invalid={Boolean(fieldErrors.deliveryAddressLine)}
                className={fieldClassName}
              />
              {fieldErrors.deliveryAddressLine && (
                <p className="text-xs text-destructive">{fieldErrors.deliveryAddressLine[0]}</p>
              )}
            </div>
            <DeliveryAddressSearch
              onSelectionChange={setDestination}
              onPreviewChange={setDeliveryPreview}
              disabled={!geoapifyConfigured}
            />
            {fieldErrors.destinationFormattedAddress && (
              <p className="text-xs text-destructive">
                {fieldErrors.destinationFormattedAddress[0]}
              </p>
            )}
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={landmarkId}>Landmark (optional)</Label>
              <Input
                id={landmarkId}
                value={deliveryLandmark}
                onChange={(e) => setDeliveryLandmark(e.target.value)}
                disabled={!geoapifyConfigured}
                className={fieldClassName}
              />
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="payment-heading" className="flex flex-col gap-2.5">
        <h2 id="payment-heading" className="font-heading text-lg font-semibold">
          Payment
        </h2>
        {/* A compact "payment method" card with an explicit selected
            checkmark — cash-on-collection/delivery is currently the only
            method this store supports, but the card still communicates
            "this is the (selected) payment method," the same way a real
            commerce checkout would present one method among several,
            rather than reading as a plain informational note. */}
        <div className="flex items-center gap-3 rounded-xl border bg-secondary/30 p-3.5 text-sm">
          <div className="min-w-0 flex-1">
            <p className="font-medium text-foreground">{paymentLabel}</p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {fulfillmentType === "STORE_PICKUP"
                ? "Pay in cash when you collect your order."
                : "Pay the delivery person in cash on arrival."}
            </p>
          </div>
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
            <Check className="size-3.5" aria-hidden />
          </span>
        </div>
      </section>
      </div>

      {/* Right column — no card-in-card, matching the Bag's own "one
          continuous surface" redesign: the product list and the totals
          block share one hairline-divided flow instead of two separate
          bordered `bg-card` boxes. A top border on mobile (stacked below
          the left column) becomes a left border on desktop, the same
          "subtle tonal separation, not a second card" treatment the Bag
          already established. */}
      <div className="flex flex-col gap-4 border-t pt-5 lg:sticky lg:top-24 lg:w-[340px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
      <section aria-labelledby="summary-heading" className="flex flex-col gap-3">
        <h2 id="summary-heading" className="font-heading text-base font-semibold">
          Order summary
        </h2>
        <ul className="divide-y divide-border">
          {items.map((item) => {
            const priceChanged = item.unitPriceInPaise !== item.priceInPaiseAtAdd;
            return (
              <li key={item.id} className="flex gap-2.5 py-2.5 first:pt-0 last:pb-0">
                <ProductThumbnail
                  imageUrl={item.imageUrl}
                  alt={item.productName}
                  categorySlug={item.categorySlugForPlaceholder}
                  compact
                  className="size-12 shrink-0"
                />
                <div className="flex flex-1 flex-col">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-medium leading-tight">{item.productName}</p>
                      <p className="text-xs text-muted-foreground">
                        {item.size} &middot; Qty {item.quantity}
                      </p>
                    </div>
                    <p className="text-sm font-medium">
                      {formatPaise(item.unitPriceInPaise * item.quantity)}
                    </p>
                  </div>
                  {priceChanged && (
                    <p className="mt-1 text-xs font-medium text-amber-700 dark:text-amber-400">
                      Price updated from {formatPaise(item.priceInPaiseAtAdd)} to{" "}
                      {formatPaise(item.unitPriceInPaise)}.
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ul>

        <div className="border-t pt-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span>{formatPaise(subtotalInPaise)}</span>
          </div>
          <div className="mt-1 flex justify-between">
            <span className="text-muted-foreground">Delivery</span>
            <span>
              {deliveryFeeInPaise === null
                ? "—"
                : deliveryFeeInPaise > 0
                  ? formatPaise(deliveryFeeInPaise)
                  : "Free"}
            </span>
          </div>
          <div className="mt-2 flex justify-between border-t pt-2 text-base font-semibold">
            <span>Total</span>
            <span>{deliveryFeeInPaise === null ? "—" : formatPaise(totalInPaise)}</span>
          </div>
        </div>
      </section>

      {/* Hidden below `sm` — the mobile sticky bar underneath is the sole
          checkout mechanism there, the identical Bag/PDP precedent, to
          avoid ever showing two competing "Place Order" controls in the
          same viewport. */}
      <Button
        type="submit"
        className="hidden h-12 w-full sm:flex"
        disabled={isPending || !canSubmit || isRefreshingQuote}
      >
        {isPending
          ? "Placing your order..."
          : fulfillmentType === "LOCAL_DELIVERY" && !canSubmit
            ? "Select a delivery location to continue"
            : `Place Order — ${formatPaise(totalInPaise)}`}
      </Button>
      </div>
      </div>

      {/* Mobile-only sticky "Place Order" bar — this button is still
          `type="submit"` inside this same `<form>`, so it triggers the
          identical `handleSubmit` as the (hidden-on-mobile) in-content
          button above; a `position:fixed` descendant of a `<form>`
          remains part of that form for submission purposes. Total shown
          on its own row above a full-width button, the same stacked
          layout the Bag's own sticky bar uses. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 px-4 pt-2 backdrop-blur supports-backdrop-filter:bg-card/80 sm:hidden">
        <div className="pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Total</span>
            <span className="font-heading font-semibold tabular-nums">
              {deliveryFeeInPaise === null ? "—" : formatPaise(totalInPaise)}
            </span>
          </div>
          <Button
            type="submit"
            className="mt-1.5 h-12 w-full"
            disabled={isPending || !canSubmit || isRefreshingQuote}
          >
            {isPending
              ? "Placing your order..."
              : fulfillmentType === "LOCAL_DELIVERY" && !canSubmit
                ? "Select a delivery location to continue"
                : "Place Order"}
          </Button>
        </div>
      </div>
    </form>
  );
}
