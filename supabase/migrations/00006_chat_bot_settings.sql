-- =============================================
-- 00006: Chat Bot Settings
-- เพิ่มคอลัมน์ตั้งค่าบอทแชทใน store_settings
-- =============================================

-- Bot enable/disable per type
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS chat_bot_deposit_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_bot_withdrawal_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_bot_stock_enabled boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_bot_borrow_enabled boolean NOT NULL DEFAULT true;

-- Timeout per type (minutes)
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS chat_bot_timeout_deposit integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS chat_bot_timeout_withdrawal integer NOT NULL DEFAULT 15,
  ADD COLUMN IF NOT EXISTS chat_bot_timeout_stock integer NOT NULL DEFAULT 60,
  ADD COLUMN IF NOT EXISTS chat_bot_timeout_borrow integer NOT NULL DEFAULT 30;

-- Priority per type ('urgent' | 'normal' | 'low')
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS chat_bot_priority_deposit text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS chat_bot_priority_withdrawal text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS chat_bot_priority_stock text NOT NULL DEFAULT 'normal',
  ADD COLUMN IF NOT EXISTS chat_bot_priority_borrow text NOT NULL DEFAULT 'normal';

-- Daily summary
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS chat_bot_daily_summary_enabled boolean NOT NULL DEFAULT true;

-- Allow managers to update store_settings (currently only owner can)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'store_settings' AND policyname = 'Manager manage settings'
  ) THEN
    CREATE POLICY "Manager manage settings" ON store_settings
      FOR ALL USING (get_user_role() = 'manager');
  END IF;
END $$;
