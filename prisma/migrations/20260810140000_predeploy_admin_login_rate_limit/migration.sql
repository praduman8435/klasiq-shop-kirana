-- CreateTable: rate-limit counter for admin login attempts
-- (pre-deployment hardening). One row per attempt, ipAddress only — see
-- the model's own schema doc comment for why this is deliberately not an
-- audit log.
CREATE TABLE "admin_login_attempts" (
    "id" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "admin_login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "admin_login_attempts_ipAddress_createdAt_idx" ON "admin_login_attempts"("ipAddress", "createdAt");
