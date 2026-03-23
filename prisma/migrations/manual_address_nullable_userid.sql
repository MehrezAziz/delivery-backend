-- Manual migration: Make user_id nullable in addresses table
-- This allows order pickup/dropoff addresses to exist without being linked to a user

-- Step 1: Drop the existing foreign key constraint
ALTER TABLE "addresses" DROP CONSTRAINT IF EXISTS "addresses_user_id_fkey";

-- Step 2: Make user_id nullable
ALTER TABLE "addresses" ALTER COLUMN "user_id" DROP NOT NULL;

-- Step 3: Re-add the foreign key constraint (now allowing NULL)
ALTER TABLE "addresses" ADD CONSTRAINT "addresses_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
