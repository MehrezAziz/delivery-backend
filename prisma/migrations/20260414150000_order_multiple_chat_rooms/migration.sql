-- Drop old uniqueness: one chat room per order
DROP INDEX IF EXISTS "chat_rooms_order_id_key";

-- Add index for fast lookup of active/latest room per order
CREATE INDEX IF NOT EXISTS "chat_rooms_order_id_status_created_at_idx"
ON "chat_rooms"("order_id", "status", "created_at");
