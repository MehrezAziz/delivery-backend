-- Persist Flouci checkout link so users can resume pending purchases.
ALTER TABLE "coin_topup_sessions" ADD COLUMN "checkout_url" TEXT;
