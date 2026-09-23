-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "createdByAdminUserId" TEXT;

-- CreateIndex
CREATE INDEX "orders_createdByAdminUserId_idx" ON "orders"("createdByAdminUserId");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_createdByAdminUserId_fkey" FOREIGN KEY ("createdByAdminUserId") REFERENCES "admin_users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

