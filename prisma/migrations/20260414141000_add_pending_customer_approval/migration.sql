-- Add missing enum label used by later migrations.
-- Needed so Prisma shadow database can apply migrations safely.
ALTER TYPE "OrderStatus"
  ADD VALUE IF NOT EXISTS 'PENDING_CUSTOMER_APPROVAL'
  AFTER 'SEARCHING_DRIVER';

