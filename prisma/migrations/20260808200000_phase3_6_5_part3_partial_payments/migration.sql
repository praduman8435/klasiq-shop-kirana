-- AlterEnum
ALTER TYPE "PaymentStatus" ADD VALUE 'PARTIALLY_PAID';

-- AlterTable: added nullable first so every pre-existing row can be
-- backfilled before the NOT NULL constraint is applied.
ALTER TABLE "orders" ADD COLUMN     "amountReceivedInPaise" INTEGER,
ADD COLUMN     "outstandingInPaise" INTEGER;

-- Backfill: no pre-existing order (Online or Counter) ever had a tracked
-- partial payment — every one of them was always expected to be paid in
-- full against its own recorded totalInPaise, so amountReceivedInPaise
-- equals totalInPaise and outstandingInPaise is zero for every row that
-- predates this feature.
UPDATE "orders" SET "amountReceivedInPaise" = "totalInPaise", "outstandingInPaise" = 0
  WHERE "amountReceivedInPaise" IS NULL;

-- AlterTable
ALTER TABLE "orders" ALTER COLUMN "amountReceivedInPaise" SET NOT NULL,
ALTER COLUMN "outstandingInPaise" SET NOT NULL;
