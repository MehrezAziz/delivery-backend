-- Urgent auto-approve policy: remove unused "period" fields (recurring schedules are a separate model).
ALTER TABLE "delivery_company_department_budget_policies" DROP COLUMN IF EXISTS "period_type";
ALTER TABLE "delivery_company_department_budget_policies" DROP COLUMN IF EXISTS "interval_days";

DROP TYPE IF EXISTS "DeliveryCompanyBudgetPeriodType";

-- Recurring automatic transfers to department budget wallets (configured by main company).
CREATE TYPE "DeliveryCompanyScheduledBudgetCadence" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY');

CREATE TABLE "delivery_company_scheduled_budget_transfers" (
    "id" TEXT NOT NULL,
    "delivery_company_id" TEXT NOT NULL,
    "department_account_id" TEXT NOT NULL,
    "amount_coins" DECIMAL(12,2) NOT NULL,
    "cadence" "DeliveryCompanyScheduledBudgetCadence" NOT NULL,
    "next_run_at" TIMESTAMP(3) NOT NULL,
    "last_run_at" TIMESTAMP(3),
    "reminder_for_next_run_at" TIMESTAMP(3),
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "delivery_company_scheduled_budget_transfers_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "delivery_company_scheduled_budget_transfers_active_next_run_idx"
  ON "delivery_company_scheduled_budget_transfers"("is_active", "next_run_at");

CREATE INDEX "delivery_company_scheduled_budget_transfers_company_active_idx"
  ON "delivery_company_scheduled_budget_transfers"("delivery_company_id", "is_active");

ALTER TABLE "delivery_company_scheduled_budget_transfers"
  ADD CONSTRAINT "delivery_company_scheduled_budget_transfers_company_fkey"
  FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "delivery_company_scheduled_budget_transfers"
  ADD CONSTRAINT "delivery_company_scheduled_budget_transfers_dept_account_fkey"
  FOREIGN KEY ("department_account_id") REFERENCES "delivery_company_department_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
