-- Link main company departments to a delegation (governorate scope for CS finance).
-- Must be TEXT to match `delegations.id` (see init migration), not UUID.

-- Recover from a failed attempt that may have created `delegation_id` as the wrong type
ALTER TABLE "delivery_company_addresses" DROP COLUMN IF EXISTS "delegation_id";

ALTER TABLE "delivery_company_addresses" ADD COLUMN "delegation_id" TEXT;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'delivery_company_addresses_delegation_id_fkey'
  ) THEN
    ALTER TABLE "delivery_company_addresses"
      ADD CONSTRAINT "delivery_company_addresses_delegation_id_fkey"
      FOREIGN KEY ("delegation_id") REFERENCES "delegations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "delivery_company_addresses_delegation_id_idx" ON "delivery_company_addresses"("delegation_id");
