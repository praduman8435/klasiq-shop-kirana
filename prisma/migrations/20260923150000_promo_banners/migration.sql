-- CreateEnum
CREATE TYPE "PromoBannerTone" AS ENUM ('RED', 'INK', 'SOFT');

-- CreateEnum
CREATE TYPE "PromoBannerIcon" AS ENUM ('DELIVERY', 'PICKUP', 'PAYMENT', 'OFFER', 'FESTIVAL', 'FRESH');

-- CreateTable
CREATE TABLE "promo_banners" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "ctaLabel" TEXT,
    "ctaHref" TEXT,
    "tone" "PromoBannerTone" NOT NULL DEFAULT 'RED',
    "icon" "PromoBannerIcon" NOT NULL DEFAULT 'OFFER',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "startsAt" TIMESTAMP(3),
    "endsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "promo_banners_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "promo_banners_isActive_sortOrder_idx" ON "promo_banners"("isActive", "sortOrder");


-- Same rule as every other table (see 20260923120000_enable_row_level_security):
-- no access through Supabase's public API; the app connects as the owner.
ALTER TABLE "promo_banners" ENABLE ROW LEVEL SECURITY;

-- Starting banners — the three the homepage used to generate in code, now
-- editable rows. "Free delivery" starts switched OFF because online
-- delivery needs a Geoapify key and DELIVERY_ENABLED=true; switch it on in
-- /admin/banners once delivery is live.
INSERT INTO "promo_banners" ("id", "title", "body", "ctaLabel", "ctaHref", "tone", "icon", "isActive", "sortOrder", "updatedAt") VALUES
  ('banner_default_delivery', 'Free delivery within 3 km', 'Further away? Still free on orders above ₹1,500.', 'Start shopping', '/atta-rice-dal', 'RED', 'DELIVERY', false, 0, CURRENT_TIMESTAMP),
  ('banner_default_pickup', 'Order now, pick up at the store', 'Your order is packed and waiting at the counter when you arrive.', 'Browse aisles', '/#categories-heading', 'INK', 'PICKUP', true, 1, CURRENT_TIMESTAMP),
  ('banner_default_payment', 'Pay when it reaches you', 'Cash on delivery, or pay at the store. No card or online payment needed.', NULL, NULL, 'SOFT', 'PAYMENT', true, 2, CURRENT_TIMESTAMP);
