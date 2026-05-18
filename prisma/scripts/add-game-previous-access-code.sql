-- Adds previous_access_code_plain so admins can still view the prior code after rotation.
ALTER TABLE "games" ADD COLUMN IF NOT EXISTS "previous_access_code_plain" TEXT;
