-- CustomerServiceRole: allow CS to adjust delivery company coin balances (with audit).
ALTER TYPE "CustomerServiceRole" ADD VALUE IF NOT EXISTS 'MANAGE_COMPANY_FINANCE';
