-- 00036_deposit_status_transfer_pending.sql
--
-- Add the `transfer_pending` enum value that exists in the GAS-era stockManager
-- DB but was dropped from the consolidated schema. Frontend (deposit page,
-- import-deposits validator) and the deposit transfer flow rely on it as the
-- intermediate state between "expired" and "transferred_out":
--   expired → transfer_pending → transferred_out
--
-- Without this value, the deposit page query
--   ?status=in.(…,transfer_pending,…)
-- returns a 400 Bad Request from PostgREST.

ALTER TYPE deposit_status ADD VALUE IF NOT EXISTS 'transfer_pending' BEFORE 'transferred_out';
