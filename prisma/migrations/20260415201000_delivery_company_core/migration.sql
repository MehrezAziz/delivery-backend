-- Enums
DO $$ BEGIN
  CREATE TYPE "OrderSourceType" AS ENUM ('NORMAL_CUSTOMER', 'DELIVERY_COMPANY');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryCompanyStatus" AS ENUM ('PENDING', 'ACTIVE', 'SUSPENDED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryCompanyApiKeyStatus" AS ENUM ('ACTIVE', 'REVOKED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryCompanyRefundDestinationType" AS ENUM ('BANK_TRANSFER', 'CARD_REFUND');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryCompanyRefundStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PAID', 'FAILED');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE "DeliveryCompanyTransactionType" AS ENUM ('ORDER_PAYMENT', 'RETURN_SURCHARGE', 'REFUND_REQUEST', 'REFUND_REVERSED', 'ADMIN_ADJUSTMENT');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Order extension
ALTER TABLE "orders"
  ADD COLUMN IF NOT EXISTS "source_type" "OrderSourceType" NOT NULL DEFAULT 'NORMAL_CUSTOMER',
  ADD COLUMN IF NOT EXISTS "delivery_company_id" TEXT;

-- Core delivery company
CREATE TABLE IF NOT EXISTS "delivery_companies" (
  "id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "legal_name" TEXT,
  "tax_id" TEXT,
  "status" "DeliveryCompanyStatus" NOT NULL DEFAULT 'PENDING',
  "default_discount_percent" DECIMAL(5,2),
  "max_negative_balance" DECIMAL(10,2) NOT NULL DEFAULT 0,
  "coin_balance" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "locked_coins" DECIMAL(12,2) NOT NULL DEFAULT 0,
  "proxy_customer_id" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "delivery_company_addresses" (
  "id" TEXT NOT NULL,
  "delivery_company_id" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "contact_name" TEXT,
  "contact_phone" TEXT,
  "street" TEXT,
  "city" TEXT,
  "country" TEXT,
  "postal_code" TEXT,
  "latitude" DOUBLE PRECISION,
  "longitude" DOUBLE PRECISION,
  "is_default" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_company_addresses_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "delivery_company_bank_accounts" (
  "id" TEXT NOT NULL,
  "delivery_company_id" TEXT NOT NULL,
  "iban" TEXT,
  "rib" TEXT,
  "swift_bic" TEXT,
  "bank_name" TEXT,
  "account_holder_name" TEXT NOT NULL,
  "account_holder_id" TEXT,
  "currency" TEXT,
  "is_verified" BOOLEAN NOT NULL DEFAULT false,
  "verified_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_company_bank_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "delivery_company_api_keys" (
  "id" TEXT NOT NULL,
  "delivery_company_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "key_prefix" TEXT NOT NULL,
  "key_hash" TEXT NOT NULL,
  "scopes" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "status" "DeliveryCompanyApiKeyStatus" NOT NULL DEFAULT 'ACTIVE',
  "expires_at" TIMESTAMP(3),
  "last_used_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_company_api_keys_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "delivery_company_refund_requests" (
  "id" TEXT NOT NULL,
  "delivery_company_id" TEXT NOT NULL,
  "amount_coins" DECIMAL(12,2) NOT NULL,
  "amount_money" DECIMAL(12,2) NOT NULL,
  "destination_type" "DeliveryCompanyRefundDestinationType" NOT NULL,
  "status" "DeliveryCompanyRefundStatus" NOT NULL DEFAULT 'PENDING',
  "reason" TEXT,
  "provider_reference" TEXT,
  "approved_by" TEXT,
  "processed_at" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_company_refund_requests_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "delivery_company_transactions" (
  "id" TEXT NOT NULL,
  "delivery_company_id" TEXT NOT NULL,
  "order_id" TEXT,
  "type" "DeliveryCompanyTransactionType" NOT NULL,
  "amount" DECIMAL(12,2) NOT NULL,
  "balance_after" DECIMAL(12,2) NOT NULL,
  "description" TEXT,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "delivery_company_transactions_pkey" PRIMARY KEY ("id")
);

-- Indexes
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_companies_proxy_customer_id_key" ON "delivery_companies" ("proxy_customer_id");
CREATE INDEX IF NOT EXISTS "delivery_companies_status_created_at_idx" ON "delivery_companies" ("status", "created_at");
CREATE INDEX IF NOT EXISTS "delivery_company_addresses_delivery_company_id_is_default_idx" ON "delivery_company_addresses" ("delivery_company_id", "is_default");
CREATE INDEX IF NOT EXISTS "delivery_company_bank_accounts_delivery_company_id_is_verified_idx" ON "delivery_company_bank_accounts" ("delivery_company_id", "is_verified");
CREATE INDEX IF NOT EXISTS "delivery_company_api_keys_delivery_company_id_status_idx" ON "delivery_company_api_keys" ("delivery_company_id", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "delivery_company_api_keys_key_prefix_key_hash_key" ON "delivery_company_api_keys" ("key_prefix", "key_hash");
CREATE INDEX IF NOT EXISTS "delivery_company_refund_requests_delivery_company_id_status_created_at_idx" ON "delivery_company_refund_requests" ("delivery_company_id", "status", "created_at");
CREATE INDEX IF NOT EXISTS "delivery_company_transactions_delivery_company_id_created_at_idx" ON "delivery_company_transactions" ("delivery_company_id", "created_at");
CREATE INDEX IF NOT EXISTS "delivery_company_transactions_order_id_idx" ON "delivery_company_transactions" ("order_id");
CREATE INDEX IF NOT EXISTS "orders_delivery_company_id_status_idx" ON "orders" ("delivery_company_id", "status");

-- Foreign keys
DO $$ BEGIN
  ALTER TABLE "orders"
    ADD CONSTRAINT "orders_delivery_company_id_fkey"
    FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_companies"
    ADD CONSTRAINT "delivery_companies_proxy_customer_id_fkey"
    FOREIGN KEY ("proxy_customer_id") REFERENCES "customers"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_company_addresses"
    ADD CONSTRAINT "delivery_company_addresses_delivery_company_id_fkey"
    FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_company_bank_accounts"
    ADD CONSTRAINT "delivery_company_bank_accounts_delivery_company_id_fkey"
    FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_company_api_keys"
    ADD CONSTRAINT "delivery_company_api_keys_delivery_company_id_fkey"
    FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_company_refund_requests"
    ADD CONSTRAINT "delivery_company_refund_requests_delivery_company_id_fkey"
    FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_company_transactions"
    ADD CONSTRAINT "delivery_company_transactions_delivery_company_id_fkey"
    FOREIGN KEY ("delivery_company_id") REFERENCES "delivery_companies"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "delivery_company_transactions"
    ADD CONSTRAINT "delivery_company_transactions_order_id_fkey"
    FOREIGN KEY ("order_id") REFERENCES "orders"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
