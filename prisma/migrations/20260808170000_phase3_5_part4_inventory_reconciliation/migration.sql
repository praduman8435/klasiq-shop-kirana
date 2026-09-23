-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "InventoryAdjustmentReason" ADD VALUE 'RETURN_RESTORE';
ALTER TYPE "InventoryAdjustmentReason" ADD VALUE 'EXCHANGE_ISSUE';

-- AlterTable
ALTER TABLE "inventory_adjustments" ADD COLUMN     "returnRequestId" TEXT;

-- AlterTable
ALTER TABLE "return_request_items" ADD COLUMN     "replacementVariantId" TEXT;

-- CreateIndex
CREATE INDEX "inventory_adjustments_returnRequestId_idx" ON "inventory_adjustments"("returnRequestId");

-- CreateIndex
CREATE INDEX "return_request_items_replacementVariantId_idx" ON "return_request_items"("replacementVariantId");

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_returnRequestId_fkey" FOREIGN KEY ("returnRequestId") REFERENCES "return_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "return_request_items" ADD CONSTRAINT "return_request_items_replacementVariantId_fkey" FOREIGN KEY ("replacementVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

