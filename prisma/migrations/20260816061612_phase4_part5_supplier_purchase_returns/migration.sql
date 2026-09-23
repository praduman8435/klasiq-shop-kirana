-- CreateEnum
CREATE TYPE "SupplierPurchaseReturnReason" AS ENUM ('DAMAGED', 'WRONG_ITEM', 'WRONG_SIZE', 'DEFECTIVE', 'EXCESS_QUANTITY', 'QUALITY_ISSUE', 'SUPPLIER_REQUEST', 'OTHER');

-- CreateEnum
CREATE TYPE "SupplierPurchaseReturnStatus" AS ENUM ('COMPLETED', 'CANCELLED');

-- AlterEnum
ALTER TYPE "InventoryAdjustmentReason" ADD VALUE 'SUPPLIER_RETURN';

-- AlterTable
ALTER TABLE "inventory_adjustments" ADD COLUMN     "supplierPurchaseReturnId" TEXT;

-- CreateTable
CREATE TABLE "supplier_purchase_returns" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "returnNumber" TEXT NOT NULL,
    "returnDate" TIMESTAMP(3) NOT NULL,
    "status" "SupplierPurchaseReturnStatus" NOT NULL DEFAULT 'COMPLETED',
    "reason" "SupplierPurchaseReturnReason" NOT NULL,
    "reasonNote" TEXT,
    "reference" TEXT,
    "notes" TEXT,
    "createdByAdminUserId" TEXT,
    "confirmedByAdminUserId" TEXT,
    "confirmedAt" TIMESTAMP(3),
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_purchase_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchase_return_items" (
    "id" TEXT NOT NULL,
    "returnId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostInPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_purchase_return_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_purchase_returns_returnNumber_key" ON "supplier_purchase_returns"("returnNumber");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_purchase_returns_idempotencyKey_key" ON "supplier_purchase_returns"("idempotencyKey");

-- CreateIndex
CREATE INDEX "supplier_purchase_returns_purchaseId_idx" ON "supplier_purchase_returns"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_purchase_returns_returnDate_idx" ON "supplier_purchase_returns"("returnDate");

-- CreateIndex
CREATE INDEX "supplier_purchase_return_items_returnId_idx" ON "supplier_purchase_return_items"("returnId");

-- CreateIndex
CREATE INDEX "supplier_purchase_return_items_productVariantId_idx" ON "supplier_purchase_return_items"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_purchase_return_items_returnId_productVariantId_key" ON "supplier_purchase_return_items"("returnId", "productVariantId");

-- CreateIndex
CREATE INDEX "inventory_adjustments_supplierPurchaseReturnId_idx" ON "inventory_adjustments"("supplierPurchaseReturnId");

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_supplierPurchaseReturnId_fkey" FOREIGN KEY ("supplierPurchaseReturnId") REFERENCES "supplier_purchase_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_returns" ADD CONSTRAINT "supplier_purchase_returns_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "supplier_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_returns" ADD CONSTRAINT "supplier_purchase_returns_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_returns" ADD CONSTRAINT "supplier_purchase_returns_confirmedByAdminUserId_fkey" FOREIGN KEY ("confirmedByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_return_items" ADD CONSTRAINT "supplier_purchase_return_items_returnId_fkey" FOREIGN KEY ("returnId") REFERENCES "supplier_purchase_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_return_items" ADD CONSTRAINT "supplier_purchase_return_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
