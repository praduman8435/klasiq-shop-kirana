-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('FLAT', 'PERCENTAGE');

-- AlterTable: Counter Sale negotiated discount (Online Checkout never sets these)
ALTER TABLE "orders" ADD COLUMN     "discountType" "DiscountType",
ADD COLUMN     "discountValue" INTEGER,
ADD COLUMN     "discountReason" TEXT,
ADD COLUMN     "discountInPaise" INTEGER NOT NULL DEFAULT 0;

-- AlterTable: immutable post-discount effective line total, added nullable
-- first so every pre-existing row can be backfilled before the NOT NULL
-- constraint is applied.
ALTER TABLE "order_items" ADD COLUMN     "effectiveLineTotalInPaise" INTEGER;

-- Backfill: no pre-existing order ever had a discount, so the effective
-- total is simply the original line total for every row that predates this
-- column.
UPDATE "order_items" SET "effectiveLineTotalInPaise" = "lineTotalInPaise" WHERE "effectiveLineTotalInPaise" IS NULL;

-- AlterTable
ALTER TABLE "order_items" ALTER COLUMN "effectiveLineTotalInPaise" SET NOT NULL;
