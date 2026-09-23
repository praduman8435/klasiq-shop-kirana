-- AlterTable: human-friendly, customer-facing reference for ReturnRequest
-- (RET-YYYYMMDD-XXXXX), mirroring Order.orderNumber's own convention.
-- Safe as NOT NULL + UNIQUE directly: return_requests has no rows yet
-- (Phase 3.5 Part 1 shipped no UI to create any real ones).
ALTER TABLE "return_requests" ADD COLUMN "returnNumber" TEXT NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "return_requests_returnNumber_key" ON "return_requests"("returnNumber");
