-- Bank payout details on withdrawal requests + optional saved profile per user

CREATE TABLE IF NOT EXISTS "user_payout_bank_details" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "account_holder_name" TEXT NOT NULL,
    "bank_name" TEXT NOT NULL,
    "account_reference" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "user_payout_bank_details_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "user_payout_bank_details_user_id_key" ON "user_payout_bank_details"("user_id");

ALTER TABLE "user_payout_bank_details" ADD CONSTRAINT "user_payout_bank_details_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_bank_holder_name" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_bank_name" TEXT;
ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_bank_account_ref" TEXT;

ALTER TABLE "driver_withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_bank_holder_name" TEXT;
ALTER TABLE "driver_withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_bank_name" TEXT;
ALTER TABLE "driver_withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_bank_account_ref" TEXT;
