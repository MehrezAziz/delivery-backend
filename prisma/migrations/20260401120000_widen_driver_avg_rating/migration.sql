-- avg_rating was DECIMAL(3,2) (max 9.99); ratings are 0–10 so average can be 10.00 → overflow.
ALTER TABLE "driver_performance_metrics" ALTER COLUMN "avg_rating" TYPE DECIMAL(4,2);
