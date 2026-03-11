-- Constraint: phone can be null ONLY IF google_email exists, and vice versa
ALTER TABLE "users"
  ADD CONSTRAINT "user_phone_or_google_email_required"
  CHECK (
    ("phone" IS NOT NULL) OR ("google_email" IS NOT NULL)
  );