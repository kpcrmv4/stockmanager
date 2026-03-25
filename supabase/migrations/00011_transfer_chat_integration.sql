-- ==========================================
-- Migration: Transfer Chat Integration
-- ==========================================
-- เพิ่ม bot settings สำหรับระบบโอนสต๊อก/คลังกลาง
-- ==========================================

-- Bot settings for transfer action cards in store_settings
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS chat_bot_transfer_enabled BOOLEAN DEFAULT true,
  ADD COLUMN IF NOT EXISTS chat_bot_timeout_transfer INTEGER DEFAULT 120,
  ADD COLUMN IF NOT EXISTS chat_bot_priority_transfer TEXT DEFAULT 'normal'
    CHECK (chat_bot_priority_transfer IN ('urgent', 'normal', 'low'));

-- Ensure central store has a chat room (same trigger as regular stores)
-- ไม่ต้องสร้างใหม่ — trigger trg_store_create_chat_room จะสร้างให้อัตโนมัติ
-- แต่ถ้า central store ไม่มี chat room ให้สร้าง
DO $$
DECLARE
  _store RECORD;
  _room_exists BOOLEAN;
BEGIN
  FOR _store IN SELECT id, store_name FROM stores WHERE is_central = true AND active = true
  LOOP
    SELECT EXISTS(
      SELECT 1 FROM chat_rooms WHERE store_id = _store.id AND type = 'store' AND is_active = true
    ) INTO _room_exists;

    IF NOT _room_exists THEN
      INSERT INTO chat_rooms (store_id, name, type, is_active)
      VALUES (_store.id, _store.store_name || ' — แชท', 'store', true);
    END IF;
  END LOOP;
END $$;
