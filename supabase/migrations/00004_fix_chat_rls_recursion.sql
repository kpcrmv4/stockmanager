-- ==========================================
-- Fix: Self-referencing RLS on chat_members → infinite recursion
--
-- ปัญหา: policy "Members see co-members" query chat_members ซ้อน chat_members
-- ทำให้ PostgREST return 500
--
-- แก้ไข: ใช้ SECURITY DEFINER function (bypass RLS) แทน subquery ตรง
-- ==========================================

-- Helper: ตรวจว่า user เป็นสมาชิกห้องนี้หรือไม่ (bypass RLS)
CREATE OR REPLACE FUNCTION is_chat_member(p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM chat_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- ========== Fix chat_members policies ==========

DROP POLICY IF EXISTS "Members see co-members" ON chat_members;
CREATE POLICY "Members see co-members" ON chat_members
  FOR SELECT USING (
    is_chat_member(room_id) OR is_admin()
  );

-- ========== Fix chat_rooms policies (ใช้ function เดียวกัน) ==========

DROP POLICY IF EXISTS "Members see their chat rooms" ON chat_rooms;
CREATE POLICY "Members see their chat rooms" ON chat_rooms
  FOR SELECT USING (
    is_chat_member(id) OR is_admin()
  );

-- ========== Fix chat_messages policies ==========

DROP POLICY IF EXISTS "Members see chat messages" ON chat_messages;
CREATE POLICY "Members see chat messages" ON chat_messages
  FOR SELECT USING (
    is_chat_member(room_id) OR is_admin()
  );

DROP POLICY IF EXISTS "Members send chat messages" ON chat_messages;
CREATE POLICY "Members send chat messages" ON chat_messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND is_chat_member(room_id)
  );

DROP POLICY IF EXISTS "Members update action cards" ON chat_messages;
CREATE POLICY "Members update action cards" ON chat_messages
  FOR UPDATE USING (
    type = 'action_card' AND is_chat_member(room_id)
  );

-- ==========================================
-- Re-seed: สร้างห้องแชทสำหรับ store ที่ยังไม่มี
-- (กรณี seed ใน 00002 ไม่ทำงาน)
-- ==========================================

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
