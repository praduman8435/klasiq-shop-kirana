"use client";

import { useCallback, useId, useRef, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { formatPaise } from "@/lib/money";
import { nextSearchResultIndex } from "@/lib/counter-sale-form";
import { STOCK_STATUS_LABEL, STOCK_STATUS_TEXT_CLASS } from "@/lib/stock";
import { cn } from "@/lib/utils";
import { searchSellableVariantsAction } from "@/server/actions/admin/counter-sale";
import { useDebouncedSearch } from "@/components/admin/use-debounced-search";

export type VariantSearchResult = {
  variantId: string;
  productId: string;
  productName: string;
  categoryName: string;
  brand: string | null;
  size: string;
  sku: string;
  priceInPaise: number;
  stockQuantity: number;
  stockStatus: "IN_STOCK" | "LOW_STOCK" | "OUT_OF_STOCK";
};

async function searchProducts(query: string): Promise<VariantSearchResult[]> {
  const result = await searchSellableVariantsAction({ query });
  return result.success ? result.variants : [];
}

/**
 * Product search — instant, keyboard-friendly, one interaction to add.
 * ArrowUp/ArrowDown move a highlight through results (defaulting to the
 * first hit as soon as results arrive, so Enter alone adds it with no
 * arrow key needed), Enter adds the highlighted result and clears the
 * query for the next search, Escape clears the query. Every result row
 * surfaces product name, category, size, price, stock, SKU, and school (if
 * any) inline — no second page to open to inspect an item.
 */
export function CounterSaleProductSearch({
  onAdd,
}: {
  onAdd: (variant: VariantSearchResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [activeIndex, setActiveIndex] = useState(-1);
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const { results, isSearching } = useDebouncedSearch(query, searchProducts);

  // Adjust activeIndex during render (React's documented pattern for
  // "reset derived state when an input changes") rather than in an effect
  // — as soon as a new result set lands, highlight the first hit, which is
  // what makes "search, then Enter" a single keystroke away from adding an
  // item, without requiring an ArrowDown first.
  const [resultsForActiveIndex, setResultsForActiveIndex] = useState(results);
  if (results !== resultsForActiveIndex) {
    setResultsForActiveIndex(results);
    setActiveIndex(results.length > 0 ? 0 : -1);
  }

  const addResult = useCallback(
    (variant: VariantSearchResult) => {
      if (variant.stockStatus === "OUT_OF_STOCK") return;
      onAdd(variant);
      setQuery("");
      setActiveIndex(-1);
      inputRef.current?.focus();
    },
    [onAdd],
  );

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
      if (target) addResult(target);
    } else if (event.key === "Escape") {
      setQuery("");
    }
  }

  const showResults = query.trim().length > 0;

  return (
    <div>
      <div className="relative">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          ref={inputRef}
          role="combobox"
          aria-expanded={showResults}
          aria-controls={listId}
          aria-label="Search items by name, brand or SKU"
          autoComplete="off"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search item, brand or SKU (e.g. atta, Tata)"
          className="h-11 pl-9 text-base"
          autoFocus
        />
      </div>

      {showResults && (
        <ul id={listId} role="listbox" className="mt-3 max-h-80 divide-y overflow-y-auto rounded-lg border">
          {isSearching && <li className="p-3 text-sm text-muted-foreground">Searching…</li>}
          {!isSearching && results.length === 0 && (
            <li className="p-3 text-sm text-muted-foreground">No matching items.</li>
          )}
          {!isSearching &&
            results.map((variant, index) => {
              const outOfStock = variant.stockStatus === "OUT_OF_STOCK";
              return (
                <li key={variant.variantId} role="option" aria-selected={index === activeIndex}>
                  <button
                    type="button"
                    disabled={outOfStock}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => addResult(variant)}
                    className={cn(
                      "flex w-full items-center justify-between gap-3 p-3 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset",
                      index === activeIndex ? "bg-muted" : "hover:bg-muted",
                      outOfStock && "cursor-not-allowed opacity-60",
                    )}
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">
                        {variant.productName} &middot; {variant.size}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {variant.categoryName}
                        {variant.brand ? ` · ${variant.brand}` : ""} &middot; SKU {variant.sku}
                      </p>
                      <p className="mt-0.5 text-xs">
                        <span className="font-semibold text-foreground">
                          {formatPaise(variant.priceInPaise)}
                        </span>{" "}
                        &middot;{" "}
                        <span className={STOCK_STATUS_TEXT_CLASS[variant.stockStatus]}>
                          {STOCK_STATUS_LABEL[variant.stockStatus]} ({variant.stockQuantity})
                        </span>
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium",
                        outOfStock
                          ? "bg-muted text-muted-foreground"
                          : "bg-primary text-primary-foreground",
                      )}
                    >
                      {outOfStock ? "Unavailable" : "Add"}
                    </span>
                  </button>
                </li>
              );
            })}
        </ul>
      )}
    </div>
  );
}
