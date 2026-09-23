-- CreateEnum
CREATE TYPE "OrderSource" AS ENUM ('ONLINE', 'COUNTER');

-- AlterEnum
ALTER TYPE "FulfillmentType" ADD VALUE 'COUNTER_HANDOVER';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "PaymentMethod" ADD VALUE 'CASH';
ALTER TYPE "PaymentMethod" ADD VALUE 'CARD';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "source" "OrderSource" NOT NULL DEFAULT 'ONLINE',
ALTER COLUMN "customerName" DROP NOT NULL,
ALTER COLUMN "customerMobile" DROP NOT NULL;

-- CreateIndex
CREATE INDEX "orders_source_idx" ON "orders"("source");

