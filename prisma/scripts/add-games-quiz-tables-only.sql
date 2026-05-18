-- Games: tables + columns only (enums Game* already exist from partial run).
-- Run: npx prisma db execute --file prisma/scripts/add-games-quiz-tables-only.sql --schema prisma/schema.prisma

ALTER TABLE "customers" ADD COLUMN IF NOT EXISTS "notify_game_events" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "drivers" ADD COLUMN IF NOT EXISTS "notify_game_events" BOOLEAN NOT NULL DEFAULT false;

DO $$ BEGIN ALTER TYPE "WalletTransactionType" ADD VALUE 'GAME_PRIZE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "DriverTransactionType" ADD VALUE 'GAME_PRIZE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "ReferenceType" ADD VALUE 'GAME_PRIZE'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'GAME_WINNER'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'GAME_DRAW_COMPLETED'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN ALTER TYPE "NotificationType" ADD VALUE 'GAME_REMINDER'; EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "games" (
  "id" TEXT NOT NULL,
  "type" "GameType" NOT NULL DEFAULT 'QUIZ',
  "name" TEXT NOT NULL,
  "description" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT false,
  "schedule_mode" "GameScheduleMode" NOT NULL DEFAULT 'ALL_DAYS',
  "calendar_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "weekdays" INTEGER[] DEFAULT ARRAY[]::INTEGER[],
  "period_mode" "GamePeriodMode" NOT NULL DEFAULT 'DAILY',
  "custom_period_days" INTEGER,
  "custom_period_anchor" "GameCustomPeriodAnchor",
  "questions_per_day" INTEGER NOT NULL DEFAULT 5,
  "access_code_hash" TEXT NOT NULL,
  "access_code_version" INTEGER NOT NULL DEFAULT 1,
  "require_completed_order" BOOLEAN NOT NULL DEFAULT false,
  "winner_selection_mode" "GameWinnerSelectionMode" NOT NULL DEFAULT 'RANDOM',
  "coin_credit_mode" "GameCoinCreditMode" NOT NULL DEFAULT 'AUTO_ON_CONFIRM',
  "winner_pool_mode" "GameWinnerPoolMode" NOT NULL DEFAULT 'COMBINED',
  "customer_button_placement" "GameButtonPlacement" NOT NULL,
  "driver_button_placement" "GameButtonPlacement" NOT NULL,
  "banner_image_urls" TEXT[] DEFAULT ARRAY[]::TEXT[],
  "show_recent_winners" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "games_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_countries" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "country_id" TEXT NOT NULL,
  CONSTRAINT "game_countries_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "game_countries_game_id_country_id_key" ON "game_countries"("game_id", "country_id");

CREATE TABLE IF NOT EXISTS "game_prize_tiers" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "rank" INTEGER NOT NULL,
  "prize_type" "GamePrizeType" NOT NULL,
  "coin_amount" DECIMAL(10,2),
  "prize_label" TEXT,
  "prize_image_url" TEXT,
  "congrats_image_url" TEXT,
  CONSTRAINT "game_prize_tiers_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "game_prize_tiers_game_id_rank_key" ON "game_prize_tiers"("game_id", "rank");

CREATE TABLE IF NOT EXISTS "game_categories" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "name" TEXT NOT NULL,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "game_categories_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_questions" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "category_id" TEXT NOT NULL,
  "text" TEXT,
  "image_url" TEXT,
  "is_active" BOOLEAN NOT NULL DEFAULT true,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "game_questions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_question_options" (
  "id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "text" TEXT,
  "image_url" TEXT,
  "is_correct" BOOLEAN NOT NULL DEFAULT false,
  "sort_order" INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "game_question_options_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_access" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "access_code_version" INTEGER NOT NULL,
  "unlocked_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "game_access_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "game_access_game_id_user_id_key" ON "game_access"("game_id", "user_id");

CREATE TABLE IF NOT EXISTS "game_code_attempts" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "failed_attempts" INTEGER NOT NULL DEFAULT 0,
  "locked_until" TIMESTAMP(3),
  "updated_at" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "game_code_attempts_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "game_code_attempts_game_id_user_id_key" ON "game_code_attempts"("game_id", "user_id");

CREATE TABLE IF NOT EXISTS "game_answers" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "selected_option_id" TEXT NOT NULL,
  "is_correct" BOOLEAN NOT NULL,
  "tunisia_date_key" TEXT NOT NULL,
  "answered_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "game_answers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_daily_question_shown" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "question_id" TEXT NOT NULL,
  "tunisia_date_key" TEXT NOT NULL,
  CONSTRAINT "game_daily_question_shown_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "game_daily_question_shown_game_id_user_id_question_id_tunisia_date_key_key"
  ON "game_daily_question_shown"("game_id", "user_id", "question_id", "tunisia_date_key");

CREATE TABLE IF NOT EXISTS "game_draws" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "period_start" TIMESTAMP(3) NOT NULL,
  "period_end" TIMESTAMP(3) NOT NULL,
  "status" "GameDrawStatus" NOT NULL DEFAULT 'OPEN',
  "pool_scope" TEXT NOT NULL DEFAULT 'COMBINED',
  "confirm_deadline" TIMESTAMP(3),
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "closed_at" TIMESTAMP(3),
  CONSTRAINT "game_draws_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "game_winners" (
  "id" TEXT NOT NULL,
  "game_id" TEXT NOT NULL,
  "draw_id" TEXT NOT NULL,
  "user_id" TEXT NOT NULL,
  "user_role" "UserRole" NOT NULL,
  "prize_tier_id" TEXT NOT NULL,
  "status" "GameWinnerStatus" NOT NULL DEFAULT 'PENDING_CONFIRM',
  "physical_prize_status" "GamePhysicalPrizeStatus",
  "correct_count_in_period" INTEGER NOT NULL DEFAULT 0,
  "congrats_shown_at" TIMESTAMP(3),
  "won_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "confirmed_at" TIMESTAMP(3),
  "credited_at" TIMESTAMP(3),
  CONSTRAINT "game_winners_pkey" PRIMARY KEY ("id")
);

DO $$ BEGIN
  ALTER TABLE "game_countries" ADD CONSTRAINT "game_countries_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_countries" ADD CONSTRAINT "game_countries_country_id_fkey"
    FOREIGN KEY ("country_id") REFERENCES "countries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_prize_tiers" ADD CONSTRAINT "game_prize_tiers_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_categories" ADD CONSTRAINT "game_categories_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_questions" ADD CONSTRAINT "game_questions_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_questions" ADD CONSTRAINT "game_questions_category_id_fkey"
    FOREIGN KEY ("category_id") REFERENCES "game_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_question_options" ADD CONSTRAINT "game_question_options_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "game_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_access" ADD CONSTRAINT "game_access_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_code_attempts" ADD CONSTRAINT "game_code_attempts_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "game_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_answers" ADD CONSTRAINT "game_answers_selected_option_id_fkey"
    FOREIGN KEY ("selected_option_id") REFERENCES "game_question_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_daily_question_shown" ADD CONSTRAINT "game_daily_question_shown_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_daily_question_shown" ADD CONSTRAINT "game_daily_question_shown_question_id_fkey"
    FOREIGN KEY ("question_id") REFERENCES "game_questions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_draws" ADD CONSTRAINT "game_draws_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_winners" ADD CONSTRAINT "game_winners_game_id_fkey"
    FOREIGN KEY ("game_id") REFERENCES "games"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_winners" ADD CONSTRAINT "game_winners_draw_id_fkey"
    FOREIGN KEY ("draw_id") REFERENCES "game_draws"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "game_winners" ADD CONSTRAINT "game_winners_prize_tier_id_fkey"
    FOREIGN KEY ("prize_tier_id") REFERENCES "game_prize_tiers"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "game_questions_game_id_is_active_idx" ON "game_questions"("game_id", "is_active");
CREATE INDEX IF NOT EXISTS "game_answers_game_id_user_id_tunisia_date_key_idx" ON "game_answers"("game_id", "user_id", "tunisia_date_key");
CREATE INDEX IF NOT EXISTS "game_answers_game_id_user_id_answered_at_idx" ON "game_answers"("game_id", "user_id", "answered_at");
CREATE INDEX IF NOT EXISTS "game_access_user_id_idx" ON "game_access"("user_id");
CREATE INDEX IF NOT EXISTS "game_draws_game_id_period_end_idx" ON "game_draws"("game_id", "period_end");
CREATE INDEX IF NOT EXISTS "game_winners_game_id_user_id_idx" ON "game_winners"("game_id", "user_id");
CREATE INDEX IF NOT EXISTS "game_winners_draw_id_idx" ON "game_winners"("draw_id");
