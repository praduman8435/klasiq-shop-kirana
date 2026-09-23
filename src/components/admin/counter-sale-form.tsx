"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle2, Minus, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  CounterSaleAddressPanel,
  hasAnyAddressField,
  initialAddressFormState,
  type AddressFormState,
} from "@/components/admin/counter-sale-address-panel";
import {
  CounterSaleCustomerPanel,
  type CustomerMode,
  type CustomerSearchResult,
} from "@/components/admin/counter-sale-customer-panel";
import {
  CounterSaleDiscountPanel,
  initialDiscountFormState,
  resolveDiscountReason,
  type DiscountFormState,
} from "@/components/admin/counter-sale-discount-panel";
import {
  CounterSalePaymentPanel,
  initialPaymentFormState,
  type PaymentFormState,
} from "@/components/admin/counter-sale-payment-panel";
import {
  CounterSaleProductSearch,
  type VariantSearchResult,
} from "@/components/admin/counter-sale-product-search";
import { SendInvoiceWhatsAppButton } from "@/components/admin/send-invoice-whatsapp-button";
import { type CounterSaleAddressInput } from "@/lib/counter-sale-address";
import { computeDiscountInPaise, type DiscountInput } from "@/lib/discount";
import { formatPaise, rupeesToPaise } from "@/lib/money";
import { computePaymentOutcome, type PaymentInput } from "@/lib/payment";
import {
  addLineToCart,
  computeCartTotals,
  getCounterSaleSubmitGate,
  removeLineFromCart,
  updateLineQuantity,
  type CounterSaleCartLine,
} from "@/lib/counter-sale-form";
import { cn } from "@/lib/utils";
import { COUNTER_SALE_PAYMENT_METHOD_VALUES } from "@/lib/validation/admin-counter-sale";
import { createCounterSaleAction } from "@/server/actions/admin/counter-sale";

/**
 * Converts the discount panel's raw string inputs into the `{type,
 * value}` shape both the live preview (`computeDiscountInPaise`) and the
 * real submission (`createCounterSaleAction`) need — `null` for "No
 * Discount" or an input that isn't even parseable yet (e.g. an empty or
 * non-numeric field), so neither ever sees a bogus zero/NaN value.
 */
function resolveDiscountInput(state: DiscountFormState): DiscountInput {
  if (state.mode === "NONE") return null;
  if (state.mode === "FLAT") {
    const rupees = Number(state.flatAmountRupees);
    if (!Number.isFinite(rupees) || state.flatAmountRupees.trim() === "") return null;
    return { type: "FLAT", value: rupeesToPaise(rupees) };
  }
  const percent = Number(state.percentValue);
  if (!Number.isFinite(percent) || state.percentValue.trim() === "") return null;
  return { type: "PERCENTAGE", value: Math.round(percent) };
}

/**
 * Converts the payment panel's raw string input into the `{mode, ...}`
 * shape both the live preview (`computePaymentOutcome`) and the real
 * submission (`createCounterSaleAction`) need — FULL never carries an
 * amount at all; PARTIAL resolves to `null` (not yet a valid amount) when
 * the field is empty or unparseable, so neither preview nor submit ever
 * sees a bogus NaN value.
 */
function resolvePaymentInput(state: PaymentFormState): PaymentInput | null {
  if (state.mode === "FULL") return { mode: "FULL" };
  const rupees = Number(state.amountReceivedRupees);
  if (!Number.isFinite(rupees) || state.amountReceivedRupees.trim() === "") return null;
  return { mode: "PARTIAL", amountReceivedInPaise: rupeesToPaise(rupees) };
}

/**
 * Converts the address panel's raw form state into the `{mode, ...}`
 * shape `createCounterSaleAction` needs — section 3's "no validation":
 * unlike discount/payment, there is no "not yet resolvable" state here,
 * since a blank field is always simply blank, never invalid. `SAVED`
 * carries no field values at all — the server re-resolves the actual
 * address from the customer's own current saved record, never trusting
 * anything echoed back from the client (see docs/PHASE_3_6_6_REPORT.md
 * Part 1 "Security").
 */
function resolveAddressInput(state: AddressFormState): CounterSaleAddressInput {
  if (state.mode === "NONE") return { mode: "NONE" };
  if (state.mode === "SAVED") return { mode: "SAVED" };
  return {
    mode: "ONE_TIME",
    addressLine: state.addressLine.trim() || undefined,
    city: state.city.trim() || undefined,
    state: state.state.trim() || undefined,
    pincode: state.pincode.trim() || undefined,
  };
}

type PaymentMethodValue = (typeof COUNTER_SALE_PAYMENT_METHOD_VALUES)[number];

const PAYMENT_METHOD_LABEL: Record<PaymentMethodValue, string> = {
  CASH: "Cash",
  UPI: "UPI",
  CARD: "Card",
};

function generateIdempotencyKey(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `fallback-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function customerLabelForSummary(params: {
  mode: CustomerMode;
  selectedCustomer: CustomerSearchResult | null;
}): string {
  if (params.mode === "GUEST") return "Guest";
  if (!params.selectedCustomer) return "Not selected yet";
  return [params.selectedCustomer.customerId, params.selectedCustomer.displayName]
    .filter(Boolean)
    .join(" · ");
}

type CompletedSale = {
  orderNumber: string;
  lines: CounterSaleCartLine[];
  customerLabel: string;
  paymentMethod: PaymentMethodValue;
  subtotalInPaise: number;
  discountInPaise: number;
  totalInPaise: number;
  /** Phase 3.6.5 Part 3 — only meaningfully different from `totalInPaise`
   * / `0` when Partial Payment was chosen; the success screen only shows
   * these as a distinct line when `isPartialPayment` is true. */
  amountReceivedInPaise: number;
  outstandingInPaise: number;
  isPartialPayment: boolean;
};

export function CounterSaleForm() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [lines, setLines] = useState<CounterSaleCartLine[]>([]);
  const [customerMode, setCustomerMode] = useState<CustomerMode>("GUEST");
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerSearchResult | null>(null);

  const [discountFormState, setDiscountFormState] = useState<DiscountFormState>(initialDiscountFormState);
  const [paymentFormState, setPaymentFormState] = useState<PaymentFormState>(initialPaymentFormState);
  const [addressFormState, setAddressFormState] = useState<AddressFormState>(initialAddressFormState);

  // Section 2 — Partial payment is only meaningful with a Customer
  // attached. Switching to Guest mid-edit reverts an in-progress Partial
  // choice back to Full rather than leaving a now-invalid selection
  // sitting behind a disabled button. Handled at the point of the mode
  // change itself (not a useEffect) — a derived state update belongs in
  // the event that causes it, not a synchronized side effect.
  //
  // Section 4 — Guest has no saved-address concept at all, so any
  // in-progress address choice is reset too, same reasoning as Payment.
  function handleCustomerModeChange(mode: CustomerMode) {
    setCustomerMode(mode);
    if (mode === "GUEST") {
      setPaymentFormState((prev) => (prev.mode === "PARTIAL" ? initialPaymentFormState() : prev));
      setAddressFormState(initialAddressFormState());
    }
  }

  // Section 4 — a DIFFERENT customer means a DIFFERENT (or absent) saved
  // address; the address panel must reflect the newly-selected
  // customer's own record, not whatever was showing for a previous
  // pick (or Guest). Defaults to "Use Saved Address" when one exists —
  // zero extra clicks for the common repeat-customer case — otherwise
  // the plain optional fields (see CounterSaleAddressPanel).
  function handleSelectCustomer(customer: CustomerSearchResult | null) {
    setSelectedCustomer(customer);
    const savedAddress = customer
      ? { addressLine: customer.addressLine, city: customer.addressCity, state: customer.addressState, pincode: customer.addressPincode }
      : null;
    setAddressFormState(
      hasAnyAddressField(savedAddress) ? { ...initialAddressFormState(), mode: "SAVED" } : initialAddressFormState(),
    );
  }

  const [paymentMethod, setPaymentMethod] = useState<PaymentMethodValue>("CASH");

  const [idempotencyKey, setIdempotencyKey] = useState(generateIdempotencyKey);
  const [formError, setFormError] = useState<string | null>(null);
  const [stockIssues, setStockIssues] = useState<
    { productName: string; size: string; requestedQuantity: number; availableQuantity: number }[] | null
  >(null);
  const [completedSale, setCompletedSale] = useState<CompletedSale | null>(null);

  const startNewSaleHeadingId = useId();

  const totals = computeCartTotals(lines);

  // Phase 3.6.5 Part 2 — live preview only, via the SAME function the
  // server independently re-runs at submit time (see "Security" in
  // docs/PHASE_3_6_5_REPORT.md Part 2). Never trusted as the final
  // amount — `createCounterSaleAction` recomputes this from its own
  // freshly-resolved subtotal regardless of what's shown here.
  //
  // Three distinct UI states, not two: a discount type chosen but no
  // value typed yet shows neither an amount nor an error (nothing to
  // report yet); a typed-but-invalid value shows the validation message;
  // a valid value shows the actual discount. `resolveDiscountInput`
  // returns `null` for BOTH "No Discount" and "not yet parseable," so
  // that ambiguity is resolved here, not inside computeDiscountInPaise
  // (which would otherwise report a valid, misleading "₹0 off").
  const discountInput = resolveDiscountInput(discountFormState);
  let previewDiscountInPaise: number | null = null;
  let previewDiscountError: string | null = null;
  if (discountFormState.mode !== "NONE" && discountInput !== null) {
    const discountPreview = computeDiscountInPaise({ subtotalInPaise: totals.subtotalInPaise, discount: discountInput });
    if (discountPreview.success) previewDiscountInPaise = discountPreview.discountInPaise;
    else previewDiscountError = discountPreview.error.message;
  }
  const grandTotalInPaise = totals.subtotalInPaise - (previewDiscountInPaise ?? 0);

  // Phase 3.6.5 Part 3 — same live-preview-via-the-same-function pattern
  // as the discount preview above, using `computePaymentOutcome`
  // (src/lib/payment.ts) — the EXACT function the server independently
  // re-runs at submit time. Never trusted as the final amount.
  const paymentInput = resolvePaymentInput(paymentFormState);
  const paymentOutcomeResult =
    paymentInput !== null ? computePaymentOutcome({ grandTotalInPaise, payment: paymentInput }) : null;
  const previewOutstandingInPaise: number | null =
    paymentFormState.mode === "PARTIAL" && paymentOutcomeResult?.success
      ? paymentOutcomeResult.outcome.outstandingInPaise
      : null;
  const previewPaymentError: string | null =
    paymentFormState.mode === "PARTIAL" && paymentOutcomeResult && !paymentOutcomeResult.success
      ? paymentOutcomeResult.error.message
      : null;

  function addVariant(variant: VariantSearchResult) {
    setLines((prev) =>
      addLineToCart(prev, {
        variantId: variant.variantId,
        productName: variant.productName,
        size: variant.size,
        sku: variant.sku,
        priceInPaise: variant.priceInPaise,
        stockQuantity: variant.stockQuantity,
      }),
    );
    toast.success(`Added ${variant.productName} (${variant.size}).`);
  }

  function clearCart() {
    setLines([]);
  }

  function resetForm() {
    setLines([]);
    setCustomerMode("GUEST");
    setSelectedCustomer(null);
    setDiscountFormState(initialDiscountFormState());
    setPaymentFormState(initialPaymentFormState());
    setAddressFormState(initialAddressFormState());
    setPaymentMethod("CASH");
    setIdempotencyKey(generateIdempotencyKey());
    setFormError(null);
    setStockIssues(null);
  }

  function startNewSale() {
    setCompletedSale(null);
    resetForm();
  }

  function handleSubmit(event: React.FormEvent) {
    event.preventDefault();

    // A discount TYPE chosen with no value yet typed is a distinct block
    // from "no discount at all" — `discountInput` is `null` in both
    // cases (see its own doc comment), so this must be checked here,
    // before the gate, which only ever sees the resolved value.
    if (discountFormState.mode !== "NONE" && discountInput === null) {
      setFormError("Enter a discount value, or switch back to No Discount.");
      return;
    }

    // Same "type chosen but not yet resolved" block as discount, above —
    // `paymentInput` is `null` here only when Partial is chosen with no
    // valid amount typed yet.
    if (paymentFormState.mode === "PARTIAL" && paymentInput === null) {
      setFormError("Enter the amount received, or switch back to Full Payment.");
      return;
    }
    const payment: PaymentInput = paymentInput ?? { mode: "FULL" };

    const gate = getCounterSaleSubmitGate({
      isSubmitting: isPending,
      lines,
      customer:
        customerMode === "GUEST"
          ? { mode: "GUEST" }
          : { mode: "CUSTOMER", selectedCustomerId: selectedCustomer?.id ?? null },
      discount: discountInput,
      payment,
    });
    if (gate.blocked) {
      setFormError(gate.message);
      return;
    }

    setFormError(null);
    setStockIssues(null);

    // Phase 3.6.5 Part 1 — by the time a customer is selected here, a real
    // Customer row already exists (found by search, a Recent Customers
    // pick, or just created inline) — this always maps to the server's
    // EXISTING mode; the NEW mode remains part of the domain contract
    // (src/server/commerce/counter-sale.ts) but this redesigned UI never
    // constructs it. See docs/PHASE_3_6_5_REPORT.md Part 1 "Architecture".
    const customer =
      customerMode === "GUEST"
        ? ({ mode: "GUEST" } as const)
        : ({ mode: "EXISTING", customerId: selectedCustomer!.id } as const);

    // Snapshot exactly what's being submitted so the success screen can
    // render instantly from data already on the client — no extra request
    // to re-fetch the order we just created ourselves.
    const summarySnapshot: Omit<CompletedSale, "orderNumber"> = {
      lines,
      customerLabel: customerLabelForSummary({ mode: customerMode, selectedCustomer }),
      paymentMethod,
      subtotalInPaise: totals.subtotalInPaise,
      discountInPaise: previewDiscountInPaise ?? 0,
      totalInPaise: grandTotalInPaise,
      // The gate above already validated `payment`, so `paymentOutcomeResult`
      // (computed from that same input) is guaranteed successful here — the
      // `grandTotalInPaise` fallback only satisfies TypeScript's narrowing.
      amountReceivedInPaise: paymentOutcomeResult?.success
        ? paymentOutcomeResult.outcome.amountReceivedInPaise
        : grandTotalInPaise,
      outstandingInPaise: paymentOutcomeResult?.success ? paymentOutcomeResult.outcome.outstandingInPaise : 0,
      isPartialPayment: payment.mode === "PARTIAL",
    };

    startTransition(async () => {
      // A network failure or an unexpected server exception must never
      // leave the cashier uncertain whether the sale went through — see
      // docs/PHASE_3_2_REPORT.md "Validation review" (interrupted
      // requests). createCounterSaleAction itself never throws (it has its
      // own internal try/catch and always returns a result object); the
      // only way this can throw is a genuine transport-level failure, and
      // the one clear thing to tell the cashier in that case is: check the
      // orders list before retrying, since the sale may or may not have
      // reached the server.
      let result: Awaited<ReturnType<typeof createCounterSaleAction>>;
      try {
        result = await createCounterSaleAction({
          lines: lines.map((line) => ({ productVariantId: line.variantId, quantity: line.quantity })),
          customer,
          paymentMethod,
          idempotencyKey,
          discount: discountInput ? { ...discountInput, reason: resolveDiscountReason(discountFormState) } : null,
          payment,
          address: resolveAddressInput(addressFormState),
        });
      } catch {
        const message =
          "Could not confirm this sale — check your connection. Before retrying, check Orders to see if it already went through.";
        setFormError(message);
        toast.error(message);
        return;
      }

      if (result.success) {
        setCompletedSale({ orderNumber: result.orderNumber, ...summarySnapshot });
        router.refresh();
        return;
      }

      const { error } = result;
      if (error.type === "STOCK_ISSUE") {
        setFormError(error.message);
        setStockIssues(error.issues);
        toast.error("Some items are no longer available.");
      } else {
        setFormError(error.message);
        toast.error(error.message);
      }
    });
  }

  if (completedSale) {
    return (
      <div
        role="status"
        aria-labelledby={startNewSaleHeadingId}
        className="flex flex-col items-center gap-5 py-6 text-center"
      >
        <span className="flex size-12 items-center justify-center rounded-full bg-emerald-500/15 text-emerald-500">
          <CheckCircle2 className="size-6" aria-hidden />
        </span>
        <div>
          <h2 id={startNewSaleHeadingId} className="text-lg font-semibold">
            Sale complete
          </h2>
          <p className="mt-1 font-mono text-sm text-muted-foreground">{completedSale.orderNumber}</p>
        </div>

        <div className="w-full max-w-md rounded-lg border border-border/70 bg-secondary/20 p-4 text-left text-sm">
          <div className="flex justify-between gap-2">
            <span className="text-muted-foreground">Source</span>
            <span className="font-medium">Counter Sale</span>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <span className="text-muted-foreground">Customer</span>
            <span className="font-medium">{completedSale.customerLabel}</span>
          </div>
          <div className="mt-1 flex justify-between gap-2">
            <span className="text-muted-foreground">Payment</span>
            <span className="font-medium">{PAYMENT_METHOD_LABEL[completedSale.paymentMethod]}</span>
          </div>

          <ul className="mt-3 divide-y divide-border border-t border-border pt-2">
            {completedSale.lines.map((line) => (
              <li key={line.variantId} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0 truncate">
                  {line.productName} ({line.size}) &times;{line.quantity}
                </span>
                <span className="shrink-0 font-medium">
                  {formatPaise(line.priceInPaise * line.quantity)}
                </span>
              </li>
            ))}
          </ul>

          <div className="mt-2 border-t border-border pt-2">
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPaise(completedSale.subtotalInPaise)}</span>
            </div>
            {completedSale.discountInPaise > 0 && (
              <div className="mt-1 flex justify-between text-sm">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatPaise(completedSale.discountInPaise)}</span>
              </div>
            )}
            <div className="mt-1 flex justify-between text-base font-semibold">
              <span>Grand Total</span>
              <span>{formatPaise(completedSale.totalInPaise)}</span>
            </div>
            {completedSale.isPartialPayment && (
              <>
                <div className="mt-1 flex justify-between text-sm">
                  <span className="text-muted-foreground">Received</span>
                  <span>{formatPaise(completedSale.amountReceivedInPaise)}</span>
                </div>
                <div className="mt-1 flex justify-between text-sm font-semibold text-amber-500">
                  <span>Outstanding</span>
                  <span>{formatPaise(completedSale.outstandingInPaise)}</span>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Phase 3.6.6 Part 3, section 3 — the same shared "Send Invoice
            over WhatsApp" implementation reused verbatim from the Admin
            Order Detail and Admin Invoice pages, letting the customer's
            invoice go out immediately while they're still at the
            counter, without leaving this screen. */}
        <SendInvoiceWhatsAppButton orderNumber={completedSale.orderNumber} className="h-10 w-full max-w-md" />

        <Button type="button" className="h-11 w-full max-w-md" onClick={startNewSale} autoFocus>
          Start New Sale
        </Button>
      </div>
    );
  }

  const submitDisabled =
    isPending || lines.length === 0 || Boolean(previewDiscountError) || Boolean(previewPaymentError);
  const completeSaleLabel = isPending ? "Recording sale..." : "Complete Sale";
  const customerSummaryLabel = customerLabelForSummary({ mode: customerMode, selectedCustomer });

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-5 pb-24 lg:pb-0" noValidate>
      {formError && (
        <div
          role="alert"
          className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-destructive/10 p-3.5 text-sm text-destructive"
        >
          <AlertTriangle className="mt-0.5 size-4 shrink-0" aria-hidden />
          <div>
            <p className="font-medium">{formError}</p>
            {stockIssues && (
              <ul className="mt-2 space-y-1">
                {stockIssues.map((issue) => (
                  <li key={`${issue.productName}-${issue.size}`}>
                    {issue.productName} ({issue.size}): only {issue.availableQuantity} available,
                    requested {issue.requestedQuantity}.
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      {/* Two-column workspace at `lg` — main sale configuration on the
          left (~65-70%), a sticky Payment/transaction panel on the right
          (~30-35%), the same `flex-col lg:flex-row` + `lg:sticky`
          technique already proven on the customer Bag/Checkout redesign.
          Single column, natural document order, on mobile — the Payment
          panel simply falls in the normal flow there instead of pinning
          to a side rail. No section below is its own bordered card,
          continuous surface. */}
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <div className="flex flex-1 flex-col gap-5 lg:max-w-2xl">
          <section>
            <h2 className="text-sm font-semibold">Add items</h2>
            <div className="mt-2">
              <CounterSaleProductSearch onAdd={addVariant} />
            </div>

            {lines.length === 0 ? (
              <div className="mt-3 rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm font-medium text-foreground">No items added</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Search for a product or SKU to begin the sale.
                </p>
              </div>
            ) : (
              <>
                <div className="mt-3 flex items-center justify-between">
                  <p className="text-xs text-muted-foreground">
                    {totals.lineCount} product{totals.lineCount === 1 ? "" : "s"} &middot;{" "}
                    {totals.totalQuantity} unit{totals.totalQuantity === 1 ? "" : "s"}
                  </p>
                  <button
                    type="button"
                    onClick={clearCart}
                    className="flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <Trash2 className="size-3.5" aria-hidden />
                    Clear cart
                  </button>
                </div>
                <ul className="mt-1 divide-y divide-border">
                  {lines.map((line) => (
                    <li key={line.variantId} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">
                          {line.productName} &middot; {line.size}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          SKU {line.sku} &middot; {formatPaise(line.priceInPaise)} each
                          {line.quantity >= line.stockQuantity && (
                            <span className="ml-1 font-medium text-amber-500">&middot; max available</span>
                          )}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2.5">
                        <div className="flex h-8 items-center rounded-md border border-border">
                          <button
                            type="button"
                            aria-label={`Decrease quantity for ${line.productName} ${line.size}`}
                            onClick={() => setLines((prev) => updateLineQuantity(prev, line.variantId, -1))}
                            className="flex h-full w-7 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            <Minus className="size-3.5" aria-hidden />
                          </button>
                          <span className="w-7 text-center text-xs font-semibold tabular-nums">
                            {line.quantity}
                          </span>
                          <button
                            type="button"
                            aria-label={`Increase quantity for ${line.productName} ${line.size}`}
                            disabled={line.quantity >= line.stockQuantity}
                            onClick={() => setLines((prev) => updateLineQuantity(prev, line.variantId, 1))}
                            className="flex h-full w-7 items-center justify-center text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40"
                          >
                            <Plus className="size-3.5" aria-hidden />
                          </button>
                        </div>
                        <p className="w-16 shrink-0 text-right text-sm font-medium">
                          {formatPaise(line.priceInPaise * line.quantity)}
                        </p>
                        <button
                          type="button"
                          aria-label={`Remove ${line.productName} ${line.size}`}
                          onClick={() => setLines((prev) => removeLineFromCart(prev, line.variantId))}
                          className="flex size-7 items-center justify-center text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <X className="size-4" aria-hidden />
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">Customer</h2>
            <div className="mt-2">
              <CounterSaleCustomerPanel
                mode={customerMode}
                onModeChange={handleCustomerModeChange}
                selectedCustomer={selectedCustomer}
                onSelectCustomer={handleSelectCustomer}
              />
            </div>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">
              Address <span className="font-normal text-muted-foreground">(optional)</span>
            </h2>
            <div className="mt-2">
              <CounterSaleAddressPanel
                state={addressFormState}
                onChange={setAddressFormState}
                savedAddress={
                  customerMode === "CUSTOMER" && selectedCustomer
                    ? {
                        addressLine: selectedCustomer.addressLine,
                        city: selectedCustomer.addressCity,
                        state: selectedCustomer.addressState,
                        pincode: selectedCustomer.addressPincode,
                      }
                    : null
                }
              />
            </div>
          </section>

          <div className="border-t border-border" />

          <section>
            <h2 className="text-sm font-semibold">
              Discount <span className="font-normal text-muted-foreground">(optional)</span>
            </h2>
            <div className="mt-2">
              <CounterSaleDiscountPanel
                state={discountFormState}
                onChange={setDiscountFormState}
                previewDiscountInPaise={previewDiscountInPaise}
                previewError={previewDiscountError}
              />
            </div>
          </section>

        </div>

        {/* Transaction/Payment panel — inline in document flow on mobile
            (falls naturally after Discount above), sticky right rail on
            desktop. The Complete Sale button here is desktop-only
            (`hidden lg:block`); the mobile-only fixed bottom bar below is
            the sole submit control below `lg`, identical in spirit to
            the Bag/Checkout "one CTA visible per breakpoint, never two
            at once" rule already established on the customer storefront. */}
        <div className="flex flex-col gap-4 border-t border-border pt-5 lg:sticky lg:top-6 lg:w-[340px] lg:shrink-0 lg:border-t-0 lg:border-l lg:pl-8 lg:pt-0">
          <h2 className="text-sm font-semibold">Payment</h2>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Payment method</p>
            <div className="mt-1.5 grid grid-cols-3 gap-1.5">
              {COUNTER_SALE_PAYMENT_METHOD_VALUES.map((method) => (
                <button
                  key={method}
                  type="button"
                  aria-pressed={paymentMethod === method}
                  onClick={() => setPaymentMethod(method)}
                  className={cn(
                    "h-10 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                    paymentMethod === method
                      ? "border-primary bg-primary text-primary-foreground"
                      : "border-border text-muted-foreground hover:text-foreground",
                  )}
                >
                  {PAYMENT_METHOD_LABEL[method]}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-muted-foreground">Amount</p>
            <div className="mt-1.5">
              <CounterSalePaymentPanel
                state={paymentFormState}
                onChange={setPaymentFormState}
                partialDisabled={customerMode === "GUEST"}
                previewOutstandingInPaise={previewOutstandingInPaise}
                previewError={previewPaymentError}
              />
            </div>
          </div>

          <div className="rounded-lg bg-secondary/20 p-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Subtotal</span>
              <span>{formatPaise(totals.subtotalInPaise)}</span>
            </div>
            {previewDiscountInPaise ? (
              <div className="mt-1 flex justify-between">
                <span className="text-muted-foreground">Discount</span>
                <span>-{formatPaise(previewDiscountInPaise)}</span>
              </div>
            ) : null}
            <div className="mt-1.5 flex justify-between border-t border-border pt-1.5 text-base font-semibold">
              <span>Grand Total</span>
              <span>{formatPaise(grandTotalInPaise)}</span>
            </div>
          </div>

          <div className="hidden lg:block">
            <Button type="submit" className="h-11 w-full" disabled={submitDisabled}>
              {completeSaleLabel}
            </Button>
          </div>
        </div>
      </div>

      {/* Mobile-only sticky transaction bar — the sole Complete Sale
          trigger below `lg` (see the desktop-only button above). Still a
          genuine `type="submit"` inside this same `<form>`, so a
          `position:fixed` descendant remains part of the form for
          submission purposes — the identical pattern already proven on
          the customer Bag/Checkout sticky bars. */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background/95 px-4 pt-2 backdrop-blur supports-backdrop-filter:bg-background/80 lg:hidden">
        <div className="pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
          <p className="truncate text-xs text-muted-foreground">
            {customerSummaryLabel} &middot; {PAYMENT_METHOD_LABEL[paymentMethod]}
          </p>
          <div className="mt-1 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">
                {totals.totalQuantity} unit{totals.totalQuantity === 1 ? "" : "s"}
              </p>
              <p className="text-base font-semibold tabular-nums">{formatPaise(grandTotalInPaise)}</p>
            </div>
            <Button type="submit" className="h-11 px-6" disabled={submitDisabled}>
              {completeSaleLabel}
            </Button>
          </div>
        </div>
      </div>
    </form>
  );
}
