-- CreateEnum
CREATE TYPE "KhataEntryKind" AS ENUM ('UDHAAR', 'OPENING_BALANCE');

-- AlterTable
ALTER TABLE "payment_receipts" ADD COLUMN     "collectionId" TEXT;

-- CreateTable
CREATE TABLE "khata_entries" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "kind" "KhataEntryKind" NOT NULL DEFAULT 'UDHAAR',
    "amountInPaise" INTEGER NOT NULL,
    "outstandingInPaise" INTEGER NOT NULL,
    "note" TEXT,
    "entryDate" TIMESTAMP(3) NOT NULL,
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "khata_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khata_collections" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,
    "paymentMethod" "PaymentMethod" NOT NULL,
    "note" TEXT,
    "collectedAt" TIMESTAMP(3) NOT NULL,
    "createdByAdminUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "khata_collections_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "khata_collection_allocations" (
    "id" TEXT NOT NULL,
    "collectionId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "amountInPaise" INTEGER NOT NULL,

    CONSTRAINT "khata_collection_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "khata_entries_customerId_idx" ON "khata_entries"("customerId");

-- CreateIndex
CREATE INDEX "khata_entries_entryDate_idx" ON "khata_entries"("entryDate");

-- CreateIndex
CREATE INDEX "khata_collections_customerId_idx" ON "khata_collections"("customerId");

-- CreateIndex
CREATE INDEX "khata_collections_collectedAt_idx" ON "khata_collections"("collectedAt");

-- CreateIndex
CREATE INDEX "khata_collection_allocations_collectionId_idx" ON "khata_collection_allocations"("collectionId");

-- CreateIndex
CREATE INDEX "khata_collection_allocations_entryId_idx" ON "khata_collection_allocations"("entryId");

-- CreateIndex
CREATE INDEX "payment_receipts_collectionId_idx" ON "payment_receipts"("collectionId");

-- AddForeignKey
ALTER TABLE "payment_receipts" ADD CONSTRAINT "payment_receipts_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "khata_collections"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_entries" ADD CONSTRAINT "khata_entries_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_entries" ADD CONSTRAINT "khata_entries_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_collections" ADD CONSTRAINT "khata_collections_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_collections" ADD CONSTRAINT "khata_collections_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_collection_allocations" ADD CONSTRAINT "khata_collection_allocations_collectionId_fkey" FOREIGN KEY ("collectionId") REFERENCES "khata_collections"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "khata_collection_allocations" ADD CONSTRAINT "khata_collection_allocations_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "khata_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- Same rule as every other table: nothing exposed through Supabase's REST API.
ALTER TABLE "khata_entries" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "khata_collections" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "khata_collection_allocations" ENABLE ROW LEVEL SECURITY;
