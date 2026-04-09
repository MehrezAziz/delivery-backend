-- Idempotent repair for failed migration 20260317155621_driver_verification_one_to_many
-- (unique driver_id -> non-unique index for one-to-many verifications per driver)

DROP INDEX IF EXISTS "driver_verifications_driver_id_key";

CREATE INDEX IF NOT EXISTS "driver_verifications_driver_id_idx" ON "driver_verifications"("driver_id");
