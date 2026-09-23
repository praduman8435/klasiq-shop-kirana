"use client";

import { useId, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import type { ReturnReason } from "@prisma/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import { nextSearchResultIndex } from "@/lib/counter-sale-form";
import { RETURN_REASON_LABEL } from "@/lib/return-lifecycle";
import { cn } from "@/lib/utils";
import { useDebouncedSearch } from "@/components/admin/use-debounced-search";
import {
  createWalkInReturnRequestAction,
  getCustomerOrdersForWalkInAction,
  getReturnableItemsForWalkInAction,
  type WalkInCustomerOrdersResult,
  type WalkInReturnableItemsResult,
} from "@/server/actions/admin/returns";
import { searchCustomersForCounterSaleAction } from "@/server/actions/admin/counter-sale";

type CustomerResult = { id: string; customerId: string; displayName: string | null; primaryPhone: string | null };
type OrderResult = NonNullable<WalkInCustomerOrdersResult["orders"]>[number];
type ReturnableItem = NonNullable<WalkInReturnableItemsResult["items"]>[number];

const REASON_OPTIONS: ReturnReason[] = [
  "WRONG_SIZE",
  "DEFECTIVE",
  "DAMAGED",
  "WRONG_PRODUCT",
  "QUALITY_ISSUE",
  "CHANGED_MIND",
  "OTHER",
];

async function searchWalkInCustomers(query: string): Promise<CustomerResult[]> {
  const result = await searchCustomersForCounterSaleAction({ query });
  return result.success ? result.customers : [];
}

/**
 * Section 5/6 "Walk-in returns" — Search Customer → Search Order → Open
 * Return → (submit) → the admin then uses the SAME Return Detail page
 * (Approve → Receive) every portal-originated request already goes
 * through. Nothing here is a parallel engine: this form's only job is to
 * call `createReturnRequestAction`'s admin-side twin
 * (`createWalkInReturnRequestAction`), which itself calls the identical
 * `createReturnRequest` domain function from Part 1/2.
 */
export function WalkInReturnForm() {
  const router = useRouter();
  const [step, setStep] = useState<"customer" | "order" | "items">("customer");

  const [customerQuery, setCustomerQuery] = useState("");
  const [customerActiveIndex, setCustomerActiveIndex] = useState(-1);
  const customerListId = useId();
  const { results: customerResults, isSearching: searchingCustomers } = useDebouncedSearch(
    customerQuery,
    searchWalkInCustomers,
  );
  const [selectedCustomer, setSelectedCustomer] = useState<CustomerResult | null>(null);

  const [orders, setOrders] = useState<OrderResult[] | null>(null);
  const [loadingOrders, setLoadingOrders] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<OrderResult | null>(null);

  const [items, setItems] = useState<ReturnableItem[] | null>(null);
  const [loadingItems, setLoadingItems] = useState(false);

  const [type, setType] = useState<"RETURN" | "EXCHANGE">("RETURN");
  const [selections, setSelections] = useState<Record<string, { quantity: number; reason: ReturnReason }>>({});
  const [note, setNote] = useState("");
  const [overrideEnabled, setOverrideEnabled] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  async function selectCustomer(customer: CustomerResult) {
    setSelectedCustomer(customer);
    setCustomerQuery("");
    setCustomerActiveIndex(-1);
    setStep("order");
    setLoadingOrders(true);
    const result = await getCustomerOrdersForWalkInAction(customer.id);
    setLoadingOrders(false);
    if (result.success) {
      setOrders(result.orders);
    } else {
      toast.error(result.error.message);
      setOrders([]);
    }
  }

  async function selectOrder(order: OrderResult) {
    if (!selectedCustomer) return;
    setSelectedOrder(order);
    setStep("items");
    setSelections({});
    setNote("");
    setOverrideEnabled(false);
    setOverrideReason("");
    setFormError(null);
    setLoadingItems(true);
    const result = await getReturnableItemsForWalkInAction({
      orderNumber: order.orderNumber,
      customerId: selectedCustomer.id,
    });
    setLoadingItems(false);
    if (result.success) {
      setItems(result.items ?? []);
    } else {
      toast.error(result.error.message);
      setItems([]);
    }
  }

  function toggleItem(item: ReturnableItem, checked: boolean) {
    setSelections((prev) => {
      const next = { ...prev };
      if (checked) {
        next[item.orderItemId] = { quantity: 1, reason: "WRONG_SIZE" };
      } else {
        delete next[item.orderItemId];
      }
      return next;
    });
  }

  function updateQuantity(orderItemId: string, delta: number, max: number) {
    setSelections((prev) => {
      const current = prev[orderItemId];
      if (!current) return prev;
      const nextQuantity = Math.min(max, Math.max(1, current.quantity + delta));
      return { ...prev, [orderItemId]: { ...current, quantity: nextQuantity } };
    });
  }

  function updateReason(orderItemId: string, reason: ReturnReason) {
    setSelections((prev) => {
      const current = prev[orderItemId];
      if (!current) return prev;
      return { ...prev, [orderItemId]: { ...current, reason } };
    });
  }

  async function handleSubmit() {
    if (!selectedCustomer || !selectedOrder || isSubmitting) return;
    const selectedCount = Object.keys(selections).length;
    if (selectedCount === 0) {
      setFormError("Select at least one item.");
      return;
    }
    if (overrideEnabled && !overrideReason.trim()) {
      setFormError("An override reason is required.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);

    const result = await createWalkInReturnRequestAction({
      customerId: selectedCustomer.id,
      orderNumber: selectedOrder.orderNumber,
      type,
      note: note.trim() || undefined,
      overrideReason: overrideEnabled ? overrideReason.trim() : undefined,
      items: Object.entries(selections).map(([orderItemId, { quantity, reason }]) => ({
        orderItemId,
        quantity,
        reason,
      })),
    });

    setIsSubmitting(false);
    if (result.success) {
      toast.success(`Return request ${result.returnNumber} created.`);
      router.push(`/admin/returns/${result.returnNumber}`);
    } else {
      setFormError(result.error.message);
    }
  }

  function handleCustomerKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (customerResults.length === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCustomerActiveIndex((index) =>
        nextSearchResultIndex({ currentIndex: index, resultCount: customerResults.length, direction: "down" }),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCustomerActiveIndex((index) =>
        nextSearchResultIndex({ currentIndex: index, resultCount: customerResults.length, direction: "up" }),
      );
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = customerResults[customerActiveIndex] ?? customerResults[0];
      if (target) selectCustomer(target);
    }
  }

  return (
    <div className="flex max-w-2xl flex-col gap-6">
      <section className="rounded-2xl border bg-card p-5">
        <h2 className="font-heading text-base font-semibold">1. Customer</h2>
        {selectedCustomer ? (
          <div className="mt-3 flex items-center justify-between gap-3 rounded-lg border bg-secondary/30 p-3">
            <div>
              <p className="font-mono text-sm font-medium">{selectedCustomer.customerId}</p>
              <p className="text-xs text-muted-foreground">
                {[selectedCustomer.displayName, selectedCustomer.primaryPhone].filter(Boolean).join(" · ")}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setSelectedCustomer(null);
                setSelectedOrder(null);
                setOrders(null);
                setItems(null);
                setSelections({});
                setNote("");
                setOverrideEnabled(false);
                setOverrideReason("");
                setFormError(null);
                setStep("customer");
              }}
            >
              Change
            </Button>
          </div>
        ) : (
          <div className="mt-3">
            <Input
              ref={inputRef}
              role="combobox"
              aria-expanded={customerQuery.trim().length > 0}
              aria-controls={customerListId}
              aria-label="Search customers by Customer ID, phone, or name"
              autoComplete="off"
              value={customerQuery}
              onChange={(e) => setCustomerQuery(e.target.value)}
              onKeyDown={handleCustomerKeyDown}
              placeholder="Search by Customer ID, phone, or name"
              className="h-11 text-base"
              autoFocus
            />
            {customerQuery.trim() && (
              <ul id={customerListId} role="listbox" className="mt-2 max-h-60 divide-y overflow-y-auto rounded-lg border">
                {searchingCustomers && <li className="p-3 text-sm text-muted-foreground">Searching…</li>}
                {!searchingCustomers && customerResults.length === 0 && (
                  <li className="p-3 text-sm text-muted-foreground">No matching customers.</li>
                )}
                {!searchingCustomers &&
                  customerResults.map((customer, index) => (
                    <li key={customer.id} role="option" aria-selected={index === customerActiveIndex}>
                      <button
                        type="button"
                        onMouseEnter={() => setCustomerActiveIndex(index)}
                        onClick={() => selectCustomer(customer)}
                        className={cn(
                          "flex w-full flex-col items-start gap-0.5 p-3 text-left transition-colors focus-visible:outline-none",
                          index === customerActiveIndex ? "bg-muted" : "hover:bg-muted",
                        )}
                      >
                        <span className="font-mono text-sm font-medium">{customer.customerId}</span>
                        <span className="text-xs text-muted-foreground">
                          {[customer.displayName, customer.primaryPhone].filter(Boolean).join(" · ") || "No name or phone on file"}
                        </span>
                      </button>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </section>

      {step !== "customer" && (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-base font-semibold">2. Order</h2>
          {loadingOrders && <p className="mt-3 text-sm text-muted-foreground">Loading orders…</p>}
          {!loadingOrders && orders && orders.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">This customer has no orders.</p>
          )}
          {!loadingOrders && orders && orders.length > 0 && (
            <ul className="mt-3 flex flex-col gap-2">
              {orders.map((order) => (
                <li key={order.id}>
                  <button
                    type="button"
                    onClick={() => selectOrder(order)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 rounded-lg border p-3 text-left transition-colors hover:border-primary/40",
                      selectedOrder?.id === order.id && "border-primary/60 bg-secondary/30",
                    )}
                  >
                    <div>
                      <p className="font-mono text-sm font-medium">{order.orderNumber}</p>
                      <p className="text-xs text-muted-foreground">
                        {order.createdAt.toLocaleDateString("en-IN", { dateStyle: "medium" })} &middot; {order.status}
                      </p>
                    </div>
                    <p className="text-sm font-semibold">{formatPaise(order.totalInPaise)}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {step === "items" && (
        <section className="rounded-2xl border bg-card p-5">
          <h2 className="font-heading text-base font-semibold">3. Items</h2>
          {loadingItems && <p className="mt-3 text-sm text-muted-foreground">Loading items…</p>}
          {!loadingItems && items && items.length > 0 && (
            <>
              {formError && (
                <p role="alert" className="mt-3 rounded-lg bg-destructive/10 p-2.5 text-sm text-destructive">
                  {formError}
                </p>
              )}

              <div className="mt-3 inline-flex w-fit rounded-full border bg-muted p-1">
                {(["RETURN", "EXCHANGE"] as const).map((option) => (
                  <button
                    key={option}
                    type="button"
                    aria-pressed={type === option}
                    onClick={() => setType(option)}
                    className={cn(
                      "rounded-full px-4 py-1.5 text-sm font-medium transition-colors",
                      type === option ? "bg-primary text-primary-foreground" : "text-muted-foreground",
                    )}
                  >
                    {option === "RETURN" ? "Return" : "Exchange"}
                  </button>
                ))}
              </div>

              <div className="mt-4 rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950/30">
                <label className="flex items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={overrideEnabled}
                    onChange={(e) => setOverrideEnabled(e.target.checked)}
                    className="mt-0.5 size-4"
                  />
                  <span className="text-sm">
                    <span className="font-medium">Admin Override</span> — bypass the delivery/return-window
                    check for this request (never bypasses quantity limits). Requires a reason; permanently
                    recorded against this request.
                  </span>
                </label>
                {overrideEnabled && (
                  <textarea
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                    maxLength={500}
                    rows={2}
                    placeholder="Why is this override justified? (required)"
                    aria-label="Override reason"
                    className="mt-2 w-full rounded-lg border border-input bg-background p-2 text-sm"
                  />
                )}
              </div>

              <div className="mt-4 flex flex-col gap-3">
                {items.map((item) => {
                  const selection = selections[item.orderItemId];
                  const isSelected = Boolean(selection);
                  const canSelect = item.eligible || (overrideEnabled && item.returnableQuantity > 0);
                  return (
                    <div key={item.orderItemId} className={cn("rounded-lg border p-3", !canSelect && "opacity-60")}>
                      <label className="flex items-start gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          disabled={!canSelect}
                          onChange={(e) => toggleItem(item, e.target.checked)}
                          className="mt-1 size-4"
                        />
                        <div className="flex-1">
                          <p className="text-sm font-medium">{item.productName}</p>
                          <p className="text-xs text-muted-foreground">
                            Size {item.size} &middot; Purchased {item.purchasedQuantity}
                            {item.claimedQuantity > 0 ? ` · ${item.claimedQuantity} already claimed` : ""}
                          </p>
                          {!item.eligible && item.returnableQuantity === 0 && (
                            <p className="text-xs text-destructive">Already fully claimed — no override can change this.</p>
                          )}
                          {!item.eligible && item.returnableQuantity > 0 && !overrideEnabled && (
                            <p className="text-xs text-destructive">
                              Not eligible for return (delivery/window) — enable Admin Override to proceed.
                            </p>
                          )}
                          {!item.eligible && item.returnableQuantity > 0 && overrideEnabled && (
                            <p className="text-xs text-amber-700 dark:text-amber-400">
                              Normally ineligible — selectable because Admin Override is enabled.
                            </p>
                          )}
                        </div>
                      </label>

                      {isSelected && selection && (
                        <div className="mt-3 flex flex-wrap items-center gap-3 pl-7">
                          <div className="flex items-center gap-2">
                            <Label className="text-xs text-muted-foreground">Qty</Label>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.orderItemId, -1, item.returnableQuantity)}
                              className="flex size-8 items-center justify-center rounded border"
                            >
                              −
                            </button>
                            <span className="w-6 text-center text-sm">{selection.quantity}</span>
                            <button
                              type="button"
                              onClick={() => updateQuantity(item.orderItemId, 1, item.returnableQuantity)}
                              className="flex size-8 items-center justify-center rounded border"
                            >
                              +
                            </button>
                            <span className="text-xs text-muted-foreground">of {item.returnableQuantity}</span>
                          </div>
                          <select
                            value={selection.reason}
                            onChange={(e) => updateReason(item.orderItemId, e.target.value as ReturnReason)}
                            className="h-9 rounded-lg border border-input bg-transparent px-2 text-sm"
                          >
                            {REASON_OPTIONS.map((reason) => (
                              <option key={reason} value={reason}>
                                {RETURN_REASON_LABEL[reason]}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="mt-4 flex flex-col gap-1.5">
                <Label htmlFor="walk-in-note">Note (optional)</Label>
                <textarea
                  id="walk-in-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  maxLength={500}
                  rows={2}
                  className="rounded-lg border border-input bg-background p-2.5 text-sm"
                />
              </div>

              <Button
                type="button"
                className="mt-4 h-11 w-full"
                disabled={isSubmitting || (overrideEnabled && !overrideReason.trim())}
                onClick={handleSubmit}
              >
                {isSubmitting ? "Creating..." : "Create Return Request"}
              </Button>
            </>
          )}
          {!loadingItems && items && items.length === 0 && (
            <p className="mt-3 text-sm text-muted-foreground">This order has no returnable items.</p>
          )}
        </section>
      )}
    </div>
  );
}
