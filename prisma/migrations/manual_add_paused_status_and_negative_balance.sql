-- Add PAUSED to DriverStatus enum
ALTER TYPE "DriverStatus" ADD VALUE IF NOT EXISTS 'PAUSED';

-- Add negative_balance_since column to driver_accounts
ALTER TABLE "driver_accounts" ADD COLUMN IF NOT EXISTS "negative_balance_since" TIMESTAMP;
