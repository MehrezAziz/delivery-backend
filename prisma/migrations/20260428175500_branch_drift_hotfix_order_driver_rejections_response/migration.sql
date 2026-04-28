-- Hotfix for branch drift: align order_driver_rejections columns with current Prisma schema.
ALTER TABLE "order_driver_rejections"
ADD COLUMN IF NOT EXISTS "driver_response" TEXT,
ADD COLUMN IF NOT EXISTS "driver_responded_at" TIMESTAMP(3);
