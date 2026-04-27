-- 00025_customer_notify_deposit_rejected.sql
--
-- Add a per-store toggle for the new "bar rejected your deposit" Flex
-- notification. Other customer-event toggles already exist on
-- store_settings (deposit/withdrawal/expiry/promotion); this one was
-- missing because the rejection flow used to be silent.
--
-- Default ON so stores that already opted into LINE notifications get
-- the rejection notification by default — matches the other defaults.

ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS customer_notify_deposit_rejected_enabled BOOLEAN DEFAULT true;
