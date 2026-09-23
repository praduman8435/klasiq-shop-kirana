"use client";

import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

export type AddressFormMode = "NONE" | "SAVED" | "ONE_TIME";

export type AddressFormState = {
  mode: AddressFormMode;
  addressLine: string;
  city: string;
  state: string;
  pincode: string;
};

export function initialAddressFormState(): AddressFormState {
  return { mode: "NONE", addressLine: "", city: "", state: "", pincode: "" };
}

export type SavedAddress = {
  addressLine: string | null;
  city: string | null;
  state: string | null;
  pincode: string | null;
};

export function hasAnyAddressField(address: SavedAddress | null): boolean {
  return Boolean(address && (address.addressLine || address.city || address.state || address.pincode));
}

/**
 * Phase 3.6.6 Part 1 — section 2/3/4's optional invoice address. Two
 * distinct shapes depending on `savedAddress`:
 *
 * - No saved address at all (Guest, or a Customer who's never had one
 *   set) — just the four optional fields directly, mirroring
 *   `CounterSaleDiscountPanel`'s own "no complicated pricing screen"
 *   simplicity. Typing anything switches `mode` to `ONE_TIME`; leaving
 *   everything blank is `NONE` — section 3's "no validation" either way.
 * - A Customer with a saved address — a Full/Partial-style two-button
 *   toggle ("Use Saved Address" / "Enter One-Time Address"), defaulting
 *   to Saved (read-only display, zero extra clicks for the common case
 *   of a repeat customer at their usual address) with One-Time revealing
 *   the same four blank fields. Section 4: "One-time address must never
 *   overwrite the customer's saved address" — this component never
 *   writes back to `savedAddress`; it only ever produces `state` for the
 *   parent to resolve into the server payload
 *   (`src/lib/counter-sale-address.ts`).
 */
export function CounterSaleAddressPanel({
  state,
  onChange,
  savedAddress,
}: {
  state: AddressFormState;
  onChange: (next: AddressFormState) => void;
  /** Null for Guest or a Customer with no saved address on file — see
   * `hasAnyAddressField`. */
  savedAddress: SavedAddress | null;
}) {
  const addressLineId = useId();
  const cityId = useId();
  const stateId = useId();
  const pincodeId = useId();

  const showSavedToggle = hasAnyAddressField(savedAddress);
  const showOneTimeFields = !showSavedToggle || state.mode === "ONE_TIME";

  function setField(field: "addressLine" | "city" | "state" | "pincode", value: string) {
    onChange({ ...state, mode: "ONE_TIME", [field]: value });
  }

  return (
    <div>
      {showSavedToggle && (
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={state.mode !== "ONE_TIME"}
            onClick={() => onChange({ ...state, mode: "SAVED" })}
            className={cn(
              "h-10 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state.mode !== "ONE_TIME"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Use Saved Address
          </button>
          <button
            type="button"
            aria-pressed={state.mode === "ONE_TIME"}
            onClick={() => onChange({ ...state, mode: "ONE_TIME" })}
            className={cn(
              "h-10 rounded-md border text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              state.mode === "ONE_TIME"
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            Enter One-Time Address
          </button>
        </div>
      )}

      {showSavedToggle && !showOneTimeFields && (
        <div className="mt-3 rounded-lg border bg-secondary/30 p-3 text-sm text-muted-foreground">
          <p>{savedAddress!.addressLine}</p>
          <p>{[savedAddress!.city, savedAddress!.state, savedAddress!.pincode].filter(Boolean).join(", ")}</p>
        </div>
      )}

      {showOneTimeFields && (
        <div className={cn("flex flex-col gap-3", showSavedToggle && "mt-3")}>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor={addressLineId}>Address line</Label>
            <Input
              id={addressLineId}
              value={state.addressLine}
              onChange={(e) => setField("addressLine", e.target.value)}
              placeholder="House/Flat, Street"
              className="h-11 text-base"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={cityId}>City</Label>
              <Input id={cityId} value={state.city} onChange={(e) => setField("city", e.target.value)} className="h-11 text-base" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={stateId}>State</Label>
              <Input
                id={stateId}
                value={state.state}
                onChange={(e) => setField("state", e.target.value)}
                className="h-11 text-base"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={pincodeId}>PIN code</Label>
              <Input
                id={pincodeId}
                inputMode="numeric"
                value={state.pincode}
                onChange={(e) => setField("pincode", e.target.value)}
                className="h-11 text-base"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
