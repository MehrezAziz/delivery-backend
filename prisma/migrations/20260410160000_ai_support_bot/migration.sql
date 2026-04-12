-- AlterTable
ALTER TABLE "support_tickets" ADD COLUMN "human_escalation_notified_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "support_messages" ADD COLUMN "metadata" JSONB;

-- AlterEnum
ALTER TYPE "NotificationType" ADD VALUE 'SUPPORT_HUMAN_REQUESTED';
