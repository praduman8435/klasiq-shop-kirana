-- AlterTable
ALTER TABLE "return_request_items" ADD COLUMN     "replacementUnitPriceInPaiseSnapshot" INTEGER;

-- AlterTable
ALTER TABLE "return_requests" ADD COLUMN     "overriddenAt" TIMESTAMP(3),
ADD COLUMN     "overriddenByAdminUserId" TEXT,
ADD COLUMN     "overrideReason" TEXT;

-- AddForeignKey
ALTER TABLE "return_requests" ADD CONSTRAINT "return_requests_overriddenByAdminUserId_fkey" FOREIGN KEY ("overriddenByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

