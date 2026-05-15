-- Coin top-up sessions (Flouci) + reference type for wallet / driver ledger

CREATE TYPE "CoinTopupSessionStatus" AS ENUM ('PENDING', 'COMPLETED', 'FAILED');

CREATE TYPE "CoinTopupPayerRole" AS ENUM ('CUSTOMER', 'DRIVER');

ALTER TYPE "ReferenceType" ADD VALUE 'FLOUCI_TOPUP';

CREATE TABLE "coin_topup_sessions" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "payer_role" "CoinTopupPayerRole" NOT NULL,
    "country_id" TEXT NOT NULL,
    "coins_amount" DECIMAL(12,4) NOT NULL,
    "fiat_amount" DECIMAL(14,6) NOT NULL,
    "fiat_currency_code" TEXT NOT NULL,
    "amount_millimes" INTEGER NOT NULL,
    "coins_per_fiat_unit" DECIMAL(12,4) NOT NULL,
    "developer_tracking_id" TEXT NOT NULL,
    "flouci_payment_id" TEXT,
    "status" "CoinTopupSessionStatus" NOT NULL DEFAULT 'PENDING',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completed_at" TIMESTAMP(3),

    CONSTRAINT "coin_topup_sessions_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "coin_topup_sessions_developer_tracking_id_key" ON "coin_topup_sessions"("developer_tracking_id");

CREATE UNIQUE INDEX "coin_topup_sessions_flouci_payment_id_key" ON "coin_topup_sessions"("flouci_payment_id");

CREATE INDEX "coin_topup_sessions_user_id_status_created_at_idx" ON "coin_topup_sessions"("user_id", "status", "created_at");

ALTER TABLE "coin_topup_sessions" ADD CONSTRAINT "coin_topup_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
