-- Coins minted per 1.00 unit of local fiat (cash → wallet coins), per country coin config row
ALTER TABLE "country_coin_configs" ADD COLUMN "coins_per_fiat_unit" DECIMAL(12, 4) NOT NULL DEFAULT 1;
