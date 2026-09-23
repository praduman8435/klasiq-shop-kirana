@AGENTS.md

# Project context: Kirana/General Store pivot

This codebase is a fork of **Klasiq**, a school-uniform commerce platform
(Next.js App Router + TypeScript strict + Tailwind CSS v4 + shadcn/ui +
Prisma/PostgreSQL). It was copied from `/Users/user/shop` on 2026-09-23 as
the starting point for a friend's **kirana / general store** business — a
completely different kind of shop. Nothing in the business logic has been
adapted yet; this is a byte-for-byte copy of Klasiq's code.

Read `README.md`, `PRODUCT.md`, and `DESIGN.md` for how the codebase
describes itself today — but treat all three as **stale**: they describe
Klasiq's school-uniform positioning and will need a rewrite once the new
business's actual scope is settled.

## What Klasiq already built (Phases 1-4, all working)

Public storefront (search-a-school uniform discovery, browse/cart/
checkout, order tracking, WhatsApp order-status updates) + an Admin panel
covering: Counter Sale (in-store POS-style checkout), Orders/fulfillment/
returns, Inventory (products/variants/stock/low-stock), KhataBook
(customer running-credit ledger), and a full Supplier module (Purchases/
Bills, Payments, Credits, Refunds, and a read-only Supplier Ledger/account
statement). Money is always handled as integer paise, never floats/Decimal
— see `src/lib/money.ts`. Admin auth is a custom scrypt-hashed session
system, not any third-party auth provider.

## What is uniform/school-specific and needs a decision before going further

- **The "School" domain concept itself**: `School`, `SchoolClass`,
  `SchoolUniformAssignment`, `RecommendedUniformSet(+Item)` models, the
  homepage's "search your school" flow, and the `/school/[slug]` storefront
  pages. A kirana store has no equivalent — decide whether to repurpose
  this (e.g. multiple branches/localities?) or remove it entirely. It's
  threaded through the storefront, the admin panel, and the seed data, so
  this is the highest-leverage decision to make first.
- **Brand identity**: name "Klasiq", tagline, store contact info, legacy
  store names — all centralized in `src/lib/constants.ts` (`BRAND`,
  `STORE_CONTACT`). One place to change once the new business's identity
  is settled.
- **Product categories**: currently School Uniforms / School Bags / Socks
  / Shoes. A kirana store sells groceries/household/general essentials —
  categories, `prisma/seed.ts`'s demo data, and any uniform-specific
  copy/UI language will need replacing.

## What almost certainly transfers as-is (general local-retail tooling, not uniform-specific)

Counter Sale, Orders/checkout/delivery-or-pickup fulfillment, Inventory
management, **KhataBook** (this is literally the kirana-store running-
credit-account concept already, just needed a rename check), the entire
Supplier module (Purchases/Payments/Credits/Refunds/Ledger — plain
supplier accounting, nothing uniform-specific in it), admin auth, PDF
invoices, WhatsApp notifications.

## Current state of this copy

- Fresh copy of Klasiq; `node_modules`/`.next` excluded (regenerate with
  `npm install`); fresh local git history (one initial commit) — none of
  Klasiq's own commit history carried over.
- `.env` was reset to the safe local-dev template — it does **not** point
  at Klasiq's live Supabase database, and has no real API keys/secrets.
  There is no Supabase project, Vercel project, or domain for this kirana
  project yet — all of that is still to be set up, separately from Klasiq.
- No business logic, branding, or data model has been changed yet.

## Suggested first steps

1. Pin down the friend's actual business first: what they sell, whether
   they want a public storefront at all or just an admin-side inventory/
   KhataBook/supplier tool, single location or multiple.
2. Decide what happens to the School domain concept (repurpose vs. remove)
   before touching anything else.
3. Update branding (`src/lib/constants.ts`), then rewrite `README.md`/
   `PRODUCT.md`/`DESIGN.md` to match the real business.
4. When ready to go live, set up a **new** Supabase project and (if
   wanted) a new Vercel project for this store specifically — never reuse
   Klasiq's.
