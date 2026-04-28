-- Hotfix for branch drift: align order_return_deposit_feedbacks with current Prisma schema.
-- Old branch created this table without driver_id and with a unique order_id index.

ALTER TABLE "order_return_deposit_feedbacks"
ADD COLUMN IF NOT EXISTS "driver_id" TEXT;

DROP INDEX IF EXISTS "order_return_deposit_feedbacks_order_id_key";

CREATE INDEX IF NOT EXISTS "order_return_deposit_feedbacks_order_id_driver_id_idx"
  ON "order_return_deposit_feedbacks"("order_id", "driver_id");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_return_deposit_feedbacks_driver_id_fkey'
  ) THEN
    ALTER TABLE "order_return_deposit_feedbacks"
    ADD CONSTRAINT "order_return_deposit_feedbacks_driver_id_fkey"
    FOREIGN KEY ("driver_id") REFERENCES "drivers"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
