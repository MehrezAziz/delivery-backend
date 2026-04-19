-- Track which department portal account created a delivery-company order (main admin / API = NULL).
ALTER TABLE "orders" ADD COLUMN "delivery_company_department_account_id" TEXT;

ALTER TABLE "orders" ADD CONSTRAINT "orders_delivery_company_department_account_id_fkey"
  FOREIGN KEY ("delivery_company_department_account_id") REFERENCES "delivery_company_department_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "orders_delivery_company_department_account_id_idx" ON "orders"("delivery_company_department_account_id");
