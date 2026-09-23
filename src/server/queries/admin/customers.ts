import type { Prisma } from "@prisma/client";
import { db } from "@/lib/db";
import { normalizePhoneNumber } from "@/lib/phone";

// Foundation only — no dedicated admin customer-directory UI is built on top
// of this yet (Phase 3.1 was explicitly data/query-layer only); the Counter
// Sale customer panel (Phase 3.2, redesigned Phase 3.6.5 Part 1) is this
// function's one real caller today. Mirrors the same list-cap convention as
// getAdminOrders (src/server/queries/admin/orders.ts).
const ADMIN_CUSTOMER_LIST_LIMIT = 50;

/** Minimum digit count before a query is treated as a phone search at all —
 * below this, a 1-2 digit fragment would match nearly every customer's
 * normalized phone number and return a near-useless flood of results. See
 * docs/PHASE_3_6_5_REPORT.md Part 1 "Search experience". */
const MIN_PHONE_SEARCH_DIGITS = 3;

/**
 * Unified search across the three identifiers a cashier or admin might type
 * — Customer ID, phone number, or name — combined with a single OR, all
 * `contains`/substring matches (never requiring an exact or full-length
 * value). See docs/PHASE_3_6_5_REPORT.md Part 1 "Search experience" for why
 * this replaced the exact-customerId/exact-phone-only version Phase 3.1
 * shipped: a real cashier types a partial ID or a few digits of a phone
 * number, not always the complete value.
 *
 * Phone matching strips every non-digit character from the query and
 * `contains`-matches the resulting digit string against BOTH normalized
 * phone fields (never the raw, inconsistently-formatted `primaryPhone`/
 * `whatsappPhone` columns — a stored value like "98765-43210" could hide a
 * hyphen in the middle of what should be a contiguous digit match). This
 * single substring check subsumes the old exact-match case too (a complete,
 * validly-formatted phone number's digits are still a substring of its own
 * normalized form), so there is no separate "exact" branch to keep in sync.
 *
 * Indexing note: `customerId` and `primaryPhoneNormalized` are both unique
 * (B-tree), so this function's `contains` matching against them no longer
 * benefits from that index the way an exact-match lookup would — the same
 * known, documented tradeoff `displayName` search already accepted (Postgres
 * can't use a plain B-tree for arbitrary `%x%`; a trigram/GIN index is the
 * correct fix if/when this needs to scale past a real shop's actual
 * customer count, deferred until it's an actual problem, not a hypothetical
 * one).
 */
/**
 * The actual match rule, extracted so a caller needing different
 * pagination/ordering (KhataBook's own paginated directory,
 * `getKhataBookCustomerDirectory` in src/server/queries/admin/khatabook.ts)
 * can reuse the EXACT SAME conditions `searchCustomers` below already
 * uses, rather than a second, potentially-drifting copy of this OR
 * clause. Zero behavior change to `searchCustomers` itself — this is a
 * pure extraction.
 */
export function buildCustomerSearchWhere(query: string): Prisma.CustomerWhereInput {
  const trimmed = query.trim();
  const digitsOnly = trimmed.replace(/\D/g, "");

  return {
    OR: [
      { customerId: { contains: trimmed, mode: "insensitive" } },
      { displayName: { contains: trimmed, mode: "insensitive" } },
      ...(digitsOnly.length >= MIN_PHONE_SEARCH_DIGITS
        ? [
            { primaryPhoneNormalized: { contains: digitsOnly } },
            { whatsappPhoneNormalized: { contains: digitsOnly } },
          ]
        : []),
    ],
  };
}

export async function searchCustomers(query: string, limit = ADMIN_CUSTOMER_LIST_LIMIT) {
  const trimmed = query.trim();
  if (!trimmed) return [];

  return db.customer.findMany({
    where: buildCustomerSearchWhere(trimmed),
    orderBy: { lastOrderAt: "desc" },
    take: limit,
  });
}

/** "A few recently used customers" (Phase 3.6.5 Part 1 section 9) — the
 * same model, the same `lastOrderAt desc` ordering `searchCustomers` above
 * already uses, just without a text filter. Excludes customers who have
 * never actually completed an order (`lastOrderAt: null`) — a customer
 * record that exists but hasn't been purchased from yet (e.g. created via
 * the counter-sale inline form moments ago, before that sale completes)
 * isn't meaningfully "recent" in the sense this list is for: quickly
 * re-finding a regular. */
const RECENT_CUSTOMERS_LIMIT = 5;

export async function getRecentCustomers(limit = RECENT_CUSTOMERS_LIMIT) {
  return db.customer.findMany({
    where: { lastOrderAt: { not: null } },
    orderBy: { lastOrderAt: "desc" },
    take: limit,
  });
}

export async function getCustomerByCustomerId(customerId: string) {
  return db.customer.findUnique({ where: { customerId } });
}

export async function getCustomerByNormalizedPrimaryPhone(rawPhone: string) {
  const normalized = normalizePhoneNumber(rawPhone);
  if (!normalized.valid) return null;
  return db.customer.findUnique({ where: { primaryPhoneNormalized: normalized.normalized } });
}
