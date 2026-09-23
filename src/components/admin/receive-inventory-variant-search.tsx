"use client";

import { useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { STOCK_STATUS_LABEL, STOCK_STATUS_TEXT_CLASS } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { searchSellableVariantsAction } from "@/server/actions/admin/counter-sale";
import { useDebouncedSearch } from "@/components/admin/use-debounced-search";
import type { VariantSearchResult } from "@/components/admin/counter-sale-product-search";

async function searchVariants(query: string): Promise<VariantSearchResult[]> {
  const result = await searchSellableVariantsAction({ query });
  return result.success ? result.variants : [];
}

/**
 * A receiving-specific sibling of `CounterSaleProductSearch`
 * (src/components/admin/counter-sale-product-search.tsx) — same
 * search-as-you-type call to the existing `searchSellableVariantsAction`
 * (read-only reuse, nothing there was changed), but deliberately never
 * disables an OUT_OF_STOCK result: that component treats "no stock" as
 * "can't sell it," which is the opposite of what's true here — a
 * variant with zero stock is exactly the kind of thing an admin is
 * receiving MORE of. A shared component wasn't extracted for this small
 * a divergence (one boolean flip), to avoid any risk to Counter Sale's
 * own already-shipped search behavior.
 */
export function ReceiveInventoryVariantSearch({
  onAdd,
}: {
  onAdd: (variant: VariantSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isSearching } = useDebouncedSearch(query, searchVariants);

  const [resultsForActiveIndex, setResultsForActiveIndex] = useState(results);
  if (results !== resultsForActiveIndex) {
    setResultsForActiveIndex(results);
    setActiveIndex(results.length > 0 ? 0 : -1);
  }

  function addResult(variant: VariantSearchResult) {
    onAdd(variant);
    setQuery("");
    setActiveIndex(-1);
    inputRef.current?.focus();
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (results.length === 0) {
      if (event.key === "Escape") setQuery("");
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((index) => (index + 1) % results.length);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((index) => (index - 1 + results.length) % results.length);
    } else if (event.key === "Enter") {
      event.preventDefault();
      const target = results[activeIndex] ?? results[0];
      if (target) addResult(target);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  const showResults = query.trim().length > 0;

  return (
    <div>
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-label="Search products by name or SKU"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search by product name or SKU"
          className="h-10 pl-9 text-sm"
        />
      </div>

      {showResults && (
        <ul id={listId} role="listbox" className="mt-2 max-h-72 divide-y divide-border overflow-y-auto rounded-lg border border-border">
          {isSearching && <li className="p-3 text-sm text-muted-foreground">Searching…</li>}
          {!isSearching && results.length === 0 && <li className="p-3 text-sm text-muted-foreground">No matching items.</li>}
          {!isSearching &&
            results.map((variant, index) => (
              <li key={variant.variantId} role="option" aria-selected={index === activeIndex}>
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(index)}
                  onClick={() => addResult(variant)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                    index === activeIndex ? "bg-muted" : "hover:bg-muted",
                  )}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {variant.productName} &middot; {variant.size}
                    </p>
                    <p className="truncate text-xs text-muted-foreground">
                      SKU {variant.sku} &middot;{" "}
                      <span className={STOCK_STATUS_TEXT_CLASS[variant.stockStatus]}>
                        {STOCK_STATUS_LABEL[variant.stockStatus]} ({variant.stockQuantity})
                      </span>
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">Add</span>
                </button>
              </li>
            ))}
        </ul>
      )}
    </div>
  );
}
