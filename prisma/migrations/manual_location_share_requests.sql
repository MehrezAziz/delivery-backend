-- Manual migration: peer location share (run if `prisma db push` fails on unrelated schema drift)
-- psql -U postgres -d delivery_platform -f prisma/migrations/manual_location_share_requests.sql

DO $$ BEGIN
  CREATE TYPE "LocationShareStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'EXPIRED', 'CANCELLED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "LocationShareSlot" AS ENUM ('PICKUP', 'DROPOFF');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOCATION_SHARE_REQUEST';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOCATION_SHARE_FULFILLED';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'LOCATION_SHARE_DECLINED';

CREATE TABLE IF NOT EXISTS "location_share_requests" (
  "id" TEXT NOT NULL,
  "requester_id" TEXT NOT NULL,
  "target_user_id" TEXT NOT NULL,
  "slot" "LocationShareSlot" NOT NULL,
  "status" "LocationShareStatus" NOT NULL DEFAULT 'PENDING',
  "client_request_id" TEXT,
  "result_address_id" TEXT,
  "result_lat" DOUBLE PRECISION,
  "result_lng" DOUBLE PRECISION,
  "accepted_at" TIMESTAMP(3),
  "declined_at" TIMESTAMP(3),
  "expires_at" TIMESTAMP(3) NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "location_share_requests_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "location_share_requests_target_user_id_status_idx"
  ON "location_share_requests"("target_user_id", "status");
CREATE INDEX IF NOT EXISTS "location_share_requests_requester_id_status_idx"
  ON "location_share_requests"("requester_id", "status");

DO $$ BEGIN
  ALTER TABLE "location_share_requests"
    ADD CONSTRAINT "location_share_requests_requester_id_fkey"
    FOREIGN KEY ("requester_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "location_share_requests"
    ADD CONSTRAINT "location_share_requests_target_user_id_fkey"
    FOREIGN KEY ("target_user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "location_share_requests"
    ADD CONSTRAINT "location_share_requests_result_address_id_fkey"
    FOREIGN KEY ("result_address_id") REFERENCES "addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
