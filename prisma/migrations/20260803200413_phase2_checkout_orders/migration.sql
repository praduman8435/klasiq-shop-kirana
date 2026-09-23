-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('UNPAID', 'PAID', 'REFUNDED', 'FAILED');

-- CreateEnum
CREATE TYPE "BasketStatus" AS ENUM ('ACTIVE', 'CONVERTED');

-- AlterTable
ALTER TABLE "basket_items" ADD COLUMN     "priceInPaiseAtAdd" INTEGER NOT NULL;

-- AlterTable
ALTER TABLE "baskets" ADD COLUMN     "convertedOrderId" TEXT,
ADD COLUMN     "status" "BasketStatus" NOT NULL DEFAULT 'ACTIVE';

-- AlterTable
ALTER TABLE "order_items" ADD COLUMN     "lineTotalInPaise" INTEGER NOT NULL,
ADD COLUMN     "productId" TEXT,
ADD COLUMN     "skuSnapshot" TEXT NOT NULL;

-- AlterTable
ALTER TABLE "orders" DROP COLUMN "deliveryAddress",
ADD COLUMN     "accessToken" TEXT NOT NULL,
ADD COLUMN     "deliveryAddressLine" TEXT,
ADD COLUMN     "deliveryArea" TEXT,
ADD COLUMN     "deliveryFeeInPaise" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "deliveryLandmark" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'UNPAID',
ADD COLUMN     "subtotalInPaise" INTEGER NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "baskets_convertedOrderId_key" ON "baskets"("convertedOrderId");

-- CreateIndex
CREATE UNIQUE INDEX "orders_accessToken_key" ON "orders"("accessToken");

-- CreateIndex
CREATE UNIQUE INDEX "orders_idempotencyKey_key" ON "orders"("idempotencyKey");

-- AddForeignKey
ALTER TABLE "baskets" ADD CONSTRAINT "baskets_convertedOrderId_fkey" FOREIGN KEY ("convertedOrderId") REFERENCES "orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_productId_fkey" FOREIGN KEY ("productId") REFERENCES "products"("id") ON DELETE SET NULL ON UPDATE CASCADE;

