-- Withdrawal fee: flat coins → percentage (basis points, same as P2P fee)
ALTER TABLE "country_coin_configs" DROP COLUMN IF EXISTS "withdrawal_fee";
ALTER TABLE "country_coin_configs" ADD COLUMN IF NOT EXISTS "withdrawal_fee_bps" INTEGER NOT NULL DEFAULT 0;
