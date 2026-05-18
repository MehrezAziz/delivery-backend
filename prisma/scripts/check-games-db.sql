SELECT 'enums' AS kind, typname AS name FROM pg_type WHERE typname LIKE 'Game%' ORDER BY typname;
SELECT 'tables' AS kind, tablename AS name FROM pg_tables WHERE schemaname = 'public' AND tablename LIKE 'game%' ORDER BY tablename;
SELECT column_name FROM information_schema.columns WHERE table_name = 'customers' AND column_name = 'notify_game_events';
SELECT column_name FROM information_schema.columns WHERE table_name = 'drivers' AND column_name = 'notify_game_events';
