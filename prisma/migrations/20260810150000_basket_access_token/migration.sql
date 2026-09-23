-- Phase 3.7 Part 4 — Basket.accessToken: the unguessable bearer token
-- actually stored in the basket cookie going forward, replacing the raw
-- `id` (a plain cuid, not high-entropy enough to be a bearer credential
-- by itself — see the field's own doc comment in schema.prisma).

-- AlterTable: add as nullable first so this can backfill existing rows
-- before enforcing NOT NULL/UNIQUE.
ALTER TABLE "baskets" ADD COLUMN "accessToken" TEXT;

-- Backfill: every basket that already exists predates this migration
-- and was never issued a real random access token. Its own `id` is
-- already guaranteed unique, so it's a safe, trivial backfill value —
-- these are all pre-existing (in practice: already-abandoned or
-- already-converted) baskets, never a live cart a real customer is
-- mid-checkout with at migration time. Every basket created from this
-- point forward gets a genuine `generateAccessToken()` value instead
-- (src/lib/basket.ts).
UPDATE "baskets" SET "accessToken" = "id" WHERE "accessToken" IS NULL;

-- AlterTable: now safe to enforce NOT NULL + UNIQUE.
ALTER TABLE "baskets" ALTER COLUMN "accessToken" SET NOT NULL;
CREATE UNIQUE INDEX "baskets_accessToken_key" ON "baskets"("accessToken");
