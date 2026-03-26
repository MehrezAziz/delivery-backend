-- Create login_attempts table for security audit logging
CREATE TABLE IF NOT EXISTS "login_attempts" (
  "id" TEXT NOT NULL DEFAULT gen_random_uuid(),
  "identifier" TEXT NOT NULL,
  "login_type" TEXT NOT NULL,
  "ip_address" TEXT,
  "user_agent" TEXT,
  "success" BOOLEAN NOT NULL,
  "fail_reason" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "login_attempts_identifier_created_at_idx" ON "login_attempts"("identifier", "created_at");
CREATE INDEX IF NOT EXISTS "login_attempts_created_at_idx" ON "login_attempts"("created_at");
