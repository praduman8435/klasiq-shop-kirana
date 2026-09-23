"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MapPin, Search, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { DeliveryPreview, DeliverySelection } from "@/lib/checkout-fulfillment-state";
import { shouldInvalidateSelection } from "@/lib/delivery-address-selection";
import { formatPaise } from "@/lib/money";
import {
  previewDeliveryFeeAction,
  searchDeliveryAddressAction,
  type SearchDeliveryAddressResult,
} from "@/server/actions/checkout-address";

const SEARCH_DEBOUNCE_MS = 350;
const MIN_QUERY_LENGTH = 3;

type Suggestion = Extract<SearchDeliveryAddressResult, { success: true }>["suggestions"][number];

export type { DeliveryPreview, DeliverySelection };

/**
 * Debounced Geoapify address search + selection + delivery-fee preview, all
 * proxied through Server Actions so the API key never reaches the browser
 * (see src/server/actions/checkout-address.ts). Only the SELECTED
 * suggestion's coordinates are ever reported to the parent — free-typed
 * address text alone is never treated as a location. Editing the query
 * after selecting a suggestion immediately clears that selection (and its
 * preview): stale coordinates must never remain authoritative for a
 * different-looking address. See docs/PHASE_3_3_REPORT.md Part 2 "Selected
 * location semantics".
 *
 * Raw latitude/longitude are intentionally never rendered — only the
 * formatted address and the road distance (which the spec explicitly asks
 * to show) ever reach the DOM.
 */
export function DeliveryAddressSearch({
  onSelectionChange,
  onPreviewChange,
  disabled,
}: {
  onSelectionChange: (selection: DeliverySelection | null) => void;
  onPreviewChange: (preview: DeliveryPreview | null) => void;
  disabled?: boolean;
}) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
  const [selected, setSelected] = useState<Suggestion | null>(null);
  const [isPreviewing, setIsPreviewing] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [preview, setPreview] = useState<DeliveryPreview | null>(null);

  const searchRequestId = useRef(0);
  const previewRequestId = useRef(0);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Distinguishes "the query changed because a suggestion was just applied"
  // from "the user is now editing it" — only the latter should clear the
  // selection. See the component doc comment above.
  const lastAppliedSelectionText = useRef<string | null>(null);

  // Cleanup-only: cancels a pending debounced search if the component
  // unmounts mid-wait. No setState here — this effect's only job is
  // clearing a timer, not synchronizing React state.
  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
    };
  }, []);

  // Debouncing is driven directly from this event handler (a ref-held timer
  // id) rather than a useEffect keyed on `query` — the search is a response
  // to the user's keystroke, not a value being synchronized with an
  // external system, so doing it here avoids a second render pass just to
  // kick off state resets. See docs/PHASE_3_3_REPORT.md Part 2 "Selected
  // location semantics" / "Address autocomplete".
  function handleQueryChange(value: string) {
    setQuery(value);

    // Any edit after a suggestion was selected immediately invalidates that
    // selection (and its preview) — stale coordinates must never remain
    // authoritative for a different-looking address.
    if (shouldInvalidateSelection(lastAppliedSelectionText.current, value)) {
      lastAppliedSelectionText.current = null;
      setSelected(null);
      setPreview(null);
      setPreviewError(null);
      onSelectionChange(null);
      onPreviewChange(null);
    }

    if (debounceTimer.current) clearTimeout(debounceTimer.current);

    if (lastAppliedSelectionText.current === value) return;

    const trimmed = value.trim();
    if (trimmed.length < MIN_QUERY_LENGTH) {
      setSuggestions([]);
      setSearchNotice(null);
      setIsSearching(false);
      return;
    }

    const thisRequestId = ++searchRequestId.current;
    setIsSearching(true);
    setSearchNotice(null);

    debounceTimer.current = setTimeout(() => {
      searchDeliveryAddressAction({ query: trimmed })
        .then((result) => {
          if (searchRequestId.current !== thisRequestId) return;
          setIsSearching(false);
          if (!result.success) {
            setSuggestions([]);
            setSearchNotice(
              result.error.type === "NOT_CONFIGURED"
                ? "Address lookup is unavailable right now. Please choose Store Pickup or call us."
                : "We couldn't search addresses right now. Please try again.",
            );
            return;
          }
          setSuggestions(result.suggestions);
          setSearchNotice(
            result.suggestions.length === 0
              ? "No matching addresses found. Try adding your area or PIN code."
              : null,
          );
        })
        .catch(() => {
          if (searchRequestId.current !== thisRequestId) return;
          setIsSearching(false);
          setSuggestions([]);
          setSearchNotice("We couldn't search addresses right now. Please try again.");
        });
    }, SEARCH_DEBOUNCE_MS);
  }

  function runPreview(suggestion: Suggestion) {
    const thisPreviewId = ++previewRequestId.current;
    setIsPreviewing(true);
    setPreviewError(null);
    setPreview(null);
    onPreviewChange(null);

    previewDeliveryFeeAction({ lat: suggestion.lat, lon: suggestion.lon })
      .then((result) => {
        if (previewRequestId.current !== thisPreviewId) return;
        setIsPreviewing(false);
        if (!result.success) {
          setPreviewError(result.error.message);
          return;
        }
        const nextPreview: DeliveryPreview = {
          deliveryFeeInPaise: result.deliveryFeeInPaise,
          routeDistanceMeters: result.routeDistanceMeters,
        };
        setPreview(nextPreview);
        onPreviewChange(nextPreview);
      })
      .catch(() => {
        if (previewRequestId.current !== thisPreviewId) return;
        setIsPreviewing(false);
        setPreviewError(
          "We couldn't verify delivery distance right now. Please try again or choose Store Pickup.",
        );
      });
  }

  function handleSelect(suggestion: Suggestion) {
    lastAppliedSelectionText.current = suggestion.formattedAddress;
    setQuery(suggestion.formattedAddress);
    setSuggestions([]);
    setSearchNotice(null);
    setSelected(suggestion);
    onSelectionChange({
      formattedAddress: suggestion.formattedAddress,
      lat: suggestion.lat,
      lon: suggestion.lon,
    });
    runPreview(suggestion);
  }

  function handleClear() {
    lastAppliedSelectionText.current = null;
    setQuery("");
    setSuggestions([]);
    setSearchNotice(null);
    setSelected(null);
    setPreview(null);
    setPreviewError(null);
    onSelectionChange(null);
    onPreviewChange(null);
  }

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor="delivery-address-search">Delivery location</Label>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="delivery-address-search"
          value={query}
          onChange={(e) => handleQueryChange(e.target.value)}
          placeholder="Start typing your address, area, or PIN code..."
          className="h-12 rounded-xl pl-10 pr-9"
          autoComplete="off"
          disabled={disabled}
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={suggestions.length > 0}
          aria-controls="delivery-address-listbox"
          aria-describedby="delivery-address-status"
        />
        {query && (
          <button
            type="button"
            onClick={handleClear}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
            aria-label="Clear delivery location"
          >
            <X className="size-4" aria-hidden />
          </button>
        )}
      </div>

      {/* aria-live announces search/notice state changes to screen reader
          users without needing focus to move — the visible text already
          covers sighted users. */}
      <div id="delivery-address-status" aria-live="polite" className="contents">
        {isSearching && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="size-3 animate-spin" aria-hidden /> Searching...
          </p>
        )}

        {!isSearching && searchNotice && suggestions.length === 0 && (
          <p className="text-xs text-muted-foreground">{searchNotice}</p>
        )}
      </div>

      {!isSearching && suggestions.length > 0 && (
        <ul
          id="delivery-address-listbox"
          role="listbox"
          aria-label="Address suggestions"
          className="flex max-h-64 flex-col divide-y overflow-y-auto rounded-lg border bg-card"
        >
          {suggestions.map((s) => (
            <li key={s.id} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                onClick={() => handleSelect(s)}
                className="flex w-full items-start gap-2 px-3 py-2 text-left text-sm hover:bg-secondary/50"
              >
                <MapPin className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
                <span>{s.formattedAddress}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected && (
        <div className="mt-1 rounded-lg border bg-secondary/30 p-3 text-sm">
          <p className="flex items-start gap-1.5 font-medium text-foreground">
            <MapPin className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            <span>{selected.formattedAddress}</span>
          </p>
          {isPreviewing && (
            <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted-foreground">
              <Loader2 className="size-3 animate-spin" aria-hidden /> Calculating delivery fee...
            </p>
          )}
          {!isPreviewing && preview && (
            <p className="mt-1.5 text-xs text-muted-foreground">
              {(preview.routeDistanceMeters / 1000).toFixed(1)} km by road &middot;{" "}
              {preview.deliveryFeeInPaise > 0
                ? `Delivery fee: ${formatPaise(preview.deliveryFeeInPaise)}`
                : "Delivery: Free"}
            </p>
          )}
          {!isPreviewing && previewError && (
            <p className="mt-1.5 text-xs text-destructive">{previewError}</p>
          )}
        </div>
      )}
    </div>
  );
}
