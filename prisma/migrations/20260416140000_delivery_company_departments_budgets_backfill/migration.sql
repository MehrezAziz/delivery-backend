-- CreateEnum
CREATE TYPE "DeliveryCompanyBudgetPeriodType" AS ENUM ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM_INTERVAL');

-- CreateEnum
CREATE TYPE "DeliveryCompanyBudgetRequestPriority" AS ENUM ('NORMAL', 'URGENT');

-- CreateEnum
CREATE TYPE "DeliveryCompanyBudgetRequestStatus" AS ENUM ('PENDING', 'AUTO_APPROVED', 'APPROVED', 'REJECTED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "DeliveryCompanyDepartmentAccountRole" AS ENUM ('MAIN_ADMIN', 'DEPT_ADMIN', 'DEPT_OPERATOR', 'DEPT_VIEWER');

-- CreateEnum
CREATE TYPE "DeliveryCompanyDepartmentAccountStatus" AS ENUM ('ACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "NotificationChannel" AS ENUM ('PUSH', 'IN_APP', 'EMAIL', 'SMS', 'WEB_SOCKET');

-- CreateEnum
CREATE TYPE "NotificationPriority" AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL');

-- AlterEnum
ALTER TYPE "CustomerServiceRole" ADD VALUE 'MANAGE_FINANCIAL_REPORTS';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DeliveryCompanyTransactionType" ADD VALUE 'DEPARTMENT_BUDGET_ALLOC';
ALTER TYPE "DeliveryCompanyTransactionType" ADD VALUE 'DEPARTMENT_BUDGET_RETURN';

-- AlterEnum
ALTER TYPE "DriverStatus" ADD VALUE 'PAUSED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "DriverTransactionType" ADD VALUE 'DEPOSIT';
ALTER TYPE "DriverTransactionType" ADD VALUE 'DISPUTE_DEBIT';

-- AlterEnum
BEGIN;
CREATE TYPE "NotificationType_new" AS ENUM ('ORDER_CREATED', 'DRIVER_ASSIGNED', 'DRIVER_ARRIVED', 'PACKAGE_PICKED_UP', 'DELIVERY_IN_PROGRESS', 'ORDER_DELIVERED', 'ORDER_CANCELLED', 'NO_DRIVER_FOUND', 'WALLET_TOPUP_SUCCESS', 'WALLET_TOPUP_FAILED', 'LOW_WALLET_BALANCE', 'ORDER_PAYMENT_DEDUCTED', 'REFUND_PROCESSED', 'WITHDRAWAL_STATUS', 'REFERRAL_BONUS', 'REFERRED_FRIEND_REGISTERED', 'ACCOUNT_CREATED', 'ACCOUNT_SUSPENDED', 'ACCOUNT_REACTIVATED', 'DISPUTE_OPENED', 'DISPUTE_RESOLVED', 'SUPPORT_TICKET_REPLY', 'NEW_MESSAGE_FROM_DRIVER', 'NEW_ORDER_AVAILABLE', 'ORDER_EXPIRED', 'ORDER_CANCELLED_BY_CUSTOMER', 'PICKUP_REMINDER', 'DOCUMENTS_SUBMITTED', 'VERIFICATION_APPROVED', 'VERIFICATION_REJECTED', 'DRIVER_ACCOUNT_SUSPENDED', 'PAYMENT_RECEIVED_COD', 'PAYMENT_CREDITED_WALLET', 'NEGATIVE_BALANCE_WARNING', 'ACCOUNT_BLOCKED_DEBT', 'WITHDRAWAL_PROCESSED', 'CUSTOMER_RATED_YOU', 'PERFORMANCE_MILESTONE', 'NEW_MESSAGE_FROM_CUSTOMER', 'NEW_DRIVER_REGISTRATION', 'DRIVER_DOCUMENTS_SUBMITTED', 'DRIVER_PERFORMANCE_ALERT', 'DRIVER_DEBT_THRESHOLD', 'ORDER_STUCK_NO_DRIVER', 'HIGH_VALUE_ORDER', 'ORDER_CANCELLED_AFTER_ASSIGNMENT', 'NEW_DISPUTE_CREATED', 'DISPUTE_ESCALATED', 'LARGE_WITHDRAWAL_REQUEST', 'PAYMENT_GATEWAY_FAILURE', 'DAILY_REVENUE_REPORT', 'SERVER_ERROR_SPIKE', 'DATABASE_PERFORMANCE_ALERT', 'SUSPICIOUS_ACTIVITY', 'BULK_REGISTRATION_DETECTED', 'NEW_SUPPORT_TICKET', 'TICKET_ASSIGNED', 'CUSTOMER_REPLIED_TICKET', 'URGENT_TICKET_UNRESOLVED', 'DISPUTE_ASSIGNED', 'DISPUTE_REQUIRES_DECISION', 'DELAYED_ORDER_ALERT', 'SUPPORT_HUMAN_REQUESTED', 'NEW_ORDER_FOR_CUSTOMER_SERVICE', 'CUSTOMER_REJECTED_ARRIVED_DRIVER_CS', 'CUSTOMER_REJECTED_ARRIVED_DRIVER_TO_DRIVER', 'ARRIVAL_CONFLICT_DRIVER_FEEDBACK_CS');
ALTER TABLE "notifications" ALTER COLUMN "type" TYPE "NotificationType_new" USING ("type"::text::"NotificationType_new");
ALTER TYPE "NotificationType" RENAME TO "NotificationType_old";
ALTER TYPE "NotificationType_new" RENAME TO "NotificationType";
DROP TYPE "NotificationType_old";
COMMIT;

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notification_super_user_fk";

-- DropForeignKey
ALTER TABLE "notifications" DROP CONSTRAINT "notifications_user_id_fkey";

-- AlterTable
ALTER TABLE "addresses" ALTER COLUMN "user_id" DROP NOT NULL;

-- AlterTable
ALTER TABLE "delivery_companies" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "delivery_company_addresses" ADD COLUMN     "is_main_department" BOOLEAN NOT NULL DEFAULT false,
ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "delivery_company_api_keys" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "delivery_company_bank_accounts" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "delivery_company_refund_requests" ALTER COLUMN "updated_at" DROP DEFAULT;

-- AlterTable
ALTER TABLE "documents" ADD COLUMN     "ml_analysis" JSONB;

-- AlterTable
ALTER TABLE "driver_accounts" ADD COLUMN     "negative_balance_since" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "notifications" ADD COLUMN     "action_buttons" JSONB,
ADD COLUMN     "channels" "NotificationChannel"[],
ADD COLUMN     "expires_at" TIMESTAMP(3),
ADD COLUMN     "failure_reason" TEXT,
ADD COLUMN     "group_key" TEXT,
ADD COLUMN     "priority" "NotificationPriority" NOT NULL DEFAULT 'MEDIUM';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivery_company_department_id" TEXT,
ADD COLUMN     "tracking_expires_at" TIMESTAMP(3),
ADD COLUMN     "tracking_token" TEXT;

-- AlterTable
ALTER TABLE "referral_commissions" ALTER COLUMN "status" SET DEFAULT 'PAID';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "fcm_platform" TEXT,
ADD COLUMN     "fcm_token" TEXT;

-- CreateTable
CREATE TABLE "delivery_company_department_accounts" (
    "id" TEXT NOT NULL,
    "delivery_company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "role" "DeliveryCompanyDepartmentAccountRole" NOT NULL,
    "status" "DeliveryCompanyDepartmentAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "last_login_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_company_department_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_company_department_budget_policies" (
    "id" TEXT NOT NULL,
    "delivery_company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "period_type" "DeliveryCompanyBudgetPeriodType" NOT NULL,
    "interval_days" INTEGER,
    "max_auto_approve_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "min_hours_between_req" INTEGER NOT NULL DEFAULT 0,
    "is_auto_approve_enabled" BOOLEAN NOT NULL DEFAULT false,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_company_department_budget_policies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_company_department_budget_requests" (
    "id" TEXT NOT NULL,
    "delivery_company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "requested_by_account_id" TEXT,
    "amount_coins" DECIMAL(12,2) NOT NULL,
    "priority" "DeliveryCompanyBudgetRequestPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "DeliveryCompanyBudgetRequestStatus" NOT NULL DEFAULT 'PENDING',
    "decision_note" TEXT,
    "decided_by" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_company_department_budget_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_company_department_budget_wallets" (
    "id" TEXT NOT NULL,
    "delivery_company_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "available_coins" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "locked_coins" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "delivery_company_department_budget_wallets_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "delivery_company_idempotency_keys" (
    "id" TEXT NOT NULL,
    "delivery_company_id" TEXT NOT NULL,
    "actor_ref" TEXT,
    "endpoint_key" TEXT NOT NULL,
    "idempotency_key" TEXT NOT NULL,
    "request_hash" TEXT NOT NULL,
    "response_status" INTEGER NOT NULL,
    "response_body" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expires_at" TIMESTAMP(3),

    CONSTRAINT "delivery_company_idempotency_keys_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "login_attempts" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "login_type" TEXT NOT NULL,
    "ip_address" TEXT,
    "user_agent" TEXT,
    "success" BOOLEAN NOT NULL,
    "fail_reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "login_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_driver_rejections" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "order_driver_rejections_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_company_department_accounts_delivery_company_id_em_key" ON "delivery_company_department_accounts"("delivery_company_id" ASC, "email" ASC);

-- CreateIndex
CREATE INDEX "delivery_company_department_accounts_department_id_status_idx" ON "delivery_company_department_accounts"("department_id" ASC, "status" ASC);

-- CreateIndex
CREATE INDEX "delivery_company_department_budget_policies_delivery_compan_idx" ON "delivery_company_department_budget_policies"("delivery_company_id" ASC, "is_active" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_company_department_budget_policies_department_id_key" ON "delivery_company_department_budget_policies"("department_id" ASC);

-- CreateIndex
CREATE INDEX "delivery_company_department_budget_requests_delivery_compan_idx" ON "delivery_company_department_budget_requests"("delivery_company_id" ASC, "status" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "delivery_company_department_budget_requests_department_id_s_idx" ON "delivery_company_department_budget_requests"("department_id" ASC, "status" ASC, "created_at" ASC);

-- CreateIndex
CREATE INDEX "delivery_company_department_budget_wallets_delivery_company_idx" ON "delivery_company_department_budget_wallets"("delivery_company_id" ASC, "period_end" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_company_department_budget_wallets_department_id_key" ON "delivery_company_department_budget_wallets"("department_id" ASC);

-- CreateIndex
CREATE INDEX "delivery_company_idempotency_keys_delivery_company_id_creat_idx" ON "delivery_company_idempotency_keys"("delivery_company_id" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_company_idempotency_keys_delivery_company_id_endpo_key" ON "delivery_company_idempotency_keys"("delivery_company_id" ASC, "endpoint_key" ASC, "idempotency_key" ASC);

-- CreateIndex
CREATE INDEX "delivery_company_idempotency_keys_expires_at_idx" ON "delivery_company_idempotency_keys"("expires_at" ASC);

-- CreateIndex
CREATE INDEX "login_attempts_created_at_idx" ON "login_attempts"("created_at" ASC);

-- CreateIndex
CREATE INDEX "login_attempts_identifier_created_at_idx" ON "login_attempts"("identifier" ASC, "created_at" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "order_driver_rejections_order_id_driver_id_key" ON "order_driver_rejections"("order_id" ASC, "driver_id" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "delivery_company_addresses_delivery_company_id_label_key" ON "delivery_company_addresses"("delivery_company_id" ASC, "label" ASC);

-- CreateIndex
CREATE INDEX "notifications_group_key_idx" ON "notifications"("group_key" ASC);

-- CreateIndex
CREATE INDEX "notifications_type_idx" ON "notifications"("type" ASC);

-- CreateIndex
CREATE INDEX "notifications_user_id_user_type_sent_at_idx" ON "notifications"("user_id" ASC, "user_type" ASC, "sent_at" ASC);

-- CreateIndex
CREATE INDEX "orders_delivery_company_department_id_status_idx" ON "orders"("delivery_company_department_id" ASC, "status" ASC);

-- CreateIndex
CREATE UNIQUE INDEX "orders_tracking_token_key" ON "orders"("tracking_token" ASC);

-- AddForeignKey
ALTER TABLE "delivery_company_department_accounts" ADD CONSTRAINT "delivery_company_department_accounts_delivery_company_id_fkey" FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_department_accounts" ADD CONSTRAINT "delivery_company_department_accounts_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "delivery_company_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_department_budget_policies" ADD CONSTRAINT "delivery_company_department_budget_policies_delivery_compa_fkey" FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_department_budget_policies" ADD CONSTRAINT "delivery_company_department_budget_policies_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "delivery_company_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_department_budget_requests" ADD CONSTRAINT "delivery_company_department_budget_requests_delivery_compa_fkey" FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_department_budget_requests" ADD CONSTRAINT "delivery_company_department_budget_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "delivery_company_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_department_budget_wallets" ADD CONSTRAINT "delivery_company_department_budget_wallets_delivery_compan_fkey" FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_department_budget_wallets" ADD CONSTRAINT "delivery_company_department_budget_wallets_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "delivery_company_addresses"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "delivery_company_idempotency_keys" ADD CONSTRAINT "delivery_company_idempotency_keys_delivery_company_id_fkey" FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_driver_rejections" ADD CONSTRAINT "order_driver_rejections_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_driver_rejections" ADD CONSTRAINT "order_driver_rejections_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_company_department_id_fkey" FOREIGN KEY ("delivery_company_department_id") REFERENCES "delivery_company_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "customer_service_governorates_customer_service_id_governorate_i" RENAME TO "customer_service_governorates_customer_service_id_governora_key";

-- RenameIndex
ALTER INDEX "delivery_company_bank_accounts_delivery_company_id_is_verified_" RENAME TO "delivery_company_bank_accounts_delivery_company_id_is_verif_idx";

-- RenameIndex
ALTER INDEX "delivery_company_refund_requests_delivery_company_id_status_cre" RENAME TO "delivery_company_refund_requests_delivery_company_id_status_idx";

-- RenameIndex
ALTER INDEX "delivery_company_transactions_delivery_company_id_created_at_id" RENAME TO "delivery_company_transactions_delivery_company_id_created_a_idx";

-- RenameIndex
ALTER INDEX "order_return_deposit_feedbacks_reported_by_user_id_created_at_i" RENAME TO "order_return_deposit_feedbacks_reported_by_user_id_created__idx";
