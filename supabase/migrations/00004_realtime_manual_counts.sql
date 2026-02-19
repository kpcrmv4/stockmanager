-- 00004_realtime_manual_counts.sql
-- Add unique constraint for real-time individual upserts + enable realtime

-- Unique constraint so we can use upsert (INSERT ... ON CONFLICT UPDATE)
-- for individual item saves (real-time collaboration)
ALTER TABLE manual_counts
ADD CONSTRAINT manual_counts_store_date_product_unique
UNIQUE (store_id, count_date, product_code);

-- Enable Supabase Realtime for manual_counts so multiple staff
-- can see each other's progress in real-time
ALTER PUBLICATION supabase_realtime ADD TABLE manual_counts;
