-- 00035_stores_liff_id.sql
--
-- Multi-provider LIFF: each LINE OA store may live under a separate LINE
-- Developers Provider, and LINE userIds are scoped per Provider. Storing
-- a per-store LIFF ID lets us return to the customer the LIFF app that
-- belongs to the same Provider as their existing line_user_id, so old
-- deposit history (keyed on line_user_id) keeps matching.
--
-- The legacy global key `system_settings.davis_ai.liff_id` continues to
-- work as a fallback for stores that haven't set a per-store LIFF yet.

ALTER TABLE stores ADD COLUMN IF NOT EXISTS liff_id TEXT;
