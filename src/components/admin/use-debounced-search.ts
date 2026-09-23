import { useEffect, useRef, useState } from "react";

const DEBOUNCE_MS = 150;

/**
 * Debounces a search callback: fires ~150ms after the caller stops typing
 * (fast enough to feel instant, still batching rapid keystrokes into one
 * request — see docs/PHASE_3_2_REPORT.md "Performance"), and ignores any
 * response that isn't from the most recent request — a slow earlier search
 * resolving after a faster later one must never clobber the latest
 * results. Shared by the counter-sale product and customer search panels;
 * no debounce library is used elsewhere in this codebase (see
 * src/components/site/school-search.tsx's own inline version), so this
 * stays a small local implementation rather than adding a dependency.
 */
export function useDebouncedSearch<T>(
  query: string,
  search: (query: string) => Promise<T[]>,
): { results: T[]; isSearching: boolean } {
  const [results, setResults] = useState<T[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const requestIdRef = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (!trimmed) {
      // Nothing to update: callers only render results/isSearching when
      // the query is non-empty, so a stale value here is never shown.
      return;
    }

    const thisRequestId = ++requestIdRef.current;
    const timer = setTimeout(() => {
      setIsSearching(true);
      search(trimmed)
        .then((found) => {
          if (requestIdRef.current === thisRequestId) {
            setResults(found);
            setIsSearching(false);
          }
        })
        .catch(() => {
          // A network failure or unexpected server error must never leave
          // the UI stuck on "Searching…" forever — see
          // docs/PHASE_3_2_REPORT.md "Validation review" (interrupted
          // requests). Treated as "no results", not a fatal form error:
          // the cashier can simply retype or retry the search.
          if (requestIdRef.current === thisRequestId) {
            setResults([]);
            setIsSearching(false);
          }
        });
    }, DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query, search]);

  return { results, isSearching };
}
