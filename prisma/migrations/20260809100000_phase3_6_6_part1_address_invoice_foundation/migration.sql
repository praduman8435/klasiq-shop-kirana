-- AlterTable: Customer's own saved postal address (all nullable, optional).
ALTER TABLE "customers" ADD COLUMN     "addressLine" TEXT,
ADD COLUMN     "addressCity" TEXT,
ADD COLUMN     "addressState" TEXT,
ADD COLUMN     "addressPincode" TEXT;

-- AlterTable: the Order's own immutable address snapshot for invoicing
-- (all nullable — every pre-existing order simply never had one).
ALTER TABLE "orders" ADD COLUMN     "customerAddressLine" TEXT,
ADD COLUMN     "customerAddressCity" TEXT,
ADD COLUMN     "customerAddressState" TEXT,
ADD COLUMN     "customerAddressPincode" TEXT;
