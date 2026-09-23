-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "deliveryFormattedAddress" TEXT,
ADD COLUMN     "deliveryLatitude" DOUBLE PRECISION,
ADD COLUMN     "deliveryLongitude" DOUBLE PRECISION,
ADD COLUMN     "deliveryRouteDistanceMeters" INTEGER;

