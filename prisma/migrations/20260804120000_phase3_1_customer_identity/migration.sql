-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "customerId" TEXT;

-- CreateTable
CREATE TABLE "customers" (
    "id" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "displayName" TEXT,
    "primaryPhone" TEXT,
    "primaryPhoneNormalized" TEXT,
    "whatsappPhone" TEXT,
    "whatsappPhoneNormalized" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "lastOrderAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "customers_customerId_key" ON "customers"("customerId");

-- CreateIndex
CREATE UNIQUE INDEX "customers_primaryPhoneNormalized_key" ON "customers"("primaryPhoneNormalized");

-- CreateIndex
CREATE INDEX "customers_whatsappPhoneNormalized_idx" ON "customers"("whatsappPhoneNormalized");

-- CreateIndex
CREATE INDEX "customers_lastOrderAt_idx" ON "customers"("lastOrderAt");

-- CreateIndex
CREATE INDEX "orders_customerId_idx" ON "orders"("customerId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

