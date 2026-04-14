-- AlterTable
ALTER TABLE "orders"
ADD COLUMN "cancel_timer_remaining_seconds" INTEGER NOT NULL DEFAULT 900,
ADD COLUMN "cancel_timer_last_resumed_at" TIMESTAMP(3),
ADD COLUMN "cancel_timer_paused_at" TIMESTAMP(3);

-- Backfill existing orders with consistent timer state
UPDATE "orders"
SET
  "cancel_timer_remaining_seconds" = GREATEST(0, COALESCE("cancel_after_minutes", 15) * 60),
  "cancel_timer_last_resumed_at" = CASE
    WHEN "status" = 'SEARCHING_DRIVER' THEN "created_at"
    ELSE NULL
  END,
  "cancel_timer_paused_at" = CASE
    WHEN "status" IN ('PENDING_CUSTOMER_APPROVAL', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED') THEN NOW()
    ELSE NULL
  END;
