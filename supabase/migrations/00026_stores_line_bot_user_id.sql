-- 00026_stores_line_bot_user_id.sql
--
-- LINE webhook events carry `destination` = the BOT user id
-- (e.g. "U9124df2d80e5d73f5f1e73dc8ab35903"), NOT the channel id.
-- The webhook handler was matching `destination` against
-- `stores.line_channel_id` (e.g. "2009902974"), so every real webhook
-- request — including LINE's "Verify" button — got 404 "Store not
-- configured for this LINE channel".
--
-- Fix: persist the bot user id separately so the lookup matches.

ALTER TABLE stores
  ADD COLUMN IF NOT EXISTS line_bot_user_id TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_stores_line_bot_user_id
  ON stores(line_bot_user_id)
  WHERE line_bot_user_id IS NOT NULL;
