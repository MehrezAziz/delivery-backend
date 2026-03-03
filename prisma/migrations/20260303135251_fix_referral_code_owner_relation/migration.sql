/*
  Warnings:

  - You are about to drop the column `my_referral_code_id` on the `customers` table. All the data in the column will be lost.

*/
-- DropForeignKey
ALTER TABLE "customers" DROP CONSTRAINT "customers_my_referral_code_id_fkey";

-- DropIndex
DROP INDEX "customers_my_referral_code_id_key";

-- AlterTable
ALTER TABLE "customers" DROP COLUMN "my_referral_code_id";

-- AddForeignKey
ALTER TABLE "referral_codes" ADD CONSTRAINT "referral_codes_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
