-- AlterEnum NotificationType
ALTER TYPE "NotificationType" ADD VALUE 'NEW_ORDER_FOR_CUSTOMER_SERVICE';
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOMER_REJECTED_ARRIVED_DRIVER_CS';
ALTER TYPE "NotificationType" ADD VALUE 'CUSTOMER_REJECTED_ARRIVED_DRIVER_TO_DRIVER';

-- CreateEnum
CREATE TYPE "OrderDriverArrivalConflictStatus" AS ENUM ('PENDING', 'RESOLVED_FORGIVE', 'RESOLVED_SUSPEND_CUSTOMER', 'RESOLVED_SUSPEND_DRIVER');

-- AlterTable Customer
ALTER TABLE "customers" ADD COLUMN "terms_accepted_at" TIMESTAMP(3);

-- AlterTable Address
ALTER TABLE "addresses" ADD COLUMN "nickname" TEXT;

-- AlterTable Order
ALTER TABLE "orders" ADD COLUMN "local_pickup_only" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "orders" ADD COLUMN "urgent_notify_waves_sent" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "orders" ADD COLUMN "urgent_notify_cycle_started_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "urgent_notify_last_button_at" TIMESTAMP(3);
ALTER TABLE "orders" ADD COLUMN "urgent_notify_cycle_id" TEXT;

-- CreateTable
CREATE TABLE "customer_service_governorates" (
    "id" TEXT NOT NULL,
    "customer_service_id" TEXT NOT NULL,
    "governorate_id" TEXT NOT NULL,

    CONSTRAINT "customer_service_governorates_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "customer_service_governorates_customer_service_id_governorate_id_key" ON "customer_service_governorates"("customer_service_id", "governorate_id");

ALTER TABLE "customer_service_governorates" ADD CONSTRAINT "customer_service_governorates_customer_service_id_fkey" FOREIGN KEY ("customer_service_id") REFERENCES "customer_services"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "customer_service_governorates" ADD CONSTRAINT "customer_service_governorates_governorate_id_fkey" FOREIGN KEY ("governorate_id") REFERENCES "governorates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "order_urgent_notify_targets" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "cycle_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "wave_index" INTEGER NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_urgent_notify_targets_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_urgent_notify_targets_order_id_cycle_id_driver_id_key" ON "order_urgent_notify_targets"("order_id", "cycle_id", "driver_id");
CREATE INDEX "order_urgent_notify_targets_order_id_cycle_id_idx" ON "order_urgent_notify_targets"("order_id", "cycle_id");

ALTER TABLE "order_urgent_notify_targets" ADD CONSTRAINT "order_urgent_notify_targets_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_urgent_notify_targets" ADD CONSTRAINT "order_urgent_notify_targets_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "order_driver_arrival_conflicts" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "customer_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "customer_reason" TEXT NOT NULL,
    "driver_feedback" TEXT,
    "status" "OrderDriverArrivalConflictStatus" NOT NULL DEFAULT 'PENDING',
    "resolved_by_super_user_id" TEXT,
    "resolved_at" TIMESTAMP(3),
    "resolution_note" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_driver_arrival_conflicts_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "order_driver_arrival_conflicts_order_id_key" ON "order_driver_arrival_conflicts"("order_id");
CREATE INDEX "order_driver_arrival_conflicts_status_created_at_idx" ON "order_driver_arrival_conflicts"("status", "created_at");

ALTER TABLE "order_driver_arrival_conflicts" ADD CONSTRAINT "order_driver_arrival_conflicts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_driver_arrival_conflicts" ADD CONSTRAINT "order_driver_arrival_conflicts_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "order_driver_arrival_conflicts" ADD CONSTRAINT "order_driver_arrival_conflicts_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
