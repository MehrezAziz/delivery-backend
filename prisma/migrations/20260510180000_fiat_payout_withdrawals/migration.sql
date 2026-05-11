-- Fiat payout method + driver withdrawal queue + customer withdrawal payout channel + CS role

CREATE TYPE "FiatPayoutMethod" AS ENUM ('CASH', 'BANK_TRANSFER');

ALTER TYPE "CustomerServiceRole" ADD VALUE IF NOT EXISTS 'PROCESS_WITHDRAWALS';

ALTER TABLE "withdrawal_requests" ADD COLUMN IF NOT EXISTS "payout_method" "FiatPayoutMethod" NOT NULL DEFAULT 'BANK_TRANSFER';

CREATE TABLE "driver_withdrawal_requests" (
    "id" TEXT NOT NULL,
    "driver_account_id" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "status" "ResponseType" NOT NULL DEFAULT 'PENDING',
    "payout_method" "FiatPayoutMethod" NOT NULL DEFAULT 'BANK_TRANSFER',
    "description_from_driver" TEXT,
    "description_from_staff" TEXT,
    "requested_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "processed_at" TIMESTAMP(3),

    CONSTRAINT "driver_withdrawal_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "driver_withdrawal_requests_driver_account_id_requested_at_idx" ON "driver_withdrawal_requests"("driver_account_id", "requested_at");

ALTER TABLE "driver_withdrawal_requests" ADD CONSTRAINT "driver_withdrawal_requests_driver_account_id_fkey" FOREIGN KEY ("driver_account_id") REFERENCES "driver_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
