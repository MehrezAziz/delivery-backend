-- CreateEnum
CREATE TYPE "DeliveryZoneType" AS ENUM ('SAME_DELEGATION', 'SAME_GOVERNORATE', 'DIFFERENT_GOVERNORATE', 'DIFFERENT_COUNTRY');

-- AlterTable
ALTER TABLE "country_pricing_policies" ADD COLUMN     "delivery_zone_type" "DeliveryZoneType";
