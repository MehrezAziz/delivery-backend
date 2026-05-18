-- Adds ends_at so admins can schedule when a game stops accepting participation.
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "ends_at" TIMESTAMP(3);
