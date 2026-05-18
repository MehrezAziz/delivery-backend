-- Store the current 6-digit code in plain so admins can see it anytime in the dashboard.
-- Only readable by admin endpoints. Apply once.
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "access_code_plain" TEXT;
