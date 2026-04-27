-- 00024_realtime_transfers_commission.sql
--
-- Add `transfers` and `commission_entries` to the supabase_realtime
-- publication so the /inbox page's Realtime subscription actually
-- receives events for them. Wrapped in DO blocks because
-- ALTER PUBLICATION ... ADD TABLE errors if the table is already a
-- member, which would happen on a re-run.

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE transfers;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE commission_entries;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
