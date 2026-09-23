-- CreateTable
CREATE TABLE "supplier_purchases" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "purchaseDate" TIMESTAMP(3) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "totalInPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_purchases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchase_bills" (
    "id" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "billNumber" TEXT,
    "billDate" TIMESTAMP(3) NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_purchase_bills_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_purchase_bill_attachments" (
    "id" TEXT NOT NULL,
    "billId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalFilename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_purchase_bill_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "supplier_purchases_supplierId_idx" ON "supplier_purchases"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_purchases_purchaseDate_idx" ON "supplier_purchases"("purchaseDate");

-- CreateIndex
CREATE INDEX "supplier_purchase_bills_purchaseId_idx" ON "supplier_purchase_bills"("purchaseId");

-- CreateIndex
CREATE INDEX "supplier_purchase_bill_attachments_billId_idx" ON "supplier_purchase_bill_attachments"("billId");

-- AddForeignKey
ALTER TABLE "supplier_purchases" ADD CONSTRAINT "supplier_purchases_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_bills" ADD CONSTRAINT "supplier_purchase_bills_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "supplier_purchases"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_purchase_bill_attachments" ADD CONSTRAINT "supplier_purchase_bill_attachments_billId_fkey" FOREIGN KEY ("billId") REFERENCES "supplier_purchase_bills"("id") ON DELETE CASCADE ON UPDATE CASCADE;
