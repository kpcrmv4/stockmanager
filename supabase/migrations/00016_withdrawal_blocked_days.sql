-- Migration: Add withdrawal blocked days + withdrawal type
-- Allows stores to configure which days withdrawals are blocked (default: Fri, Sat).
-- Expiry grace period uses existing print_server_working_hours.endHour (no separate setting needed).
-- Also adds withdrawal_type to distinguish in-store vs take-home withdrawals.

-- 1. Add withdrawal_blocked_days to store_settings
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS withdrawal_blocked_days TEXT[] DEFAULT '{Fri,Sat}';

-- 2. Add withdrawal_type to withdrawals table
ALTER TABLE withdrawals
  ADD COLUMN IF NOT EXISTS withdrawal_type TEXT DEFAULT 'in_store';

-- 3. Add comments for documentation
COMMENT ON COLUMN store_settings.withdrawal_blocked_days IS 'Days of week when in-store withdrawals are blocked. Values: Sun,Mon,Tue,Wed,Thu,Fri,Sat. Default: Fri,Sat';
COMMENT ON COLUMN withdrawals.withdrawal_type IS 'Type of withdrawal: in_store (drink at venue) or take_home (customer takes bottle home). take_home is allowed on blocked days.';
