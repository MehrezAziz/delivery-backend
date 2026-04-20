-- Widen coin columns to 3 decimal places (ceil-style business rounding at application layer).
ALTER TABLE "delivery_companies" ALTER COLUMN "coin_balance" TYPE DECIMAL(12,3);
ALTER TABLE "delivery_companies" ALTER COLUMN "locked_coins" TYPE DECIMAL(12,3);

ALTER TABLE "delivery_company_department_budget_wallets" ALTER COLUMN "available_coins" TYPE DECIMAL(12,3);
ALTER TABLE "delivery_company_department_budget_wallets" ALTER COLUMN "locked_coins" TYPE DECIMAL(12,3);

ALTER TABLE "delivery_company_transactions" ALTER COLUMN "amount" TYPE DECIMAL(12,3);
ALTER TABLE "delivery_company_transactions" ALTER COLUMN "balance_after" TYPE DECIMAL(12,3);

ALTER TABLE "delivery_company_refund_requests" ALTER COLUMN "amount_coins" TYPE DECIMAL(12,3);

ALTER TABLE "delivery_company_department_budget_requests" ALTER COLUMN "amount_coins" TYPE DECIMAL(12,3);

ALTER TABLE "orders" ALTER COLUMN "price" TYPE DECIMAL(10,3);
