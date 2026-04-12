-- CreateTable
CREATE TABLE "ai_support_tool_logs" (
    "id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "tool_name" TEXT NOT NULL,
    "duration_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error_code" TEXT,
    "model" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_support_tool_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ai_support_feedback" (
    "id" TEXT NOT NULL,
    "message_id" TEXT NOT NULL,
    "ticket_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "helpful" BOOLEAN NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ai_support_feedback_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ai_support_tool_logs_ticket_id_created_at_idx" ON "ai_support_tool_logs"("ticket_id", "created_at");

-- CreateIndex
CREATE INDEX "ai_support_tool_logs_created_at_idx" ON "ai_support_tool_logs"("created_at");

-- CreateIndex
CREATE UNIQUE INDEX "ai_support_feedback_message_id_key" ON "ai_support_feedback"("message_id");

-- CreateIndex
CREATE INDEX "ai_support_feedback_ticket_id_idx" ON "ai_support_feedback"("ticket_id");
