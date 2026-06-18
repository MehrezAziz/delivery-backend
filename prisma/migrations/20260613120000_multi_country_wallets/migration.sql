-- Multi-country wallets: one wallet per customer per country

DROP INDEX IF EXISTS "digital_wallets_customer_id_key";
ALTER TABLE "digital_wallets" DROP CONSTRAINT IF EXISTS "digital_wallets_customer_id_key";

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "primary_wallet_id" TEXT;

UPDATE "customers" c
SET "primary_wallet_id" = (
  SELECT dw.id FROM "digital_wallets" dw
  WHERE dw."customer_id" = c.id
  ORDER BY dw."updated_at" ASC
  LIMIT 1
)
WHERE c."primary_wallet_id" IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS "digital_wallets_customer_id_country_id_key"
  ON "digital_wallets"("customer_id", "country_id");

CREATE UNIQUE INDEX IF NOT EXISTS "customers_primary_wallet_id_key"
  ON "customers"("primary_wallet_id");

ALTER TABLE "customers"
  ADD CONSTRAINT "customers_primary_wallet_id_fkey"
  FOREIGN KEY ("primary_wallet_id") REFERENCES "digital_wallets"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "customer_country_preferences" (
  "id" TEXT NOT NULL,
  "customer_id" TEXT NOT NULL,
  "country_id" TEXT NOT NULL,
  "cod_only" BOOLEAN NOT NULL DEFAULT false,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "customer_country_preferences_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "customer_country_preferences_customer_id_country_id_key"
  ON "customer_country_preferences"("customer_id", "country_id");

ALTER TABLE "customer_country_preferences"
  ADD CONSTRAINT "customer_country_preferences_customer_id_fkey"
  FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "customer_country_preferences"
  ADD CONSTRAINT "customer_country_preferences_country_id_fkey"
  FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "order_country_id" TEXT;
ALTER TABLE "orders" ADD COLUMN IF NOT EXISTS "payment_wallet_id" TEXT;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_order_country_id_fkey"
  FOREIGN KEY ("order_country_id") REFERENCES "countries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orders"
  ADD CONSTRAINT "orders_payment_wallet_id_fkey"
  FOREIGN KEY ("payment_wallet_id") REFERENCES "digital_wallets"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- 1 coin = 1 fiat: normalize active coin configs
UPDATE "country_coin_configs"
SET "coins_per_fiat_unit" = 1
WHERE "is_active" = true;
