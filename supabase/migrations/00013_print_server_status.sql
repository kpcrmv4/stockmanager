-- =============================================
-- Migration: Print Server Status System
-- =============================================
-- ตาราง print_server_status สำหรับติดตามสถานะ Node.js print-server ของแต่ละสาขา
-- รองรับ heartbeat, online/offline detection, และ config management

-- 1. สร้างตาราง print_server_status
CREATE TABLE IF NOT EXISTS print_server_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  is_online BOOLEAN DEFAULT false,
  last_heartbeat TIMESTAMPTZ,
  server_version TEXT,
  printer_name TEXT DEFAULT 'POS80',
  printer_status TEXT DEFAULT 'unknown', -- 'ready', 'error', 'offline', 'unknown'
  hostname TEXT,
  jobs_printed_today INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. RLS Policies
ALTER TABLE print_server_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff see store print server status"
  ON print_server_status FOR SELECT
  USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

CREATE POLICY "Staff manage print server status"
  ON print_server_status FOR ALL
  USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- 3. Index
CREATE INDEX idx_print_server_status_store ON print_server_status(store_id);

-- 4. Realtime
ALTER PUBLICATION supabase_realtime ADD TABLE print_server_status;

-- 5. เพิ่ม columns ใน store_settings สำหรับ print server config
ALTER TABLE store_settings
  ADD COLUMN IF NOT EXISTS print_server_account_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS print_server_working_hours JSONB
    DEFAULT '{"enabled": true, "startHour": 12, "startMinute": 0, "endHour": 6, "endMinute": 0}'::jsonb;

-- 6. Performance index สำหรับ print-server query (pending jobs)
CREATE INDEX IF NOT EXISTS idx_print_queue_store_pending
  ON print_queue(store_id, created_at ASC)
  WHERE status = 'pending';

-- 7. Function: ตรวจสอบ print server online (heartbeat ภายใน 2 นาที)
CREATE OR REPLACE FUNCTION is_print_server_online(p_store_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.print_server_status
    WHERE store_id = p_store_id
      AND last_heartbeat > now() - INTERVAL '2 minutes'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE
SET search_path = public;
