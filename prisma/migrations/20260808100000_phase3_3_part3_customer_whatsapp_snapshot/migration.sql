-- Phase 3.3 Part 3: additive, nullable checkout-time WhatsApp snapshot on
-- Order, separate from Customer.whatsappPhone (the customer's current,
-- mutable profile). No data backfill — historical orders correctly show
-- null since no WhatsApp number was ever collected before this field
-- existed.
ALTER TABLE "orders" ADD COLUMN "customerWhatsapp" TEXT;
