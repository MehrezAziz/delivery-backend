-- Optional verification document for Settings → Security (customer & driver)
ALTER TABLE "users" ADD COLUMN "security_verification_document" TEXT;
ALTER TABLE "users" ADD COLUMN "security_verification_submitted_at" TIMESTAMP(3);
