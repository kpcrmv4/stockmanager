-- Migration: Add withdrawal blocked days and business day cutoff
-- Allows stores to configure which days withdrawals are blocked (default: Fri, Sat)
-- and the business day cutoff hour (default: 6 AM) for late-night operations.
-- Also adds withdrawal_type to distinguish in-store vs take-home withdrawals.

-- 1. Add withdrawal settings to store_settings
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS withdrawal_blocked_days TEXT[] DEFAULT '{Fri,Sat}',
  ADD COLUMN IF NOT EXISTS business_day_cutoff_hour INTEGER DEFAULT 6;

-- 2. Add withdrawal_type to withdrawals table
DO $$ BEGIN
  CREATE TYPE withdrawal_type_enum AS ENUM ('in_store', 'take_home');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT DEFAULT 'in_store';

-- 3. Add comment for documentation
COMMENT ON COLUMN store_settings.withdrawal_blocked_days IS 'Days of week when in-store withdrawals are blocked. Values: Sun,Mon,Tue,Wed,Thu,Fri,Sat. Default: Fri,Sat';
COMMENT ON COLUMN store_settings.business_day_cutoff_hour IS 'Hour (0-23) when business day ends. Before this hour, system considers it the previous business day. Default: 6 (6 AM)';
COMMENT ON COLUMN withdrawals.withdrawal_type IS 'Type of withdrawal: in_store (drink at venue) or take_home (customer takes bottle home). take_home is allowed on blocked days.';
