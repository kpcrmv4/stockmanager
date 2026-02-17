-- ==========================================
-- LINE DUAL BOT SUPPORT
-- เพิ่ม fields สำหรับ LINE OA แยกแต่ละสาขา + Bot กลาง
-- ==========================================

-- 1. เพิ่มคอลัมน์ใหม่ในตาราง stores
--    - line_channel_id: ใช้ route webhook ว่ามาจากสาขาไหน
--    - staff_group_id: Group ID ของกลุ่ม LINE พนักงาน
--    - bar_group_id: Group ID ของกลุ่ม LINE บาร์
--    (เปลี่ยนชื่อ line_group_id เดิมเป็น staff_group_id)
ALTER TABLE stores ADD COLUMN IF NOT EXISTS line_channel_id TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS staff_group_id TEXT;
ALTER TABLE stores ADD COLUMN IF NOT EXISTS bar_group_id TEXT;

-- ย้ายข้อมูลจาก line_group_id → staff_group_id (ถ้ามี)
UPDATE stores SET staff_group_id = line_group_id WHERE line_group_id IS NOT NULL;

-- ลบคอลัมน์เดิม
ALTER TABLE stores DROP COLUMN IF EXISTS line_group_id;

-- 2. Index สำหรับ lookup webhook ตาม channel_id
CREATE INDEX IF NOT EXISTS idx_stores_line_channel_id ON stores(line_channel_id) WHERE line_channel_id IS NOT NULL;

-- 3. เพิ่ม app_settings สำหรับ central bot config
-- (ตาราง app_settings มีอยู่แล้วจาก initial migration)
INSERT INTO app_settings (key, value, type, description) VALUES
  ('LINE_CENTRAL_TOKEN', '', 'secret', 'LINE Channel Access Token สำหรับ bot กลาง'),
  ('LINE_CENTRAL_GROUP_ID', '', 'string', 'LINE Group ID ของกลุ่มคลังกลาง'),
  ('LINE_CENTRAL_CHANNEL_SECRET', '', 'secret', 'LINE Channel Secret สำหรับ verify webhook signature')
ON CONFLICT (key) DO NOTHING;
