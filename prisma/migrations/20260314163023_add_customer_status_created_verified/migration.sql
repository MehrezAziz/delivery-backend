-- AlterEnum: Add new values to CustomerStatus
-- Must be done outside a transaction so the values are committed before use.
ALTER TYPE "CustomerStatus" ADD VALUE IF NOT EXISTS 'CREATED';
ALTER TYPE "CustomerStatus" ADD VALUE IF NOT EXISTS 'VERIFIED';
