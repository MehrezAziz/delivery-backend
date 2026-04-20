-- AlterTable
ALTER TABLE "delivery_company_department_accounts" ADD COLUMN IF NOT EXISTS "portal_presence_path" TEXT;
ALTER TABLE "delivery_company_department_accounts" ADD COLUMN IF NOT EXISTS "portal_presence_at" TIMESTAMP(3);
