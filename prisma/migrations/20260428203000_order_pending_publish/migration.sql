-- AlterEnum: scheduled visibility for customer orders
ALTER TYPE "OrderStatus" ADD VALUE 'PENDING_PUBLISH';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN "scheduled_publish_at" TIMESTAMP(3);
