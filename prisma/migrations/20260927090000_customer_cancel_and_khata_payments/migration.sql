-- CreateEnum
CREATE TYPE "OrderCancelledBy" AS ENUM ('CUSTOMER', 'SHOP');

-- CreateEnum
CREATE TYPE "KhataPaymentClaimStatus" AS ENUM ('PENDING', 'CONFIRMED', 'REJECTED');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "cancelReason" TEXT,
ADD COLUMN     "cancelledAt" TIMESTAMP(3),
ADD COLUMN     "cancelledBy" "OrderCancelledBy";

-- CreateTable
CREATE TABLE "khata_payment_claims" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "upiReference" TEXT,
    "status" "KhataPaymentClaimStatus" NOT NULL DEFAULT 'PENDING',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "decidedAt" TIMESTAMP(3),
    "decidedByAdminUserId" TEXT,
    "collectionId" TEXT,

    CONSTRAINT "khata_payment_claims_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "khata_payment_claims_collectionId_key" ON "khata_payment_claims"("collectionId");

-- CreateIndex
CREATE INDEX "khata_payment_claims_customerId_idx" ON "khata_payment_claims"("customerId");

-- CreateIndex
CREATE INDEX "khata_payment_claims_status_createdAt_idx" ON "khata_payment_claims"("status", "createdAt");

-- AddForeignKey
ALTER TABLE "khata_payment_claims" ADD CONSTRAINT "khata_payment_claims_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_payment_claims" ADD CONSTRAINT "khata_payment_claims_decidedByAdminUserId_fkey" FOREIGN KEY ("decidedByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_payment_claims" ADD CONSTRAINT "khata_payment_claims_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "khata_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;


-- Supabase: no direct client access to this table (the app connects as the owner).
ALTER TABLE "khata_payment_claims" ENABLE ROW LEVEL SECURITY;
