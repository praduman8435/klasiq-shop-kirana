/**
 * A selected Geoapify suggestion's coordinates must never remain
 * authoritative once the visible address text no longer matches what was
 * actually selected — free-typed text alone is never a location. Extracted
 * as a pure predicate (rather than inlined in
 * delivery-address-search.tsx's event handler) so this exact rule is
 * directly unit-testable — see
 * src/lib/__tests__/delivery-address-selection.test.ts and
 * docs/PHASE_3_3_REPORT.md Part 3 "Address state correctness".
 *
 * `lastAppliedSelectionText` is `null` when nothing has been selected yet
 * (nothing to invalidate). Any edit that produces a query different from
 * the exact text that was applied at selection time counts as a material
 * edit — even a single added/removed character.
 */
export function shouldInvalidateSelection(
  lastAppliedSelectionText: string | null,
  newQuery: string,
): boolean {
  return lastAppliedSelectionText !== null && lastAppliedSelectionText !== newQuery;
}
