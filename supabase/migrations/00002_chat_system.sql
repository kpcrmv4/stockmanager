-- ==========================================
-- StockManager — Chat System (Phase 1 + 2)
-- ระบบแชทภายในสำหรับพนักงาน + Action Card Claim System
--
-- Architecture:
--   - ใช้ Broadcast แทน postgres_changes เพื่อประหยัด Realtime quota
--   - Action Card เก็บเป็น JSONB ใน metadata (ไม่แยกตาราง)
--   - Typing indicator ใช้ Presence (ไม่เขียน DB)
--   - ไม่เพิ่มเข้า supabase_realtime publication
-- ==========================================

-- ==========================================
-- ENUMS
-- ==========================================

CREATE TYPE chat_room_type AS ENUM ('store', 'direct', 'cross_store');
CREATE TYPE chat_message_type AS ENUM ('text', 'image', 'action_card', 'system');
CREATE TYPE chat_member_role AS ENUM ('member', 'admin');

-- ==========================================
-- TABLES
-- ==========================================

-- ห้องแชท: 1 สาขา = 1 ห้อง store (สร้างอัตโนมัติ)
-- + ห้อง direct สำหรับ DM
-- + ห้อง cross_store สำหรับ owner คุยข้ามสาขา
CREATE TABLE chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type chat_room_type NOT NULL DEFAULT 'store',
  is_active BOOLEAN DEFAULT true,
  pinned_summary JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- ข้อความ: รองรับ text, image, action_card, system
-- action_card data อยู่ใน metadata (JSONB)
CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,  -- NULL = bot/system
  type chat_message_type NOT NULL DEFAULT 'text',
  content TEXT,                       -- ข้อความ / image URL / system text
  metadata JSONB DEFAULT NULL,        -- action_card data, reply_to, etc.
  created_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ DEFAULT NULL  -- สำหรับ archiving ข้อความเก่า
);

-- สมาชิกห้องแชท + last_read_at สำหรับคำนวณ unread count
CREATE TABLE chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role chat_member_role NOT NULL DEFAULT 'member',
  last_read_at TIMESTAMPTZ DEFAULT now(),
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

-- ==========================================
-- INDEXES (performance + quota friendly)
-- ==========================================

-- ข้อความล่าสุดของห้อง (pagination) — เฉพาะที่ยังไม่ archive
CREATE INDEX idx_chat_messages_room_created
  ON chat_messages(room_id, created_at DESC)
  WHERE archived_at IS NULL;

-- หาห้องของ user อย่างรวดเร็ว
CREATE INDEX idx_chat_members_user
  ON chat_members(user_id);

-- หาห้องของ store
CREATE INDEX idx_chat_rooms_store
  ON chat_rooms(store_id)
  WHERE is_active = true;

-- action cards ที่ยัง pending (สำหรับ live summary + timeout check)
CREATE INDEX idx_chat_messages_action_cards
  ON chat_messages((metadata->>'status'))
  WHERE type = 'action_card' AND archived_at IS NULL;

-- ==========================================
-- ROW LEVEL SECURITY
-- ==========================================

ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;

-- ========== chat_rooms ==========

-- เห็นได้: สมาชิกในห้อง หรือ owner/accountant เห็นทุกห้อง
CREATE POLICY "Members see their chat rooms" ON chat_rooms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = id AND cm.user_id = auth.uid()
    )
    OR is_admin()
  );

-- สร้างห้อง: owner/manager เท่านั้น
CREATE POLICY "Managers create chat rooms" ON chat_rooms
  FOR INSERT WITH CHECK (
    get_user_role() IN ('owner', 'manager')
  );

-- แก้ไขห้อง: owner/manager
CREATE POLICY "Managers update chat rooms" ON chat_rooms
  FOR UPDATE USING (
    get_user_role() IN ('owner', 'manager')
  );

-- ========== chat_messages ==========

-- เห็นข้อความ: สมาชิกในห้อง หรือ admin
CREATE POLICY "Members see chat messages" ON chat_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = room_id AND cm.user_id = auth.uid()
    )
    OR is_admin()
  );

-- ส่งข้อความ: สมาชิกในห้อง + sender_id = ตัวเอง
CREATE POLICY "Members send chat messages" ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = room_id AND cm.user_id = auth.uid()
    )
  );

-- แก้ไข: เฉพาะ action_card (claim/release/complete) + ต้องเป็นสมาชิก
CREATE POLICY "Members update action cards" ON chat_messages
  FOR UPDATE USING (
    type = 'action_card'
    AND EXISTS (
      SELECT 1 FROM chat_members cm
      WHERE cm.room_id = room_id AND cm.user_id = auth.uid()
    )
  );

-- ========== chat_members ==========

-- เห็นสมาชิก: คนที่อยู่ในห้องเดียวกัน หรือ admin
CREATE POLICY "Members see co-members" ON chat_members
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM chat_members cm2
      WHERE cm2.room_id = room_id AND cm2.user_id = auth.uid()
    )
    OR is_admin()
  );

-- อัปเดต last_read_at ของตัวเอง
CREATE POLICY "Members update own read status" ON chat_members
  FOR UPDATE USING (user_id = auth.uid());

-- owner/manager จัดการสมาชิก
CREATE POLICY "Managers manage chat members" ON chat_members
  FOR ALL USING (
    get_user_role() IN ('owner', 'manager')
  );

-- ==========================================
-- TRIGGERS: Auto-create & Auto-join
-- ==========================================

-- เมื่อสร้าง store ใหม่ → สร้างห้องแชทสาขาอัตโนมัติ
CREATE OR REPLACE FUNCTION create_store_chat_room()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO chat_rooms (store_id, name, type)
  VALUES (NEW.id, NEW.store_name || ' — แชท', 'store');
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_store_create_chat_room
  AFTER INSERT ON stores
  FOR EACH ROW
  EXECUTE FUNCTION create_store_chat_room();

-- เมื่อเพิ่ม user เข้า store → เพิ่มเข้าห้องแชทสาขาอัตโนมัติ
CREATE OR REPLACE FUNCTION add_user_to_store_chat()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO chat_members (room_id, user_id, role)
  SELECT cr.id, NEW.user_id, 'member'
  FROM chat_rooms cr
  WHERE cr.store_id = NEW.store_id
    AND cr.type = 'store'
    AND cr.is_active = true
  ON CONFLICT (room_id, user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_user_store_add_chat
  AFTER INSERT ON user_stores
  FOR EACH ROW
  EXECUTE FUNCTION add_user_to_store_chat();

-- เมื่อลบ user ออกจาก store → ลบออกจากห้องแชทสาขาด้วย
CREATE OR REPLACE FUNCTION remove_user_from_store_chat()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM chat_members
  WHERE user_id = OLD.user_id
    AND room_id IN (
      SELECT cr.id FROM chat_rooms cr
      WHERE cr.store_id = OLD.store_id AND cr.type = 'store'
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_user_store_remove_chat
  AFTER DELETE ON user_stores
  FOR EACH ROW
  EXECUTE FUNCTION remove_user_from_store_chat();

-- ==========================================
-- FUNCTION: Bot/System insert (bypass RLS)
-- ใช้สำหรับ API route ที่ส่ง bot message / action card
-- ==========================================

CREATE OR REPLACE FUNCTION insert_bot_message(
  p_room_id UUID,
  p_type chat_message_type,
  p_content TEXT,
  p_metadata JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO chat_messages (room_id, sender_id, type, content, metadata)
  VALUES (p_room_id, NULL, p_type, p_content, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- FUNCTION: Claim action card
-- ==========================================

CREATE OR REPLACE FUNCTION claim_action_card(
  p_message_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_msg chat_messages;
  v_meta JSONB;
  v_profile RECORD;
BEGIN
  -- ดึงข้อความ
  SELECT * INTO v_msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  IF v_msg.type != 'action_card' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an action card');
  END IF;

  v_meta := v_msg.metadata;

  -- ตรวจสอบ status
  IF v_meta->>'status' != 'pending' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed',
      'claimed_by', v_meta->>'claimed_by_name');
  END IF;

  -- ดึงชื่อ user
  SELECT display_name, username INTO v_profile
  FROM profiles WHERE id = p_user_id;

  -- อัปเดต metadata
  v_meta := v_meta
    || jsonb_build_object(
      'status', 'claimed',
      'claimed_by', p_user_id,
      'claimed_by_name', COALESCE(v_profile.display_name, v_profile.username),
      'claimed_at', now()
    );

  UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- FUNCTION: Release action card (ยกเลิก claim)
-- ==========================================

CREATE OR REPLACE FUNCTION release_action_card(
  p_message_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_msg chat_messages;
  v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  v_meta := v_msg.metadata;

  -- เฉพาะคนที่ claim เท่านั้นถึงจะ release ได้
  IF v_meta->>'claimed_by' != p_user_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you');
  END IF;

  -- reset กลับเป็น pending
  v_meta := v_meta
    || jsonb_build_object(
      'status', 'pending',
      'claimed_by', null,
      'claimed_by_name', null,
      'claimed_at', null,
      'released_by', p_user_id,
      'released_at', now()
    );

  UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- FUNCTION: Complete action card
-- ==========================================

CREATE OR REPLACE FUNCTION complete_action_card(
  p_message_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_msg chat_messages;
  v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  v_meta := v_msg.metadata;

  -- ต้อง claimed ก่อนถึง complete ได้
  IF v_meta->>'status' != 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in claimed status');
  END IF;

  -- เฉพาะคนที่ claim
  IF v_meta->>'claimed_by' != p_user_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you');
  END IF;

  v_meta := v_meta
    || jsonb_build_object(
      'status', 'completed',
      'completed_at', now(),
      'completion_notes', p_notes
    );

  UPDATE chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ==========================================
-- FUNCTION: Get unread count per room for a user
-- (lightweight — ใช้กับ badge channel)
-- ==========================================

CREATE OR REPLACE FUNCTION get_chat_unread_counts(p_user_id UUID)
RETURNS TABLE(room_id UUID, unread_count BIGINT) AS $$
  SELECT
    cm.room_id,
    COUNT(msg.id) AS unread_count
  FROM chat_members cm
  LEFT JOIN chat_messages msg
    ON msg.room_id = cm.room_id
    AND msg.created_at > cm.last_read_at
    AND msg.sender_id != p_user_id  -- ไม่นับข้อความตัวเอง
    AND msg.archived_at IS NULL
  WHERE cm.user_id = p_user_id
  GROUP BY cm.room_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ==========================================
-- SEED: สร้างห้องแชทสำหรับ store ที่มีอยู่แล้ว
-- ==========================================

-- สร้างห้อง store chat สำหรับทุก store ที่ยังไม่มี
INSERT INTO chat_rooms (store_id, name, type)
SELECT s.id, s.store_name || ' — แชท', 'store'
FROM stores s
WHERE s.active = true
  AND NOT EXISTS (
    SELECT 1 FROM chat_rooms cr
    WHERE cr.store_id = s.id AND cr.type = 'store'
  );

-- เพิ่มสมาชิกทุกคนที่อยู่ใน user_stores เข้าห้องแชท
INSERT INTO chat_members (room_id, user_id, role)
SELECT cr.id, us.user_id, 'member'
FROM user_stores us
JOIN chat_rooms cr ON cr.store_id = us.store_id AND cr.type = 'store'
WHERE cr.is_active = true
ON CONFLICT (room_id, user_id) DO NOTHING;

-- ==========================================
-- NOTE: ไม่เพิ่ม chat_messages เข้า supabase_realtime
-- เพราะใช้ Broadcast แทน postgres_changes
-- เพื่อประหยัด Realtime quota (~80% savings)
--
-- Client flow:
--   1. INSERT เข้า chat_messages (DB)
--   2. Broadcast ผ่าน channel `chat:room:{room_id}`
--   3. Client subscribe เฉพาะห้องที่เปิดดู
-- ==========================================
