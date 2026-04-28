-- Hotfix for branch drift: ensure AUTO_CANCELLED exists in OrderStatus enum.
ALTER TYPE "OrderStatus" ADD VALUE IF NOT EXISTS 'AUTO_CANCELLED';
