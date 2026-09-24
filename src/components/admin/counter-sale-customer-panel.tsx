"use client";

import { useEffect, useId, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { detectCreateFormPrefill, nextSearchResultIndex } from "@/lib/counter-sale-form";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import {
  createCounterSaleCustomerAction,
  getRecentCustomersForCounterSaleAction,
  searchCustomersForCounterSaleAction,
} from "@/server/actions/admin/counter-sale";
import { useDebouncedSearch } from "@/components/admin/use-debounced-search";

export type CustomerSearchResult = {
  id: string;
  customerId: string;
  displayName: string | null;
  primaryPhone: string | null;
  lastOrderAt: Date | string | null;
  /** Phase 3.6.6 Part 1 — the customer's own saved address, if any. Only
   * ever used by the Counter Sale form to decide whether to offer "Use
   * Saved Address" — never trusted as the actual order snapshot, which
   * the server always re-resolves fresh. */
  addressLine: string | null;
  addressCity: string | null;
  addressState: string | null;
  addressPincode: string | null;
  /** What they already owe in KhataBook (lena hai); 0 for a new customer. */
  khataDueInPaise?: number;
};

/**
 * Phase 3.6.5 Part 1 — collapsed from three modes (Guest/Existing/New) to
 * two. See docs/PHASE_3_6_5_REPORT.md Part 1 "UX decisions" for the full
 * reasoning: real retail staff don't know in advance whether a walk-in is
 * already a customer, so the old flow forced a guess before search was even
 * possible. Now the cashier only ever chooses Guest or Customer; within
 * Customer, the panel itself decides — via search — whether that's an
 * existing row or a brand-new one to create inline.
 */
export type CustomerMode = "GUEST" | "CUSTOMER";

/** "₹150 baaki" in amber when they already owe, so the counter sees it
 * before giving more udhaar. */
function KhataDue({ customer, className }: { customer: CustomerSearchResult; className?: string }) {
  const due = customer.khataDueInPaise ?? 0;
  return (
    <span className={cn("text-xs", due > 0 ? "font-medium text-amber-500" : "text-muted-foreground", className)}>
      {due > 0 ? `${formatPaise(due)} baaki` : "No udhaar"}
    </span>
  );
}

async function searchCustomers(query: string): Promise<CustomerSearchResult[]> {
  const result = await searchCustomersForCounterSaleAction({ query });
  return result.success ? result.customers : [];
}

function formatLastOrder(value: Date | string | null): string {
  if (!value) return "No previous orders";
  const date = value instanceof Date ? value : new Date(value);
  return `Last order ${date.toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata", dateStyle: "medium" })}`;
}

function customerSummaryLine(customer: CustomerSearchResult): string {
  return [customer.displayName, customer.primaryPhone].filter(Boolean).join(" · ") || "No name or phone on file";
}

/**
 * Guest / Customer selection for a counter sale (Phase 3.6.5 Part 1 — see
 * that report for the full redesign rationale). Guest is the default and
 * requires zero interaction. Customer shows one unified search box (name,
 * phone, or Customer ID — never three separate fields); a "Recent
 * Customers" quick-pick appears above it while the box is empty. Finding no
 * match shows an inline create form immediately — no "go back and switch
 * tabs" step — and creating a customer there selects them automatically,
 * continuing the sale with zero extra clicks.
 */
export function CounterSaleCustomerPanel({
  mode,
  onModeChange,
  selectedCustomer,
  onSelectCustomer,
}: {
  mode: CustomerMode;
  onModeChange: (mode: CustomerMode) => void;
  selectedCustomer: CustomerSearchResult | null;
  onSelectCustomer: (customer: CustomerSearchResult | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const [recentCustomers, setRecentCustomers] = useState<CustomerSearchResult[]>([]);
  const listId = useId();
  const tablistId = useId();
  const searchInputRef = useRef<HTMLInputElement>(null);
  const clearButtonRef = useRef<HTMLButtonElement>(null);
  const { results, isSearching } = useDebouncedSearch(query, searchCustomers);

  // Loaded once, lazily — "keep it lightweight" (section 9): one request per
  // panel mount, not one per keystroke or per mode switch.
  useEffect(() => {
    let cancelled = false;
    getRecentCustomersForCounterSaleAction().then((result) => {
      if (!cancelled && result.success) setRecentCustomers(result.customers);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Adjust during render rather than in an effect — see the identical
  // comment in counter-sale-product-search.tsx.
  const [resultsForActiveIndex, setResultsForActiveIndex] = useState(results);
  if (results !== resultsForActiveIndex) {
    setResultsForActiveIndex(results);
    setActiveIndex(results.length > 0 ? 0 : -1);
  }

  const trimmedQuery = query.trim();
  const showingNotFound = !isSearching && trimmedQuery.length > 0 && results.length === 0;

  function selectResult(customer: CustomerSearchResult) {
    onSelectCustomer(customer);
    setQuery("");
    setActiveIndex(-1);
    // Focus lands on the resulting Customer Card's Clear button — the one
    // control a keyboard user would plausibly act on next (undo a wrong
    // pick), rather than being dropped to the document body once the
    // search box unmounts.
    requestAnimationFrame(() => clearButtonRef.current?.focus());
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) {
      if (event.key === "Escape") setQuery("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => nextSearchResultIndex({ currentIndex: index, resultCount: results.length, direction: "down" }));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => nextSearchResultIndex({ currentIndex: index, resultCount: results.length, direction: "up" }));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) selectResult(target);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  function handleTablistKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    onModeChange(mode === "GUEST" ? "CUSTOMER" : "GUEST");
  }

  return (
    <div>
      <div
        role="tablist"
        aria-label="Customer type"
        id={tablistId}
        onKeyDown={handleTablistKeyDown}
        className="inline-flex rounded-full border bg-muted p-1"
      >
        {(["GUEST", "CUSTOMER"] as const).map((candidate) => (
          <button
            key={candidate}
            type="button"
            role="tab"
            aria-selected={mode === candidate}
            tabIndex={mode === candidate ? 0 : -1}
            onClick={() => onModeChange(candidate)}
            className={cn(
              "rounded-full px-4 py-2 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              mode === candidate
                ? "bg-primary text-primary-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {candidate === "GUEST" ? "Guest" : "Customer"}
          </button>
        ))}
      </div>

      {mode === "GUEST" && (
        <p className="mt-3 text-sm text-muted-foreground">
          Fastest for a walk-in: no name needed. To give udhaar, choose Customer.
        </p>
      )}

      {mode === "CUSTOMER" && (
        <div className="mt-3">
          {selectedCustomer ? (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/30 p-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {selectedCustomer.displayName || selectedCustomer.primaryPhone || selectedCustomer.customerId}
                </p>
                <p className="truncate text-xs text-muted-foreground">
                  {[selectedCustomer.displayName ? selectedCustomer.primaryPhone : null, selectedCustomer.customerId]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  Khata: <KhataDue customer={selectedCustomer} />
                </p>
              </div>
              <Button
                ref={clearButtonRef}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  onSelectCustomer(null);
                  // Focus naturally moves back to the search box, which is
                  // about to remount in this button's place.
                  requestAnimationFrame(() => searchInputRef.current?.focus());
                }}
              >
                Clear
              </Button>
            </div>
          ) : (
            <>
              {trimmedQuery.length === 0 && recentCustomers.length > 0 && (
                <div className="mb-3">
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">Recent Customers</p>
                  <ul className="flex flex-col divide-y rounded-lg border">
                    {recentCustomers.map((customer) => (
                      <li key={customer.id}>
                        <button
                          type="button"
                          onClick={() => selectResult(customer)}
                          className="flex w-full items-center justify-between gap-3 p-2.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
                        >
                          <span className="min-w-0 truncate">{customerSummaryLine(customer)}</span>
                          <KhataDue customer={customer} className="shrink-0" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <Input
                ref={searchInputRef}
                role="combobox"
                aria-expanded={trimmedQuery.length > 0}
                aria-controls={listId}
                aria-label="Search customers by name, phone, or Customer ID"
                autoComplete="off"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Search by name, phone, or Customer ID"
                className="h-11 text-base"
                autoFocus
              />

              {trimmedQuery.length > 0 && !showingNotFound && (
                <ul id={listId} role="listbox" className="mt-2 max-h-72 divide-y overflow-y-auto rounded-lg border">
                  {isSearching && <li className="p-3 text-sm text-muted-foreground">Searching…</li>}
                  {!isSearching &&
                    results.map((customer, index) => (
                      <li key={customer.id} role="option" aria-selected={index === activeIndex}>
                        <button
                          type="button"
                          onMouseEnter={() => setActiveIndex(index)}
                          onClick={() => selectResult(customer)}
                          className={cn(
                            "flex w-full items-start justify-between gap-3 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                            index === activeIndex ? "bg-muted" : "hover:bg-muted",
                          )}
                        >
                          <div className="min-w-0">
                            <p className="truncate text-sm font-medium">
                              {customer.displayName || "No name on file"}
                            </p>
                            <p className="font-mono text-xs text-muted-foreground">{customer.customerId}</p>
                            <p className="text-xs text-muted-foreground">
                              {customer.primaryPhone || "No phone on file"}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {formatLastOrder(customer.lastOrderAt)}
                            </p>
                          </div>
                          <span className="shrink-0 text-right text-xs text-muted-foreground">
                            <span className="block">Khata</span>
                            <KhataDue customer={customer} />
                          </span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}

              {showingNotFound && (
                // Keyed by the query so a materially different search
                // (not just a re-render) fully remounts this form — fresh
                // pre-fill, fresh autofocus — rather than leaving stale
                // values/focus from an earlier, different "not found"
                // search. Mirrors the "reset derived state via key" pattern
                // already used for activeIndex elsewhere in this file.
                <CreateCustomerInline key={trimmedQuery} query={trimmedQuery} onCreated={selectResult} />
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * Section 7 — no "go back to a different tab" step. As soon as a search
 * settles on zero results, this replaces the empty-results message
 * directly, pre-filled from the search query (`detectCreateFormPrefill`,
 * src/lib/counter-sale-form.ts) when it looks like a phone number or a
 * name. "Create & Continue" reuses `createCounterSaleCustomerAction`,
 * which itself reuses Phase 3.1's `findOrCreateCustomerByPrimaryPhone` —
 * this component invents no customer-creation logic of its own.
 */
function CreateCustomerInline({
  query,
  onCreated,
}: {
  query: string;
  onCreated: (customer: CustomerSearchResult) => void;
}) {
  const prefill = detectCreateFormPrefill(query);
  const [name, setName] = useState(prefill.name);
  const [phone, setPhone] = useState(prefill.phone);
  const [whatsapp, setWhatsapp] = useState("");
  // Phase 3.6.6 Part 1 section 4 — entered here, this becomes the
  // customer's SAVED address (this IS their creation moment, so there is
  // nothing to "overwrite"); see createCustomerInline's own doc comment.
  const [addressLine, setAddressLine] = useState("");
  const [city, setCity] = useState("");
  const [addressState, setAddressState] = useState("");
  const [pincode, setPincode] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nameId = useId();
  const phoneId = useId();
  const whatsappId = useId();
  const addressLineId = useId();
  const cityId = useId();
  const stateId = useId();
  const pincodeId = useId();
  const nameInputRef = useRef<HTMLInputElement>(null);
  const phoneInputRef = useRef<HTMLInputElement>(null);

  // Autofocus the first field that ISN'T already pre-filled, so the cashier
  // can start typing immediately with no extra click — "Focus should
  // naturally move" (section 11). Runs once per mount; the parent remounts
  // this component (via `key={trimmedQuery}`) whenever the search query it
  // was pre-filled from changes, so this always reflects the CURRENT query.
  useEffect(() => {
    if (prefill.name) {
      // Name already has a value (query looked name-like) — Phone is the
      // one remaining required field.
      phoneInputRef.current?.focus();
    } else {
      nameInputRef.current?.focus();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleCreate() {
    if (isCreating) return;
    if (!phone.trim()) {
      setError("Enter a phone number.");
      return;
    }
    setIsCreating(true);
    setError(null);
    const hasAddress = Boolean(addressLine.trim() || city.trim() || addressState.trim() || pincode.trim());
    const result = await createCounterSaleCustomerAction({
      displayName: name.trim() || undefined,
      primaryPhone: phone.trim(),
      whatsappPhone: whatsapp.trim() || undefined,
      address: hasAddress
        ? {
            addressLine: addressLine.trim() || undefined,
            city: city.trim() || undefined,
            state: addressState.trim() || undefined,
            pincode: pincode.trim() || undefined,
          }
        : undefined,
    });
    setIsCreating(false);
    if (result.success) {
      onCreated(result.customer);
      return;
    }
    setError(result.error.message);
  }

  // Enter inside any of these fields submits THIS inline form, never the
  // outer Counter Sale <form> it's nested inside — both the preventDefault
  // here and the button's own type="button" below stop that bubbling.
  function handleFieldKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleCreate();
    }
  }

  return (
    <div className="mt-2 rounded-lg border bg-secondary/30 p-3">
      <p className="text-sm text-muted-foreground">No matching customer — create one to continue.</p>
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={nameId}>Name (optional)</Label>
          <Input
            id={nameId}
            ref={nameInputRef}
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={phoneId}>Phone number</Label>
          <Input
            id={phoneId}
            ref={phoneInputRef}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            placeholder="98765 43210"
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={whatsappId}>WhatsApp number (optional)</Label>
          <Input
            id={whatsappId}
            type="tel"
            inputMode="tel"
            value={whatsapp}
            onChange={(e) => setWhatsapp(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            placeholder="Same as phone if left blank"
            className="h-11 text-base"
          />
        </div>
      </div>

      {/* Phase 3.6.6 Part 1 section 4 — optional; whatever is entered
          here becomes this brand-new customer's SAVED address (there is
          nothing yet to overwrite). Never required to create a
          customer. */}
      <div className="mt-3 flex flex-col gap-3 sm:flex-row">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={addressLineId}>Address line (optional)</Label>
          <Input
            id={addressLineId}
            value={addressLine}
            onChange={(e) => setAddressLine(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            placeholder="House/Flat, Street"
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={cityId}>City (optional)</Label>
          <Input
            id={cityId}
            value={city}
            onChange={(e) => setCity(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={stateId}>State (optional)</Label>
          <Input
            id={stateId}
            value={addressState}
            onChange={(e) => setAddressState(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            className="h-11 text-base"
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor={pincodeId}>PIN code (optional)</Label>
          <Input
            id={pincodeId}
            inputMode="numeric"
            value={pincode}
            onChange={(e) => setPincode(e.target.value)}
            onKeyDown={handleFieldKeyDown}
            className="h-11 text-base"
          />
        </div>
      </div>
      {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      <Button
        type="button"
        className="mt-3 h-11 w-full sm:w-auto"
        disabled={isCreating}
        onClick={() => void handleCreate()}
      >
        {isCreating ? "Creating…" : "Create & Continue"}
      </Button>
    </div>
  );
}
