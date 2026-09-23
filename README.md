# Klasiq

A kirana/general-store commerce platform: a public storefront where
neighbourhood customers search by product or brand, pick a pack size and
order for store pickup or local delivery, and a Klasiq Admin dashboard
for the shop — counter sales, orders, stock, suppliers, returns and
KhataBook (customer credit). See `PRODUCT.md` for the product brief.

This codebase started as a fork of Klasiq, a school-uniform store; the
School domain (schools, classes, uniform assignments, recommended sets)
has been removed. `docs/PHASE_*` are that original project's build
history — still accurate for architecture (checkout, counter sale,
returns, KhataBook, suppliers), but anything school-specific in them no
longer applies. The migration history was squashed into a single
`init` migration at the fork point.

## Stack

Next.js (App Router) + TypeScript (strict) + Tailwind CSS v4 + shadcn/ui,
Prisma + PostgreSQL. One deployable app, one database — no microservices,
queues, or other infrastructure.

## Local development

1. **Start Postgres** (Docker Compose):

   ```bash
   docker compose up -d
   ```

2. **Configure environment**: copy `.env.example` to `.env` and adjust if
   needed. The defaults work with the Docker Compose Postgres above.

   ```bash
   cp .env.example .env
   ```

3. **Install dependencies and run migrations**:

   ```bash
   npm install
   npx prisma migrate deploy
   ```

4. **Seed demo data** (eight kirana categories and illustrative demo
   products — see `prisma/seed.ts`):

   ```bash
   npm run db:seed
   ```

5. **Create the first Klasiq Admin user** — set these three env vars
   (locally in `.env`, or inline on the command) and run:

   ```bash
   ADMIN_BOOTSTRAP_NAME="Shop Owner" \
   ADMIN_BOOTSTRAP_EMAIL="owner@example.com" \
   ADMIN_BOOTSTRAP_PASSWORD="choose-a-real-password" \
   npm run db:create-admin
   ```

   This is idempotent — running it again with an existing email is a
   no-op. It's separate from `db:seed` on purpose: seed data is
   demo/dev-only, this script is safe to run anywhere, including a real
   deployment, to bootstrap the first operator account.

6. **Run the app**:

   ```bash
   npm run dev
   ```

   Public storefront: [http://localhost:3000](http://localhost:3000)
   Admin: [http://localhost:3000/admin/login](http://localhost:3000/admin/login)

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Start the dev server |
| `npm run build` / `npm run start` | Production build / run it |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run lint` | ESLint |
| `npm test` | Vitest (unit + real-Postgres integration tests) |
| `npm run db:migrate` | Create/apply a Prisma migration in development |
| `npm run db:seed` | Load demo categories/products |
| `npm run db:create-admin` | Bootstrap a Klasiq Admin user (see above) |
| `npm run db:studio` | Prisma Studio, for inspecting the database directly |

## Configuration

Key environment variables (see `.env.example` for the full list with
defaults):

- `DATABASE_URL` — Postgres connection string.
- `SITE_URL` — the app's public base URL, used for metadata/sitemap/robots
  and (from Phase 4) QR code generation. Unset in development (falls back
  to `http://localhost:3000`); set this in production once the domain is
  finalized — nothing in the codebase hard-codes an assumed domain.
- `PICKUP_ENABLED` / `DELIVERY_ENABLED` / `DELIVERY_FEE_IN_PAISE` /
  `FREE_DELIVERY_THRESHOLD_IN_PAISE` — fulfillment configuration (no admin
  settings UI for these yet).
- `ADMIN_BOOTSTRAP_*` — only read by `npm run db:create-admin`, not by the
  running app.

## Security — secrets

Every credential this app uses (database connection string, WhatsApp
Business API token, Geoapify key, admin bootstrap password) is read
exclusively from environment variables — none is ever hardcoded in
source, and `.env` is gitignored (`.env.example` is the only tracked,
placeholder-only template). This app has no client-exposed environment
variables at all (no `NEXT_PUBLIC_`/`REACT_APP_`-prefixed variable
exists anywhere in the codebase) — every credential above is server-only
by construction. A full audit (source tree + entire git history) as of
2026-08-10 found no secret ever committed to this repository.

**If that ever changes** — if any real credential is ever hardcoded and
committed, even briefly and even if removed in a later commit — treat it
as compromised immediately: rotate it at the provider (Meta Business
Settings, Geoapify dashboard, database host, etc.) as soon as it's
found. Git history is permanent; deleting the line in a new commit does
not remove the old value from the repository's history, any clone, or
any fork. Never rely on `git rm`/a force-push/`.gitignore` alone to
"undo" a committed secret.

## Tests

`npm test` runs both pure unit tests and integration tests against a real
local Postgres (via the same `DATABASE_URL`). The integration tests create
and clean up their own fixtures — they don't depend on `prisma/seed.ts`
having been run, and they leave the database exactly as they found it.
