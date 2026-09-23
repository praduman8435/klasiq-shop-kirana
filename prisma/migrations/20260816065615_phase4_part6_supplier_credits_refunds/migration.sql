-- CreateEnum
CREATE TYPE "SupplierCreditReason" AS ENUM ('SUPPLIER_RETURN', 'OVERPAYMENT', 'PRICE_ADJUSTMENT', 'QUALITY_ADJUSTMENT', 'COMMERCIAL_ADJUSTMENT', 'OTHER');

-- CreateTable
CREATE TABLE "supplier_credits" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "creditNumber" TEXT NOT NULL,
    "creditDate" TIMESTAMP(3) NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "reason" "SupplierCreditReason" NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "sourceReturnId" TEXT,
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_credits_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "credit_allocations" (
    "id" TEXT NOT NULL,
    "creditId" TEXT NOT NULL,
    "purchaseId" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "credit_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_refunds" (
    "id" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "refundNumber" TEXT NOT NULL,
    "refundDate" TIMESTAMP(3) NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "refundMethod" "SupplierPaymentMethod" NOT NULL,
    "receivedByName" TEXT NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "sourceCreditId" TEXT,
    "sourceReturnId" TEXT,
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_refunds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_refund_attachments" (
    "id" TEXT NOT NULL,
    "refundId" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "originalFilename" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_refund_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_credits_creditNumber_key" ON "supplier_credits"("creditNumber");

-- CreateIndex
CREATE INDEX "supplier_credits_supplierId_idx" ON "supplier_credits"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_credits_creditDate_idx" ON "supplier_credits"("creditDate");

-- CreateIndex
CREATE INDEX "supplier_credits_sourceReturnId_idx" ON "supplier_credits"("sourceReturnId");

-- CreateIndex
CREATE INDEX "credit_allocations_creditId_idx" ON "credit_allocations"("creditId");

-- CreateIndex
CREATE INDEX "credit_allocations_purchaseId_idx" ON "credit_allocations"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_refunds_refundNumber_key" ON "supplier_refunds"("refundNumber");

-- CreateIndex
CREATE INDEX "supplier_refunds_supplierId_idx" ON "supplier_refunds"("supplierId");

-- CreateIndex
CREATE INDEX "supplier_refunds_refundDate_idx" ON "supplier_refunds"("refundDate");

-- CreateIndex
CREATE INDEX "supplier_refunds_sourceCreditId_idx" ON "supplier_refunds"("sourceCreditId");

-- CreateIndex
CREATE INDEX "supplier_refunds_sourceReturnId_idx" ON "supplier_refunds"("sourceReturnId");

-- CreateIndex
CREATE INDEX "supplier_refund_attachments_refundId_idx" ON "supplier_refund_attachments"("refundId");

-- AddForeignKey
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_sourceReturnId_fkey" FOREIGN KEY ("sourceReturnId") REFERENCES "supplier_purchase_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_credits" ADD CONSTRAINT "supplier_credits_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_creditId_fkey" FOREIGN KEY ("creditId") REFERENCES "supplier_credits"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "credit_allocations" ADD CONSTRAINT "credit_allocations_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "supplier_purchases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_refunds" ADD CONSTRAINT "supplier_refunds_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_refunds" ADD CONSTRAINT "supplier_refunds_sourceCreditId_fkey" FOREIGN KEY ("sourceCreditId") REFERENCES "supplier_credits"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_refunds" ADD CONSTRAINT "supplier_refunds_sourceReturnId_fkey" FOREIGN KEY ("sourceReturnId") REFERENCES "supplier_purchase_returns"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_refunds" ADD CONSTRAINT "supplier_refunds_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_refund_attachments" ADD CONSTRAINT "supplier_refund_attachments_refundId_fkey" FOREIGN KEY ("refundId") REFERENCES "supplier_refunds"("id") ON DELETE CASCADE ON UPDATE CASCADE;
