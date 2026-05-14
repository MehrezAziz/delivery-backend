-- Coin P2P transfers, step-up challenges, pricing referral split, wallet locks

CREATE TYPE "CoinTransferStatus" AS ENUM ('SCHEDULED', 'PENDING', 'COMPLETED', 'FAILED', 'CANCELLED');

ALTER TYPE "DriverTransactionType" ADD VALUE 'COIN_TRANSFER_SENT';
ALTER TYPE "DriverTransactionType" ADD VALUE 'COIN_TRANSFER_RECEIVED';

ALTER TYPE "WalletTransactionType" ADD VALUE 'COIN_TRANSFER_SENT';
ALTER TYPE "WalletTransactionType" ADD VALUE 'COIN_TRANSFER_RECEIVED';

ALTER TYPE "ReferenceType" ADD VALUE 'COIN_TRANSFER';

ALTER TYPE "NotificationType" ADD VALUE 'COIN_TRANSFER_RECEIVED';
ALTER TYPE "NotificationType" ADD VALUE 'COIN_TRANSFER_OUTBOUND_COMPLETED';
ALTER TYPE "NotificationType" ADD VALUE 'COIN_TRANSFER_CANCELLED';

-- base_fee = platform_fee + referral_commission
ALTER TABLE "country_pricing_policies" ADD COLUMN "referral_commission" DECIMAL(10,2) NOT NULL DEFAULT 0;
UPDATE "country_pricing_policies" SET "referral_commission" = "base_fee" - "platform_fee";

ALTER TABLE "digital_wallets" ADD COLUMN "locked_for_transfers" DECIMAL(10,2) NOT NULL DEFAULT 0;
ALTER TABLE "driver_accounts" ADD COLUMN "locked_for_transfers" DECIMAL(10,2) NOT NULL DEFAULT 0;

CREATE TABLE "country_coin_configs" (
    "id" TEXT NOT NULL,
    "country_id" TEXT NOT NULL,
    "transfer_fee_bps" INTEGER NOT NULL DEFAULT 200,
    "effective_from" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "effective_to" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "promo_label" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "country_coin_configs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "country_coin_configs_country_id_is_active_effective_from_idx" ON "country_coin_configs"("country_id", "is_active", "effective_from");
ALTER TABLE "country_coin_configs" ADD CONSTRAINT "country_coin_configs_country_id_fkey" FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "user_transfer_pins" (
    "user_id" TEXT NOT NULL,
    "pin_hash" TEXT NOT NULL,
    "failed_attempts" INTEGER NOT NULL DEFAULT 0,
    "locked_until" TIMESTAMP(3),
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "user_transfer_pins_pkey" PRIMARY KEY ("user_id")
);

ALTER TABLE "user_transfer_pins" ADD CONSTRAINT "user_transfer_pins_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "transfer_step_up_challenges" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "consumed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "transfer_step_up_challenges_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "transfer_step_up_challenges_user_id_expires_at_idx" ON "transfer_step_up_challenges"("user_id", "expires_at");
ALTER TABLE "transfer_step_up_challenges" ADD CONSTRAINT "transfer_step_up_challenges_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coin_transfers" (
    "id" TEXT NOT NULL,
    "sender_user_id" TEXT NOT NULL,
    "recipient_user_id" TEXT NOT NULL,
    "gross_coins" DECIMAL(12,2) NOT NULL,
    "fee_coins" DECIMAL(12,2) NOT NULL,
    "net_coins" DECIMAL(12,2) NOT NULL,
    "fee_bps" INTEGER NOT NULL,
    "status" "CoinTransferStatus" NOT NULL DEFAULT 'PENDING',
    "gift_message" VARCHAR(500),
    "scheduled_at" TIMESTAMP(3),
    "pending_until" TIMESTAMP(3),
    "idempotency_key" TEXT,
    "sender_country_id" TEXT NOT NULL,
    "recipient_country_id" TEXT NOT NULL,
    "client_ip" VARCHAR(64),
    "device_id" VARCHAR(128),
    "completed_at" TIMESTAMP(3),
    "cancelled_at" TIMESTAMP(3),
    "failed_reason" VARCHAR(500),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "coin_transfers_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coin_transfers_idempotency_key_key" ON "coin_transfers"("idempotency_key");
CREATE INDEX "coin_transfers_sender_user_id_created_at_idx" ON "coin_transfers"("sender_user_id", "created_at");
CREATE INDEX "coin_transfers_recipient_user_id_created_at_idx" ON "coin_transfers"("recipient_user_id", "created_at");
CREATE INDEX "coin_transfers_status_pending_until_idx" ON "coin_transfers"("status", "pending_until");
CREATE INDEX "coin_transfers_status_scheduled_at_idx" ON "coin_transfers"("status", "scheduled_at");

ALTER TABLE "coin_transfers" ADD CONSTRAINT "coin_transfers_sender_user_id_fkey" FOREIGN KEY ("sender_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "coin_transfers" ADD CONSTRAINT "coin_transfers_recipient_user_id_fkey" FOREIGN KEY ("recipient_user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "coin_transfer_reports" (
    "id" TEXT NOT NULL,
    "transfer_id" TEXT NOT NULL,
    "reporter_user_id" TEXT NOT NULL,
    "note" VARCHAR(1000),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "coin_transfer_reports_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "coin_transfer_reports_transfer_id_idx" ON "coin_transfer_reports"("transfer_id");
CREATE INDEX "coin_transfer_reports_reporter_user_id_created_at_idx" ON "coin_transfer_reports"("reporter_user_id", "created_at");
ALTER TABLE "coin_transfer_reports" ADD CONSTRAINT "coin_transfer_reports_transfer_id_fkey" FOREIGN KEY ("transfer_id") REFERENCES "coin_transfers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

INSERT INTO "system_configs" ("id", "key", "value", "category", "description", "updated_by", "updated_at")
VALUES
  ('coin_cfg_p2p_enabled', 'p2p_transfers_enabled', 'true', 'coins', 'Kill switch: set false to block all coin P2P transfers', NULL, CURRENT_TIMESTAMP),
  ('coin_cfg_min_tx', 'minimum_transfert', '25', 'coins', 'Minimum gross coins per P2P transfer', NULL, CURRENT_TIMESTAMP),
  ('coin_cfg_large_th', 'large_transfer_threshold_coins', '1000', 'coins', 'Above this gross amount, use long pending delay', NULL, CURRENT_TIMESTAMP),
  ('coin_cfg_small_del', 'small_transfer_delay_minutes', '2', 'coins', 'Pending delay for transfers at or below threshold', NULL, CURRENT_TIMESTAMP),
  ('coin_cfg_large_min', 'large_transfer_delay_min_minutes', '10', 'coins', 'Min minutes pending for large transfers', NULL, CURRENT_TIMESTAMP),
  ('coin_cfg_large_max', 'large_transfer_delay_max_minutes', '20', 'coins', 'Max minutes pending for large transfers', NULL, CURRENT_TIMESTAMP)
ON CONFLICT ("key") DO NOTHING;
