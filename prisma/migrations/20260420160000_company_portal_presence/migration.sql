-- Main company portal presence (suppress duplicate order-created notifications).
ALTER TABLE "delivery_companies" ADD COLUMN "company_portal_presence_path" TEXT;
ALTER TABLE "delivery_companies" ADD COLUMN "company_portal_presence_at" TIMESTAMP(3);
