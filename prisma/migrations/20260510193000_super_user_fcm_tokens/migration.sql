-- Optional FCM for admin/CS mobile apps; web dashboard uses WebSocket + browser notifications.
ALTER TABLE "super_users" ADD COLUMN IF NOT EXISTS "fcm_token" TEXT;
ALTER TABLE "super_users" ADD COLUMN IF NOT EXISTS "fcm_platform" TEXT;
