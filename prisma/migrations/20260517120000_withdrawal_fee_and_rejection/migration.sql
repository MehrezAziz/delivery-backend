-- Country coin config: platform withdrawal fee (coins)
ALTER TABLE "country_coin_configs" ADD COLUMN IF NOT EXISTS "withdrawal_fee" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- Snapshot fee at request time + admin rejection reason (user-visible)
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;

ALTER TABLE "driver_withdrawal_requests" ADD COLUMN IF NOT EXISTS "fee_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "driver_withdrawal_requests" ADD COLUMN IF NOT EXISTS "rejection_reason" TEXT;
