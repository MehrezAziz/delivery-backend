-- AlterTable: nullable column only — existing countries keep NULL until backfilled via admin/API.
ALTER TABLE "countries" ADD COLUMN IF NOT EXISTS "language" TEXT;
