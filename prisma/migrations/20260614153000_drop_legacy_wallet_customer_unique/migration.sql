-- Fix: init schema created customer_id uniqueness as an INDEX, not a CONSTRAINT.
-- The multi-country migration used DROP CONSTRAINT and left the legacy index in place.

DROP INDEX IF EXISTS "digital_wallets_customer_id_key";
