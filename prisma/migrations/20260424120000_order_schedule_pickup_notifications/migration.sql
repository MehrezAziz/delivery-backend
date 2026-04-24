ALTER TABLE "orders"
ADD COLUMN "publish_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "pickup_at" TIMESTAMP(3),
ADD COLUMN "pickup_original_at" TIMESTAMP(3),
ADD COLUMN "pickup_reminder_at" TIMESTAMP(3),
ADD COLUMN "driver_pickup_reminder_sent_at" TIMESTAMP(3),
ADD COLUMN "driver_pickup_persistent_sent_at" TIMESTAMP(3),
ADD COLUMN "driver_pickup_persistent_ignored_at" TIMESTAMP(3),
ADD COLUMN "driver_arrived_once" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX "orders_publish_at_status_idx" ON "orders"("publish_at", "status");
CREATE INDEX "orders_pickup_at_status_idx" ON "orders"("pickup_at", "status");
