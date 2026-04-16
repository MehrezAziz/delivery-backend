-- Add new order statuses for return workflow
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURNED';
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'RETURN_DEPOSIT';

-- Add new CS permissions for delivery company management/visibility
ALTER TYPE "CustomerServiceRole" ADD VALUE IF NOT EXISTS 'SEE_DELIVERY_COMPANY';
ALTER TYPE "CustomerServiceRole" ADD VALUE IF NOT EXISTS 'MANAGE_DELIVERY_COMPANY';

-- Persist feedback after return deposit status
CREATE TABLE IF NOT EXISTS "order_return_deposit_feedbacks" (
  "id" TEXT NOT NULL,
  "order_id" TEXT NOT NULL,
  "reported_by_user_id" TEXT NOT NULL,
  "condition_issue" BOOLEAN NOT NULL DEFAULT false,
  "feedback" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "order_return_deposit_feedbacks_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "order_return_deposit_feedbacks_order_id_key"
  ON "order_return_deposit_feedbacks"("order_id");

CREATE INDEX IF NOT EXISTS "order_return_deposit_feedbacks_reported_by_user_id_created_at_idx"
  ON "order_return_deposit_feedbacks"("reported_by_user_id", "created_at");

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'order_return_deposit_feedbacks_order_id_fkey'
  ) THEN
    ALTER TABLE "order_return_deposit_feedbacks"
    ADD CONSTRAINT "order_return_deposit_feedbacks_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
