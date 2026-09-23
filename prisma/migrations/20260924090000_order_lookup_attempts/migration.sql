-- CreateTable
CREATE TABLE "order_lookup_attempts" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_lookup_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "order_lookup_attempts_ipAddress_createdAt_idx" ON "order_lookup_attempts"("ipAddress", "createdAt");

-- Same rule as every other table: nothing exposed through Supabase's REST API.
ALTER TABLE "order_lookup_attempts" ENABLE ROW LEVEL SECURITY;
