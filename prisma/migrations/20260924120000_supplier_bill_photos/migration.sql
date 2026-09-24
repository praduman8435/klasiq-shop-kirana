-- CreateTable
CREATE TABLE "supplier_bill_photos" (
    "id" TEXT NOT NULL,
    "contentType" TEXT NOT NULL,
    "byteSize" INTEGER NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_bill_photos_pkey" PRIMARY KEY ("id")
);

-- Same rule as every other table: nothing exposed through Supabase's REST API.
ALTER TABLE "supplier_bill_photos" ENABLE ROW LEVEL SECURITY;
