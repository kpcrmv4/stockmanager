-- 00037_transfer_code_and_audit_retention.sql
--
-- Catch up on schema drift between stockManager and Davis-Inventory live DBs:
-- stockManager had been ALTER'd directly during earlier feature work but
-- the corresponding migration file was never committed. This migration
-- folds those changes back in so both DBs (and future fresh installs)
-- match what the application code expects.
--
-- Adds:
--   transfers.transfer_code         — human-readable transfer reference
--                                     (used by transfer/page.tsx, print-station,
--                                      transfer-bot, activity, compact-action-card)
--   transfers.rejection_reason      — reason text shown when an HQ transfer is
--                                     rejected (transfer-bot-client)
--   store_settings.audit_log_retention_days
--                                   — number of days to keep audit_logs before
--                                     the cron audit-cleanup route prunes them

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS transfer_code VARCHAR(20);

ALTER TABLE transfers
  ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS audit_log_retention_days INTEGER;

CREATE INDEX IF NOT EXISTS idx_transfers_transfer_code
  ON transfers(transfer_code) WHERE transfer_code IS NOT NULL;

-- Backfill: give existing transfers a synthetic code from the first 6 hex of id
-- so the UI/print station has something to show instead of NULL.
UPDATE transfers
   SET transfer_code = 'TR' || UPPER(SUBSTR(REPLACE(id::text, '-', ''), 1, 6))
 WHERE transfer_code IS NULL;
