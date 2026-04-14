-- Migration: Change SupportTicket from customer_id -> user_id (FK to users table)
-- And create SupportMessage table
-- This migration preserves existing data.

-- Step 1: Add new user_id column (nullable initially)
ALTER TABLE "support_tickets" ADD COLUMN "user_id" TEXT;

-- Step 2: Populate user_id from the customers table (customer_id -> customers.user_id)
UPDATE "support_tickets" st
SET "user_id" = c."user_id"
FROM "customers" c
WHERE st."customer_id" = c."id";

-- Step 3: Make user_id NOT NULL (all rows should now have a value)
ALTER TABLE "support_tickets" ALTER COLUMN "user_id" SET NOT NULL;

-- Step 4: Drop the old foreign key constraint on customer_id
ALTER TABLE "support_tickets" DROP CONSTRAINT IF EXISTS "support_tickets_customer_id_fkey";

-- Step 5: Drop the old customer_id column
ALTER TABLE "support_tickets" DROP COLUMN "customer_id";

-- Step 6: Add foreign key constraint for user_id -> users.id
ALTER TABLE "support_tickets" ADD CONSTRAINT "support_tickets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Step 7: Add index on user_id
CREATE INDEX "support_tickets_user_id_idx" ON "support_tickets"("user_id");

-- Step 8: Create support_messages table
CREATE TABLE "support_messages" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "sender_id" TEXT NOT NULL,
    "sender_type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "image" TEXT,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "read_at" TIMESTAMP(3),

    CONSTRAINT "support_messages_pkey" PRIMARY KEY ("id")
);

-- Step 9: Add foreign key for support_messages -> support_tickets
ALTER TABLE "support_messages" ADD CONSTRAINT "support_messages_ticket_id_fkey" FOREIGN KEY ("ticket_id") REFERENCES "support_tickets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Step 10: Add index on support_messages
CREATE INDEX "support_messages_ticket_id_timestamp_idx" ON "support_messages"("ticket_id", "timestamp");
