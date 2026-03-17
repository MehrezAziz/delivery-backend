-- DropIndex
DROP INDEX "driver_verifications_driver_id_key";

-- CreateIndex
CREATE INDEX "driver_verifications_driver_id_idx" ON "driver_verifications"("driver_id");
