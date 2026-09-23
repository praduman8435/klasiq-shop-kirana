-- AlterTable
ALTER TABLE "inventory_adjustments" ADD COLUMN     "supplierPurchaseReceiptId" TEXT;

-- CreateTable
CREATE TABLE "supplier_purchase_receipts" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_purchase_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchase_receipt_items" (
    "id" TEXT NOT NULL,
    "receiptId" TEXT NOT NULL,
    "productVariantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitCostInPaise" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_purchase_receipt_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_purchase_receipts_purchaseId_idx" ON "supplier_purchase_receipts"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_purchase_receipts_receivedAt_idx" ON "supplier_purchase_receipts"("receivedAt");

-- CreateIndex
CREATE INDEX "supplier_purchase_receipt_items_receiptId_idx" ON "supplier_purchase_receipt_items"("receiptId");

-- CreateIndex
CREATE INDEX "supplier_purchase_receipt_items_productVariantId_idx" ON "supplier_purchase_receipt_items"("productVariantId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_purchase_receipt_items_receiptId_productVariantId_key" ON "supplier_purchase_receipt_items"("receiptId", "productVariantId");

-- CreateIndex
CREATE INDEX "inventory_adjustments_supplierPurchaseReceiptId_idx" ON "inventory_adjustments"("supplierPurchaseReceiptId");

-- AddForeignKey
ALTER TABLE "inventory_adjustments" ADD CONSTRAINT "inventory_adjustments_supplierPurchaseReceiptId_fkey" FOREIGN KEY ("supplierPurchaseReceiptId") REFERENCES "supplier_purchase_receipts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_receipts" ADD CONSTRAINT "supplier_purchase_receipts_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "supplier_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_receipts" ADD CONSTRAINT "supplier_purchase_receipts_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_receipt_items" ADD CONSTRAINT "supplier_purchase_receipt_items_receiptId_fkey" FOREIGN KEY ("receiptId") REFERENCES "supplier_purchase_receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_receipt_items" ADD CONSTRAINT "supplier_purchase_receipt_items_productVariantId_fkey" FOREIGN KEY ("productVariantId") REFERENCES "product_variants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
