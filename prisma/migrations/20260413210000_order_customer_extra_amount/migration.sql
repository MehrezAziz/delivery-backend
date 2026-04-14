-- Optional customer-chosen extra on top of calculated delivery price (errand / long service).
ALTER TABLE "orders" ADD COLUMN "customer_extra_amount" DECIMAL(10,2) NOT NULL DEFAULT 0;
