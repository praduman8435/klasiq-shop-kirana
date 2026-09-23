import { z } from "zod";

/**
 * Phase 3.7 Part 2 — the one schema every product-search entry point
 * (the standalone /search page and /[categorySlug]'s own `?q=`) validates
 * against. `max(100)` matches every other search-shaped schema already in
 * this codebase (school search, admin counter-sale/customer search) —
 * bounds an abusive/absurdly long query before it ever reaches a
 * database call, not a meaningful product-name-length assumption.
 */
export const productSearchQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
});
