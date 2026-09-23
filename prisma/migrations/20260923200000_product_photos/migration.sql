-- CreateTable
CREATE TABLE "product_photos" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_photos_pkey" PRIMARY KEY ("id")
);

-- Same rule as every other table: the app connects as the owner role, and
-- nothing is exposed through Supabase's public REST API.
ALTER TABLE "product_photos" ENABLE ROW LEVEL SECURITY;
