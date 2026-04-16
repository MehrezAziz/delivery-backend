-- Delivery company onboarding/auth + audit logs
ALTER TABLE "delivery_companies"
  ADD COLUMN "contact_email" TEXT,
  ADD COLUMN "password_hash" TEXT,
  ADD COLUMN "onboarding_completed" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "default_refund_destination_type" "DeliveryCompanyRefundDestinationType";

CREATE UNIQUE INDEX "delivery_companies_contact_email_key"
  ON "delivery_companies"("contact_email");

CREATE TABLE "delivery_company_audit_logs" (
  "id" TEXT NOT NULL,
  "delivery_company_id" TEXT NOT NULL,
  "action_type" TEXT NOT NULL,
  "actor_type" TEXT NOT NULL,
  "actor_ref" TEXT,
  "details" JSONB,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_company_audit_logs_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_company_audit_logs_delivery_company_id_created_at_idx"
  ON "delivery_company_audit_logs"("delivery_company_id", "created_at");
CREATE INDEX "delivery_company_audit_logs_action_type_created_at_idx"
  ON "delivery_company_audit_logs"("action_type", "created_at");

ALTER TABLE "delivery_company_audit_logs"
  ADD CONSTRAINT "delivery_company_audit_logs_delivery_company_id_fkey"
  FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
