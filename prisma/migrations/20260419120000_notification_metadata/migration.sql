-- Persist inbox-only flags (e.g. driver must not navigate to order detail after pre-arrival removal).
ALTER TABLE "notifications" ADD COLUMN IF NOT EXISTS "notification_metadata" JSONB;
