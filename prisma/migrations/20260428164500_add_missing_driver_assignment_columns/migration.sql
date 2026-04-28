-- Backfill missing columns expected by Prisma schema/order include queries.
ALTER TABLE "driver_assignments"
ADD COLUMN IF NOT EXISTS "customer_call_count_before_return" INTEGER,
ADD COLUMN IF NOT EXISTS "return_evidence_image_url" TEXT;
