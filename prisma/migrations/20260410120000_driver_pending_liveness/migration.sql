-- AlterTable
ALTER TABLE "drivers" ADD COLUMN     "pending_liveness_session" JSONB,
ADD COLUMN     "pending_verification_selfie_url" TEXT,
ADD COLUMN     "pending_liveness_expires_at" TIMESTAMP(3);
