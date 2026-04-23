-- ==========================================
-- StockManager — Consolidated Schema (Fresh Install)
-- Merged from migrations 00001 through 00018
-- Generated: 2026-04-11
--
-- This single file creates the entire schema from scratch.
-- Do NOT run individual 00001-00018 migrations if using this file.
-- ==========================================

-- ==========================================
-- TIMEZONE
-- ==========================================
ALTER DATABASE postgres SET timezone TO 'Asia/Bangkok';
SET timezone = 'Asia/Bangkok';

-- ==========================================
-- ENUMS (core + chat + borrow)
-- ==========================================
CREATE TYPE user_role AS ENUM ('owner', 'accountant', 'manager', 'bar', 'staff', 'customer', 'hq');
CREATE TYPE deposit_status AS ENUM ('pending_confirm', 'in_store', 'pending_withdrawal', 'withdrawn', 'expired', 'transferred_out');
CREATE TYPE comparison_status AS ENUM ('pending', 'explained', 'approved', 'rejected');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'completed', 'rejected');
CREATE TYPE transfer_status AS ENUM ('pending', 'confirmed', 'rejected');
CREATE TYPE print_job_status AS ENUM ('pending', 'printing', 'completed', 'failed');
CREATE TYPE print_job_type AS ENUM ('receipt', 'label', 'transfer');
CREATE TYPE hq_deposit_status AS ENUM ('awaiting_withdrawal', 'withdrawn');
CREATE TYPE borrow_status AS ENUM ('pending_approval', 'approved', 'pos_adjusting', 'completed', 'return_pending', 'returned', 'rejected', 'cancelled');
CREATE TYPE chat_room_type AS ENUM ('store', 'direct', 'cross_store');
CREATE TYPE chat_message_type AS ENUM ('text', 'image', 'action_card', 'system');
CREATE TYPE chat_member_role AS ENUM ('member', 'admin');

-- CORE TABLES
-- ==========================================

CREATE TABLE profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  username TEXT UNIQUE NOT NULL,
  role user_role NOT NULL DEFAULT 'staff',
  line_user_id TEXT,
  display_name TEXT,
  avatar_url TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES profiles(id)
);

CREATE TABLE user_permissions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  permission TEXT NOT NULL,
  granted_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, permission)
);

CREATE TABLE stores (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_code TEXT UNIQUE NOT NULL,
  store_name TEXT NOT NULL,
  line_token TEXT,
  line_channel_id TEXT,
  line_channel_secret TEXT,
  /** กลุ่มแจ้งเตือนสต๊อก (daily reminder, comparison, approval) */
  stock_notify_group_id TEXT,
  /** กลุ่มแจ้งเตือนฝาก/เบิกเหล้า (staff) */
  deposit_notify_group_id TEXT,
  /** กลุ่มบาร์ยืนยันรับเหล้า (bar confirm) */
  bar_notify_group_id TEXT,
  borrow_notification_roles TEXT[] DEFAULT ARRAY['owner', 'manager']::text[],
  manager_id UUID REFERENCES profiles(id),
  is_central BOOLEAN DEFAULT false,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE user_stores (
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  PRIMARY KEY (user_id, store_id)
);

-- ==========================================
-- STOCK MODULE
-- ==========================================

CREATE TABLE products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  product_code TEXT NOT NULL,
  product_name TEXT NOT NULL,
  category TEXT,
  size TEXT,
  unit TEXT,
  price NUMERIC(10,2),
  active BOOLEAN DEFAULT true,
  count_status TEXT NOT NULL DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(store_id, product_code),
  CONSTRAINT products_count_status_check CHECK (count_status IN ('active', 'excluded'))
);

CREATE TABLE manual_counts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  count_date DATE NOT NULL,
  product_code TEXT NOT NULL,
  count_quantity NUMERIC(10,2) NOT NULL,
  user_id UUID REFERENCES profiles(id),
  notes TEXT,
  verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  CONSTRAINT manual_counts_store_date_product_unique UNIQUE (store_id, count_date, product_code)
);

CREATE TABLE ocr_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  upload_date TIMESTAMPTZ DEFAULT now(),
  count_items INTEGER,
  processed_items INTEGER,
  status TEXT DEFAULT 'pending',
  upload_method TEXT,
  file_urls TEXT[]
);

CREATE TABLE ocr_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ocr_log_id UUID REFERENCES ocr_logs(id) ON DELETE CASCADE,
  product_code TEXT,
  product_name TEXT,
  qty_ocr NUMERIC(10,2),
  unit TEXT,
  confidence NUMERIC(5,2),
  status TEXT DEFAULT 'pending',
  notes TEXT
);

CREATE TABLE comparisons (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  comp_date DATE NOT NULL,
  product_code TEXT NOT NULL,
  product_name TEXT,
  pos_quantity NUMERIC(10,2),
  manual_quantity NUMERIC(10,2),
  difference NUMERIC(10,2),
  diff_percent NUMERIC(5,2),
  status comparison_status DEFAULT 'pending',
  explanation TEXT,
  explained_by UUID REFERENCES profiles(id),
  approved_by UUID REFERENCES profiles(id),
  approval_status TEXT,
  owner_notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- DEPOSIT MODULE
-- ==========================================

CREATE TABLE deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  deposit_code TEXT UNIQUE NOT NULL,
  customer_id UUID REFERENCES profiles(id),
  line_user_id TEXT,
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  product_name TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC(10,2) NOT NULL,
  remaining_qty NUMERIC(10,2) NOT NULL,
  remaining_percent NUMERIC(5,2) DEFAULT 100,
  table_number TEXT,
  status deposit_status DEFAULT 'pending_confirm',
  expiry_date TIMESTAMPTZ,
  received_by UUID REFERENCES profiles(id),
  notes TEXT,
  /** backward compat — รูปหลัก (ImgBB URL เดิม หรือ Supabase URL ใหม่) */
  photo_url TEXT,
  /** รูปที่ลูกค้าถ่ายส่งมาตอนฝาก (ผ่าน LIFF) */
  customer_photo_url TEXT,
  /** รูปที่ Staff ถ่ายตอนรับของเข้าร้าน */
  received_photo_url TEXT,
  /** รูปที่ Bar ถ่ายตอนยืนยัน */
  confirm_photo_url TEXT,
  /** VIP deposits have no expiry date (ฝากได้ไม่มีหมดอายุ) */
  is_vip BOOLEAN DEFAULT false,
  /** ไม่ฝาก — สร้างเป็นรายการ expired ทันที รอโอนคลังกลาง */
  is_no_deposit BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE withdrawals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deposit_id UUID REFERENCES deposits(id),
  store_id UUID REFERENCES stores(id),
  line_user_id TEXT,
  customer_name TEXT,
  product_name TEXT,
  requested_qty NUMERIC(10,2),
  actual_qty NUMERIC(10,2),
  table_number TEXT,
  status withdrawal_status DEFAULT 'pending',
  processed_by UUID REFERENCES profiles(id),
  notes TEXT,
  photo_url TEXT,
  withdrawal_type TEXT DEFAULT 'in_store',
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE deposit_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  line_user_id TEXT NOT NULL,
  customer_name TEXT,
  customer_phone TEXT,
  product_name TEXT,
  quantity NUMERIC(10,2),
  table_number TEXT,
  customer_photo_url TEXT,
  notes TEXT,
  status TEXT DEFAULT 'pending',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- TRANSFER MODULE
-- ==========================================

CREATE TABLE transfers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_store_id UUID REFERENCES stores(id),
  to_store_id UUID REFERENCES stores(id),
  deposit_id UUID REFERENCES deposits(id),
  product_name TEXT,
  quantity NUMERIC(10,2),
  status transfer_status DEFAULT 'pending',
  requested_by UUID REFERENCES profiles(id),
  confirmed_by UUID REFERENCES profiles(id),
  notes TEXT,
  photo_url TEXT,
  confirm_photo_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE hq_deposits (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id UUID REFERENCES transfers(id),
  deposit_id UUID REFERENCES deposits(id),
  from_store_id UUID REFERENCES stores(id),
  product_name TEXT,
  customer_name TEXT,
  deposit_code TEXT,
  category TEXT,
  quantity NUMERIC(10,2),
  status hq_deposit_status DEFAULT 'awaiting_withdrawal',
  received_by UUID REFERENCES profiles(id),
  received_photo_url TEXT,
  received_at TIMESTAMPTZ DEFAULT now(),
  withdrawn_by UUID REFERENCES profiles(id),
  withdrawal_notes TEXT,
  withdrawn_at TIMESTAMPTZ,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- BORROW MODULE (ยืมสินค้าระหว่างสาขา)
-- ==========================================

CREATE TABLE borrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_code TEXT UNIQUE,                       -- human-readable ref: BRW-{FROM}-{TO}-XXXXX (see migration 00022)
  from_store_id UUID REFERENCES stores(id),      -- สาขาที่ขอยืม (borrower)
  to_store_id UUID REFERENCES stores(id),        -- สาขาเจ้าของสินค้า (lender)
  requested_by UUID REFERENCES profiles(id),     -- คนที่สร้างคำขอ
  status borrow_status DEFAULT 'pending_approval',
  notes TEXT,
  borrower_photo_url TEXT,                       -- รูปที่สาขาผู้ยืมถ่าย
  lender_photo_url TEXT,                         -- รูปที่สาขาผู้ให้ยืมถ่าย
  approved_by UUID REFERENCES profiles(id),
  approved_at TIMESTAMPTZ,
  borrower_pos_confirmed BOOLEAN DEFAULT false,
  lender_pos_confirmed BOOLEAN DEFAULT false,
  borrower_pos_confirmed_by UUID REFERENCES profiles(id),
  borrower_pos_confirmed_at TIMESTAMPTZ,
  lender_pos_confirmed_by UUID REFERENCES profiles(id),
  lender_pos_confirmed_at TIMESTAMPTZ,
  rejected_by UUID REFERENCES profiles(id),
  rejected_at TIMESTAMPTZ,
  rejection_reason TEXT,
  cancelled_by UUID REFERENCES profiles(id),
  cancelled_at TIMESTAMPTZ,
  borrower_pos_bill_url TEXT,              -- รูป POS bill ฝั่งผู้ยืม
  lender_pos_bill_url TEXT,                -- รูป POS bill ฝั่งผู้ให้ยืม
  completed_at TIMESTAMPTZ,
  -- Borrower return confirmation (status 'return_pending')
  return_photo_url TEXT,
  return_confirmed_by UUID REFERENCES profiles(id),
  return_confirmed_at TIMESTAMPTZ,
  return_notes TEXT,
  -- Lender return-receipt confirmation (status 'returned')
  return_receipt_photo_url TEXT,
  return_received_by UUID REFERENCES profiles(id),
  return_received_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE borrow_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_id UUID REFERENCES borrows(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC(10,2) NOT NULL,
  approved_quantity NUMERIC(10,2),          -- จำนวนที่อนุมัติจริง (อาจน้อยกว่าที่ขอ)
  unit TEXT,
  notes TEXT
);

-- ==========================================
-- SHARED TABLES
-- ==========================================

CREATE TABLE store_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  notify_time_daily TIME,
  notify_days TEXT[],
  diff_tolerance NUMERIC(5,2) DEFAULT 5,
  staff_registration_code TEXT,
  receipt_settings JSONB,
  customer_notify_expiry_enabled BOOLEAN DEFAULT true,
  customer_notify_expiry_days INTEGER DEFAULT 7,
  customer_notify_withdrawal_enabled BOOLEAN DEFAULT true,
  customer_notify_deposit_enabled BOOLEAN DEFAULT true,
  customer_notify_promotion_enabled BOOLEAN DEFAULT true,
  customer_notify_channels TEXT[] DEFAULT '{pwa,line}',
  /** เปิด/ปิดการส่งแจ้งเตือนผ่าน LINE ทั้งหมดของสาขา */
  line_notify_enabled BOOLEAN DEFAULT true,
  /** เปิด/ปิดเตือนนับสต๊อกประจำวัน (Cron Job 1) */
  daily_reminder_enabled BOOLEAN DEFAULT true,
  /** เปิด/ปิดติดตามรายการค้าง (Cron Job 3) */
  follow_up_enabled BOOLEAN DEFAULT true,
  /** Bot settings (00006) */
  chat_bot_deposit_enabled BOOLEAN NOT NULL DEFAULT true,
  chat_bot_withdrawal_enabled BOOLEAN NOT NULL DEFAULT true,
  chat_bot_stock_enabled BOOLEAN NOT NULL DEFAULT true,
  chat_bot_borrow_enabled BOOLEAN NOT NULL DEFAULT true,
  chat_bot_transfer_enabled BOOLEAN NOT NULL DEFAULT true,
  chat_bot_timeout_deposit INTEGER NOT NULL DEFAULT 15,
  chat_bot_timeout_withdrawal INTEGER NOT NULL DEFAULT 15,
  chat_bot_timeout_stock INTEGER NOT NULL DEFAULT 60,
  chat_bot_timeout_borrow INTEGER NOT NULL DEFAULT 30,
  chat_bot_timeout_transfer INTEGER NOT NULL DEFAULT 120,
  chat_bot_priority_deposit TEXT NOT NULL DEFAULT 'normal',
  chat_bot_priority_withdrawal TEXT NOT NULL DEFAULT 'normal',
  chat_bot_priority_stock TEXT NOT NULL DEFAULT 'normal',
  chat_bot_priority_borrow TEXT NOT NULL DEFAULT 'normal',
  chat_bot_priority_transfer TEXT NOT NULL DEFAULT 'normal',
  chat_bot_daily_summary_enabled BOOLEAN NOT NULL DEFAULT true,
  /** Print Server (00013) */
  print_server_account_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  print_server_working_hours JSONB DEFAULT '{"enabled": true, "startHour": 12, "startMinute": 0, "endHour": 6, "endMinute": 0}'::jsonb,
  /** Withdrawal blocked days (00016) */
  withdrawal_blocked_days TEXT[] DEFAULT '{Fri,Sat}'
);

CREATE TABLE app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  type TEXT DEFAULT 'string',
  description TEXT
);

CREATE TABLE audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  action_type TEXT NOT NULL,
  table_name TEXT,
  record_id TEXT,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notifications (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id),
  store_id UUID REFERENCES stores(id),
  title TEXT NOT NULL,
  body TEXT,
  type TEXT,
  read BOOLEAN DEFAULT false,
  data JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE penalties (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  staff_id UUID REFERENCES profiles(id),
  reason TEXT,
  amount NUMERIC(10,2),
  status TEXT DEFAULT 'pending',
  approved_by UUID REFERENCES profiles(id),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE,
  subscription JSONB NOT NULL,
  device_name TEXT,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE notification_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES profiles(id) ON DELETE CASCADE UNIQUE,
  pwa_enabled BOOLEAN DEFAULT true,
  line_enabled BOOLEAN DEFAULT true,
  notify_deposit_confirmed BOOLEAN DEFAULT true,
  notify_withdrawal_completed BOOLEAN DEFAULT true,
  notify_expiry_warning BOOLEAN DEFAULT true,
  notify_promotions BOOLEAN DEFAULT true,
  notify_stock_alert BOOLEAN DEFAULT true,
  notify_approval_request BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE announcements (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id),
  title TEXT NOT NULL,
  body TEXT,
  image_url TEXT,
  type TEXT DEFAULT 'promotion',
  target_audience TEXT DEFAULT 'customer',
  start_date TIMESTAMPTZ DEFAULT now(),
  end_date TIMESTAMPTZ,
  send_push BOOLEAN DEFAULT false,
  push_sent_at TIMESTAMPTZ,
  active BOOLEAN DEFAULT true,
  created_by UUID REFERENCES profiles(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- PRINT QUEUE
-- ==========================================

CREATE TABLE print_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  deposit_id UUID REFERENCES deposits(id) ON DELETE SET NULL,
  job_type print_job_type NOT NULL DEFAULT 'receipt',
  status print_job_status NOT NULL DEFAULT 'pending',
  copies INTEGER DEFAULT 1,
  payload JSONB NOT NULL,
  requested_by UUID REFERENCES profiles(id),
  printed_at TIMESTAMPTZ,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- ==========================================
-- PRINT SERVER STATUS (00013)
-- ==========================================

CREATE TABLE print_server_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE UNIQUE,
  is_online BOOLEAN DEFAULT false,
  last_heartbeat TIMESTAMPTZ,
  server_version TEXT,
  printer_name TEXT DEFAULT 'POS80',
  printer_status TEXT DEFAULT 'unknown',
  hostname TEXT,
  jobs_printed_today INTEGER DEFAULT 0,
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_print_server_status_store ON print_server_status(store_id);
CREATE INDEX idx_print_queue_store_pending ON print_queue(store_id, created_at ASC) WHERE status = 'pending';

-- ==========================================
-- ==========================================
-- CHAT TABLES (Phase 1-5)
-- ==========================================

CREATE TABLE chat_rooms (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id UUID REFERENCES stores(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type chat_room_type NOT NULL DEFAULT 'store',
  is_active BOOLEAN DEFAULT true,
  pinned_summary JSONB DEFAULT NULL,
  avatar_url TEXT DEFAULT NULL,
  created_by UUID REFERENCES profiles(id) DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE chat_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  sender_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
  type chat_message_type NOT NULL DEFAULT 'text',
  content TEXT,
  metadata JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  archived_at TIMESTAMPTZ DEFAULT NULL
);

CREATE TABLE chat_members (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  role chat_member_role NOT NULL DEFAULT 'member',
  last_read_at TIMESTAMPTZ DEFAULT now(),
  muted BOOLEAN NOT NULL DEFAULT false,
  joined_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(room_id, user_id)
);

CREATE TABLE chat_pinned_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_rooms(id) ON DELETE CASCADE,
  message_id UUID NOT NULL REFERENCES chat_messages(id) ON DELETE CASCADE,
  pinned_by UUID NOT NULL REFERENCES profiles(id),
  pinned_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(room_id, message_id)
);

-- INDEXES
-- ==========================================

CREATE INDEX idx_deposits_store_id ON deposits(store_id);
CREATE INDEX idx_deposits_customer_id ON deposits(customer_id);
CREATE INDEX idx_deposits_line_user_id ON deposits(line_user_id);
CREATE INDEX idx_deposits_status ON deposits(status);
CREATE INDEX idx_deposits_expiry_date ON deposits(expiry_date);
CREATE INDEX idx_deposits_is_vip ON deposits(is_vip) WHERE is_vip = true;
CREATE INDEX idx_deposits_is_no_deposit ON deposits(is_no_deposit) WHERE is_no_deposit = true;
CREATE INDEX idx_withdrawals_deposit_id ON withdrawals(deposit_id);
CREATE INDEX idx_withdrawals_store_id ON withdrawals(store_id);
CREATE INDEX idx_comparisons_store_id ON comparisons(store_id);
CREATE INDEX idx_comparisons_status ON comparisons(status);
CREATE INDEX idx_manual_counts_store_date ON manual_counts(store_id, count_date);
CREATE INDEX idx_notifications_user_id ON notifications(user_id);
CREATE INDEX idx_notifications_read ON notifications(user_id, read);
CREATE INDEX idx_audit_logs_store_id ON audit_logs(store_id);
CREATE INDEX idx_announcements_store_id ON announcements(store_id);
CREATE INDEX idx_announcements_active ON announcements(active, start_date, end_date);
CREATE INDEX idx_profiles_line_user_id ON profiles(line_user_id);
CREATE INDEX idx_deposit_requests_store_status ON deposit_requests(store_id, status);
CREATE INDEX idx_products_store_id ON products(store_id);
CREATE INDEX idx_hq_deposits_status ON hq_deposits(status);
CREATE INDEX idx_hq_deposits_from_store ON hq_deposits(from_store_id);
CREATE INDEX idx_hq_deposits_transfer ON hq_deposits(transfer_id);
CREATE INDEX idx_borrows_from_store ON borrows(from_store_id);
CREATE INDEX idx_borrows_to_store ON borrows(to_store_id);
CREATE INDEX idx_borrows_status ON borrows(status);
CREATE INDEX idx_borrows_created_at ON borrows(created_at);
CREATE INDEX idx_borrow_items_borrow ON borrow_items(borrow_id);
CREATE INDEX idx_stores_line_channel_id ON stores(line_channel_id) WHERE line_channel_id IS NOT NULL;
CREATE INDEX idx_print_queue_store_status ON print_queue(store_id, status);
CREATE INDEX idx_print_queue_created_at ON print_queue(created_at);

-- ==========================================
-- Chat indexes (00002)
CREATE INDEX idx_chat_messages_room_created ON chat_messages(room_id, created_at DESC) WHERE archived_at IS NULL;
CREATE INDEX idx_chat_members_user ON chat_members(user_id);
CREATE INDEX idx_chat_rooms_store ON chat_rooms(store_id) WHERE is_active = true;
CREATE INDEX idx_chat_messages_action_cards ON chat_messages((metadata->>'status')) WHERE type = 'action_card' AND archived_at IS NULL;

-- Pinned messages index (00005)
CREATE INDEX idx_chat_pinned_room ON chat_pinned_messages(room_id, pinned_at DESC);

-- FK indexes (00008 — performance optimization)
CREATE INDEX idx_transfers_from_store ON transfers(from_store_id);
CREATE INDEX idx_transfers_to_store ON transfers(to_store_id);
CREATE INDEX idx_transfers_deposit ON transfers(deposit_id);
CREATE INDEX idx_transfers_confirmed_by ON transfers(confirmed_by);
CREATE INDEX idx_transfers_requested_by ON transfers(requested_by);
CREATE INDEX idx_deposits_store_status ON deposits(store_id, status);
CREATE INDEX idx_deposits_received_by ON deposits(received_by);
CREATE INDEX idx_ocr_logs_store ON ocr_logs(store_id);
CREATE INDEX idx_penalties_store ON penalties(store_id);
CREATE INDEX idx_penalties_staff ON penalties(staff_id);
CREATE INDEX idx_chat_messages_sender ON chat_messages(sender_id);
CREATE INDEX idx_chat_rooms_created_by ON chat_rooms(created_by);
CREATE INDEX idx_chat_pinned_messages_pinned_by ON chat_pinned_messages(pinned_by);
CREATE INDEX idx_chat_pinned_messages_message ON chat_pinned_messages(message_id);
CREATE INDEX idx_push_subscriptions_user ON push_subscriptions(user_id);
CREATE INDEX idx_notifications_store ON notifications(store_id);
CREATE INDEX idx_hq_deposits_deposit ON hq_deposits(deposit_id);
CREATE INDEX idx_hq_deposits_received_by ON hq_deposits(received_by);
CREATE INDEX idx_hq_deposits_withdrawn_by ON hq_deposits(withdrawn_by);
CREATE INDEX idx_manual_counts_user ON manual_counts(user_id);
CREATE INDEX idx_borrows_approved_by ON borrows(approved_by);
CREATE INDEX idx_borrows_requested_by ON borrows(requested_by);
CREATE INDEX idx_borrows_rejected_by ON borrows(rejected_by);
CREATE INDEX idx_borrows_cancelled_by ON borrows(cancelled_by);
CREATE INDEX idx_borrows_borrower_pos ON borrows(borrower_pos_confirmed_by);
CREATE INDEX idx_borrows_lender_pos ON borrows(lender_pos_confirmed_by);
CREATE INDEX idx_print_queue_deposit ON print_queue(deposit_id);
CREATE INDEX idx_print_queue_requested_by ON print_queue(requested_by);
CREATE INDEX idx_profiles_created_by ON profiles(created_by);
CREATE INDEX idx_stores_manager ON stores(manager_id);
CREATE INDEX idx_announcements_created_by ON announcements(created_by);
CREATE INDEX idx_audit_logs_changed_by ON audit_logs(changed_by);
CREATE INDEX idx_user_stores_store ON user_stores(store_id);
CREATE INDEX idx_user_permissions_granted_by ON user_permissions(granted_by);
CREATE INDEX idx_comparisons_approved_by ON comparisons(approved_by);
CREATE INDEX idx_comparisons_explained_by ON comparisons(explained_by);

-- ==========================================
-- ROW LEVEL SECURITY — Enable on ALL tables
-- ==========================================

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE user_stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE products ENABLE ROW LEVEL SECURITY;
ALTER TABLE manual_counts ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE ocr_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE comparisons ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE withdrawals ENABLE ROW LEVEL SECURITY;
ALTER TABLE deposit_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE store_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE penalties ENABLE ROW LEVEL SECURITY;
ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE notification_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE print_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrows ENABLE ROW LEVEL SECURITY;
ALTER TABLE borrow_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE hq_deposits ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE app_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE chat_pinned_messages ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- HELPER FUNCTIONS (all with SET search_path = '')
-- ==========================================

CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('owner', 'accountant', 'hq')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION get_user_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM public.user_stores WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION is_print_server_online(p_store_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.print_server_status
    WHERE store_id = p_store_id
      AND last_heartbeat > now() - INTERVAL '2 minutes'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = public;

CREATE OR REPLACE FUNCTION is_chat_member(p_room_id UUID)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_members
    WHERE room_id = p_room_id AND user_id = auth.uid()
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION is_action_card_timed_out(p_metadata JSONB)
RETURNS BOOLEAN AS $$
BEGIN
  IF p_metadata->>'status' != 'claimed' THEN RETURN false; END IF;
  IF p_metadata->>'claimed_at' IS NULL OR p_metadata->>'timeout_minutes' IS NULL THEN RETURN false; END IF;
  RETURN (
    (p_metadata->>'claimed_at')::timestamptz
    + ((p_metadata->>'timeout_minutes')::int * interval '1 minute')
    < now()
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE SET search_path = public;

CREATE OR REPLACE FUNCTION auto_release_timed_out(p_metadata JSONB)
RETURNS JSONB AS $$
BEGIN
  RETURN p_metadata || jsonb_build_object(
    'status', 'pending', 'claimed_by', null, 'claimed_by_name', null,
    'claimed_at', null, 'auto_released', true, 'auto_released_at', now()
  );
END;
$$ LANGUAGE plpgsql SET search_path = public;

-- ==========================================
-- RLS POLICIES (final merged — all auth.uid() optimized)
-- ==========================================

-- ========== profiles ==========
CREATE POLICY "Users view own profile" ON profiles FOR SELECT USING (id = (SELECT auth.uid()));
CREATE POLICY "Admin view all profiles" ON profiles FOR SELECT USING (is_admin());
CREATE POLICY "Owner manages profiles" ON profiles FOR ALL USING (get_user_role() = 'owner');

-- ========== stores ==========
CREATE POLICY "Admin see all stores" ON stores FOR SELECT USING (is_admin());
CREATE POLICY "Users see assigned stores" ON stores FOR SELECT USING (id IN (SELECT get_user_store_ids()));
CREATE POLICY "Owner manages stores" ON stores FOR ALL USING (get_user_role() = 'owner');

-- ========== user_stores ==========
CREATE POLICY "Users see own assignments" ON user_stores FOR SELECT USING (user_id = (SELECT auth.uid()) OR is_admin());
CREATE POLICY "Owner manages assignments" ON user_stores FOR ALL USING (get_user_role() = 'owner');

-- ========== deposits ==========
CREATE POLICY "Staff see store deposits" ON deposits FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Customer see own deposits" ON deposits FOR SELECT USING (
  customer_id = (SELECT auth.uid())
  OR line_user_id = (SELECT p.line_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
);
CREATE POLICY "Staff manage store deposits" ON deposits FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== withdrawals ==========
CREATE POLICY "Staff see store withdrawals" ON withdrawals FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Customer see own withdrawals" ON withdrawals FOR SELECT USING (
  line_user_id = (SELECT p.line_user_id FROM public.profiles p WHERE p.id = (SELECT auth.uid()))
);
CREATE POLICY "Staff manage withdrawals" ON withdrawals FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== products ==========
CREATE POLICY "Staff see store products" ON products FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Admin manage products" ON products FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== comparisons ==========
CREATE POLICY "Staff see store comparisons" ON comparisons FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage comparisons" ON comparisons FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== manual_counts ==========
CREATE POLICY "Staff see store counts" ON manual_counts FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage counts" ON manual_counts FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== notifications ==========
CREATE POLICY "Users see own notifications" ON notifications FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users update own notifications" ON notifications FOR UPDATE USING (user_id = (SELECT auth.uid()));

-- ========== notification_preferences ==========
CREATE POLICY "Users see own preferences" ON notification_preferences FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users manage own preferences" ON notification_preferences FOR ALL USING (user_id = (SELECT auth.uid()));

-- ========== push_subscriptions ==========
CREATE POLICY "Users see own subscriptions" ON push_subscriptions FOR SELECT USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Users manage own subscriptions" ON push_subscriptions FOR ALL USING (user_id = (SELECT auth.uid()));

-- ========== announcements ==========
CREATE POLICY "Anyone see active announcements" ON announcements FOR SELECT USING (active = true AND start_date <= now() AND (end_date IS NULL OR end_date >= now()));
CREATE POLICY "Owner manage announcements" ON announcements FOR ALL USING (get_user_role() = 'owner');

-- ========== store_settings ==========
CREATE POLICY "Staff see store settings" ON store_settings FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Owner manage settings" ON store_settings FOR ALL USING (get_user_role() = 'owner');
CREATE POLICY "Manager manage settings" ON store_settings FOR ALL USING (get_user_role() = 'manager');

-- ========== transfers ==========
CREATE POLICY "Staff see store transfers" ON transfers FOR SELECT USING (from_store_id IN (SELECT get_user_store_ids()) OR to_store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage transfers" ON transfers FOR ALL USING (from_store_id IN (SELECT get_user_store_ids()) OR to_store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== penalties ==========
CREATE POLICY "Staff see store penalties" ON penalties FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Admin manage penalties" ON penalties FOR ALL USING (is_admin());

-- ========== user_permissions ==========
CREATE POLICY "Users see own permissions" ON user_permissions FOR SELECT USING (user_id = (SELECT auth.uid()) OR is_admin());
CREATE POLICY "Owner manage permissions" ON user_permissions FOR ALL USING (get_user_role() = 'owner');

-- ========== ocr ==========
CREATE POLICY "Staff see store ocr_logs" ON ocr_logs FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage ocr_logs" ON ocr_logs FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff see ocr_items" ON ocr_items FOR SELECT USING (ocr_log_id IN (SELECT id FROM public.ocr_logs WHERE store_id IN (SELECT get_user_store_ids())) OR is_admin());
CREATE POLICY "Staff manage ocr_items" ON ocr_items FOR ALL USING (ocr_log_id IN (SELECT id FROM public.ocr_logs WHERE store_id IN (SELECT get_user_store_ids())) OR is_admin());

-- ========== deposit_requests ==========
CREATE POLICY "Staff see store deposit_requests" ON deposit_requests FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Authenticated insert deposit_requests" ON deposit_requests FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "Staff manage deposit_requests" ON deposit_requests FOR UPDATE USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== audit_logs ==========
CREATE POLICY "Admin see audit_logs" ON audit_logs FOR SELECT USING (is_admin());

-- ========== app_settings ==========
CREATE POLICY "Admin read app_settings" ON app_settings FOR SELECT USING (is_admin());
CREATE POLICY "Admin write app_settings" ON app_settings FOR ALL USING (is_admin());

-- ========== print_queue ==========
CREATE POLICY "Staff see store print jobs" ON print_queue FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage print jobs" ON print_queue FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

ALTER TABLE print_server_status ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Staff see store print server status" ON print_server_status FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage print server status" ON print_server_status FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== borrows ==========
CREATE POLICY "Staff see related borrows" ON borrows FOR SELECT USING (from_store_id IN (SELECT get_user_store_ids()) OR to_store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage related borrows" ON borrows FOR ALL USING (from_store_id IN (SELECT get_user_store_ids()) OR to_store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- ========== borrow_items ==========
CREATE POLICY "Staff see borrow items" ON borrow_items FOR SELECT USING (borrow_id IN (SELECT id FROM public.borrows WHERE from_store_id IN (SELECT get_user_store_ids()) OR to_store_id IN (SELECT get_user_store_ids())) OR is_admin());
CREATE POLICY "Staff manage borrow items" ON borrow_items FOR ALL USING (borrow_id IN (SELECT id FROM public.borrows WHERE from_store_id IN (SELECT get_user_store_ids()) OR to_store_id IN (SELECT get_user_store_ids())) OR is_admin());

-- ========== hq_deposits ==========
CREATE POLICY "HQ and admin see hq_deposits" ON hq_deposits FOR SELECT USING (is_admin());
CREATE POLICY "HQ and admin manage hq_deposits" ON hq_deposits FOR ALL USING (is_admin());

-- ========== chat_rooms ==========
CREATE POLICY "Members see their chat rooms" ON chat_rooms FOR SELECT USING (is_chat_member(id) OR is_admin());
CREATE POLICY "Authenticated users can create rooms" ON chat_rooms FOR INSERT WITH CHECK ((SELECT auth.uid()) IS NOT NULL);
CREATE POLICY "Admins can update rooms" ON chat_rooms FOR UPDATE
  USING (EXISTS (SELECT 1 FROM public.chat_members WHERE chat_members.room_id = chat_rooms.id AND chat_members.user_id = (SELECT auth.uid()) AND chat_members.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.chat_members WHERE chat_members.room_id = chat_rooms.id AND chat_members.user_id = (SELECT auth.uid()) AND chat_members.role = 'admin'));

-- ========== chat_messages ==========
CREATE POLICY "Members see chat messages" ON chat_messages FOR SELECT USING (is_chat_member(room_id) OR is_admin());
CREATE POLICY "Members send chat messages" ON chat_messages FOR INSERT WITH CHECK (sender_id = (SELECT auth.uid()) AND is_chat_member(room_id));
CREATE POLICY "Members update action cards" ON chat_messages FOR UPDATE USING (type = 'action_card' AND is_chat_member(room_id));

-- ========== chat_members ==========
CREATE POLICY "Members see co-members" ON chat_members FOR SELECT USING (is_chat_member(room_id) OR is_admin());
CREATE POLICY "Members update own read status" ON chat_members FOR UPDATE USING (user_id = (SELECT auth.uid()));
CREATE POLICY "Members can update own membership" ON chat_members FOR UPDATE USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY "Managers manage chat members" ON chat_members FOR ALL USING (get_user_role() IN ('owner', 'manager'));
CREATE POLICY "Admins can add members" ON chat_members FOR INSERT WITH CHECK (
  (EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.room_id = chat_members.room_id AND cm.user_id = (SELECT auth.uid()) AND cm.role = 'admin'))
  OR user_id = (SELECT auth.uid())
);
CREATE POLICY "Admins can remove members" ON chat_members FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.chat_members cm WHERE cm.room_id = chat_members.room_id AND cm.user_id = (SELECT auth.uid()) AND cm.role = 'admin')
);

-- ========== chat_pinned_messages ==========
CREATE POLICY "Members can view pinned messages" ON chat_pinned_messages FOR SELECT USING (is_chat_member(room_id));
CREATE POLICY "Admins can pin messages" ON chat_pinned_messages FOR INSERT WITH CHECK (
  EXISTS (SELECT 1 FROM public.chat_members WHERE chat_members.room_id = chat_pinned_messages.room_id AND chat_members.user_id = (SELECT auth.uid()) AND (
    chat_members.role = 'admin' OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('owner', 'manager'))
  ))
);
CREATE POLICY "Admins can unpin messages" ON chat_pinned_messages FOR DELETE USING (
  EXISTS (SELECT 1 FROM public.chat_members WHERE chat_members.room_id = chat_pinned_messages.room_id AND chat_members.user_id = (SELECT auth.uid()) AND (
    chat_members.role = 'admin' OR EXISTS (SELECT 1 FROM public.profiles WHERE profiles.id = (SELECT auth.uid()) AND profiles.role IN ('owner', 'manager'))
  ))
);

-- ==========================================
-- CHAT FUNCTIONS (final versions from 00002+00003, with search_path)
-- ==========================================

CREATE OR REPLACE FUNCTION insert_bot_message(
  p_room_id UUID, p_type chat_message_type, p_content TEXT, p_metadata JSONB DEFAULT NULL
) RETURNS UUID AS $$
DECLARE v_id UUID;
BEGIN
  INSERT INTO public.chat_messages (room_id, sender_id, type, content, metadata)
  VALUES (p_room_id, NULL, p_type, p_content, p_metadata)
  RETURNING id INTO v_id;
  RETURN v_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = '';

CREATE OR REPLACE FUNCTION claim_action_card(
  p_message_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages;
  v_meta JSONB;
  v_profile RECORD;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  IF v_msg.type != 'action_card' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not an action card');
  END IF;

  v_meta := v_msg.metadata;

  IF v_meta->>'status' = 'claimed' AND public.is_action_card_timed_out(v_meta) THEN
    v_meta := public.auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
  END IF;

  IF v_meta->>'status' NOT IN ('pending', 'pending_bar') THEN
    RETURN jsonb_build_object('success', false, 'error', 'Already claimed',
      'claimed_by', v_meta->>'claimed_by_name');
  END IF;

  SELECT display_name, username INTO v_profile
  FROM public.profiles WHERE id = p_user_id;

  v_meta := v_meta
    || jsonb_build_object(
      'status', 'claimed',
      'claimed_by', p_user_id,
      'claimed_by_name', COALESCE(v_profile.display_name, v_profile.username),
      'claimed_at', now(),
      'auto_released', null,
      'auto_released_at', null
    );

  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION complete_action_card(
  p_message_id UUID,
  p_user_id UUID,
  p_notes TEXT DEFAULT NULL,
  p_photo_url TEXT DEFAULT NULL
)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages;
  v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  v_meta := v_msg.metadata;

  IF v_meta->>'status' != 'claimed' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not in claimed status');
  END IF;

  IF public.is_action_card_timed_out(v_meta) THEN
    v_meta := public.auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
    RETURN jsonb_build_object('success', false, 'error', 'หมดเวลาแล้ว งานถูกปล่อยกลับคิว',
      'metadata', v_meta, 'timed_out', true);
  END IF;

  IF v_meta->>'claimed_by' != p_user_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you');
  END IF;

  v_meta := v_meta
    || jsonb_build_object(
      'status', 'completed',
      'completed_at', now(),
      'completion_notes', p_notes,
      'confirmation_photo_url', p_photo_url
    );

  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;


CREATE OR REPLACE FUNCTION release_action_card(
  p_message_id UUID,
  p_user_id UUID
)
RETURNS JSONB AS $$
DECLARE
  v_msg public.chat_messages;
  v_meta JSONB;
BEGIN
  SELECT * INTO v_msg FROM public.chat_messages WHERE id = p_message_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Message not found');
  END IF;

  v_meta := v_msg.metadata;

  IF v_meta->>'status' = 'claimed' AND public.is_action_card_timed_out(v_meta) THEN
    v_meta := public.auto_release_timed_out(v_meta);
    UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;
    RETURN jsonb_build_object('success', true, 'metadata', v_meta);
  END IF;

  IF v_meta->>'claimed_by' != p_user_id::text THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not claimed by you');
  END IF;

  -- Restore to pending_bar if _bar_step is set, otherwise pending
  v_meta := v_meta
    || jsonb_build_object(
      'status', CASE WHEN (v_meta->>'_bar_step')::boolean IS TRUE THEN 'pending_bar' ELSE 'pending' END,
      'claimed_by', null,
      'claimed_by_name', null,
      'claimed_at', null,
      'released_by', p_user_id,
      'released_at', now(),
      '_bar_step', null
    );

  UPDATE public.chat_messages SET metadata = v_meta WHERE id = p_message_id;

  RETURN jsonb_build_object('success', true, 'metadata', v_meta);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

CREATE OR REPLACE FUNCTION get_chat_unread_counts(p_user_id UUID)
RETURNS TABLE(room_id UUID, unread_count BIGINT) AS $$
  SELECT cm.room_id, COUNT(msg.id) AS unread_count
  FROM public.chat_members cm
  LEFT JOIN public.chat_messages msg
    ON msg.room_id = cm.room_id AND msg.created_at > cm.last_read_at
    AND msg.sender_id != p_user_id AND msg.archived_at IS NULL
  WHERE cm.user_id = p_user_id
  GROUP BY cm.room_id;
$$ LANGUAGE sql SECURITY DEFINER STABLE SET search_path = '';

CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
  _username TEXT;
  _role user_role;
BEGIN
  -- ดึง username จาก metadata หรือ email หรือสร้างจาก UUID
  _username := COALESCE(
    NULLIF(TRIM(NEW.raw_user_meta_data->>'username'), ''),
    NULLIF(TRIM(NEW.email), ''),
    'user_' || REPLACE(NEW.id::TEXT, '-', '')
  );

  -- ถ้า username ซ้ำ ให้ต่อท้ายด้วย 6 ตัวแรกของ UUID
  IF EXISTS (SELECT 1 FROM public.profiles WHERE username = _username) THEN
    _username := _username || '_' || SUBSTR(REPLACE(NEW.id::TEXT, '-', ''), 1, 6);
  END IF;

  -- แปลง role จาก metadata (ถ้า invalid ให้ใช้ 'staff')
  BEGIN
    _role := COALESCE(
      NULLIF(TRIM(NEW.raw_user_meta_data->>'role'), '')::user_role,
      'staff'
    );
  EXCEPTION WHEN invalid_text_representation OR others THEN
    _role := 'staff';
  END;

  INSERT INTO public.profiles (id, username, role)
  VALUES (NEW.id, _username, _role);

  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error แต่ไม่ block การสร้าง auth user
  RAISE WARNING 'handle_new_user: failed to create profile for user % — %', NEW.id, SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ==========================================
-- เมื่อสร้าง store ใหม่ → สร้างห้องแชทสาขาอัตโนมัติ
CREATE OR REPLACE FUNCTION create_store_chat_room()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.chat_rooms (store_id, name, type)
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
  INSERT INTO public.chat_members (room_id, user_id, role)
  SELECT cr.id, NEW.user_id, 'member'
  FROM public.chat_rooms cr
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
  DELETE FROM public.chat_members
  WHERE user_id = OLD.user_id
    AND room_id IN (
      SELECT cr.id FROM public.chat_rooms cr
      WHERE cr.store_id = OLD.store_id AND cr.type = 'store'
    );
  RETURN OLD;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_user_store_remove_chat
  AFTER DELETE ON user_stores
  FOR EACH ROW
  EXECUTE FUNCTION remove_user_from_store_chat();

-- REALTIME: Enable for key tables
-- ==========================================

ALTER PUBLICATION supabase_realtime ADD TABLE deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE comparisons;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE deposit_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE print_queue;
ALTER PUBLICATION supabase_realtime ADD TABLE print_server_status;
ALTER PUBLICATION supabase_realtime ADD TABLE borrows;
ALTER PUBLICATION supabase_realtime ADD TABLE manual_counts;

-- ==========================================
-- APP SETTINGS: Central bot config
-- ==========================================

INSERT INTO app_settings (key, value, type, description) VALUES
  ('LINE_CENTRAL_TOKEN', '', 'secret', 'LINE Channel Access Token สำหรับ bot กลาง'),
  ('LINE_CENTRAL_GROUP_ID', '', 'string', 'LINE Group ID ของกลุ่มคลังกลาง'),
  ('LINE_CENTRAL_CHANNEL_SECRET', '', 'secret', 'LINE Channel Secret สำหรับ verify webhook signature'),
  ('OWNER_GROUP_LINE_ID', '', 'string', 'LINE Group ID ของกลุ่ม owner/admin สำหรับแจ้งเตือนผลต่างสต๊อก')
ON CONFLICT (key) DO NOTHING;

-- ==========================================
-- SYSTEM SETTINGS: DAVIS Ai Central Config (from 00018)
--
-- Global key-value store separate from app_settings, used for:
--   - davis_ai.bot_name        — display name shown in UI
--   - davis_ai.liff_id         — ONE shared LIFF id (replaces NEXT_PUBLIC_LIFF_ID env)
--                                URL format: liff.line.me/{liff_id}?store={store_code}
--   - davis_ai.webhook_note    — optional UI instructions
--
-- Per-store LINE credentials continue to live in `stores.line_token`
-- / `line_channel_id` / `line_channel_secret` (entered via per-store UI).
-- ==========================================

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       TEXT,
  description TEXT,
  updated_at  TIMESTAMPTZ DEFAULT now(),
  updated_by  UUID REFERENCES profiles(id)
);

COMMENT ON TABLE system_settings IS
  'Global key-value settings (DAVIS Ai central bot config, feature flags, etc.)';

-- Seed default rows
INSERT INTO system_settings (key, value, description)
VALUES
  ('davis_ai.bot_name',     'DAVIS Ai', 'Display name for the central bot (shown in UI)'),
  ('davis_ai.liff_id',      '',         'LIFF ID ที่ใช้ร่วมกันทุกสาขา — ใส่ ?store=storeCode ใน URL เพื่อระบุสาขา'),
  ('davis_ai.webhook_note', '',         'Extra note shown on DAVIS Ai settings page (optional)')
ON CONFLICT (key) DO NOTHING;

-- RLS — owner only can read/write
ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "owner_read_system_settings"
  ON system_settings FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'owner'
    )
  );

CREATE POLICY "owner_write_system_settings"
  ON system_settings FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'owner'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid()
        AND profiles.role = 'owner'
    )
  );

-- Trigger: auto-update updated_at
CREATE OR REPLACE FUNCTION system_settings_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS system_settings_updated_at ON system_settings;
CREATE TRIGGER system_settings_updated_at
  BEFORE UPDATE ON system_settings
  FOR EACH ROW
  EXECUTE FUNCTION system_settings_touch_updated_at();

-- ==========================================
-- SUPABASE STORAGE: Bucket สำหรับรูปฝากเหล้า
-- ==========================================

INSERT INTO storage.buckets (id, name, public) VALUES ('deposit-photos', 'deposit-photos', true)
ON CONFLICT (id) DO NOTHING;

-- RLS: authenticated users สามารถอัปโหลดได้
CREATE POLICY "Authenticated users can upload deposit photos"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (bucket_id = 'deposit-photos');

-- RLS: ทุกคนดูได้ (public bucket สำหรับ LINE Flex)
CREATE POLICY "Public read access for deposit photos"
ON storage.objects FOR SELECT
TO public
USING (bucket_id = 'deposit-photos');

-- ==========================================
-- SEED: Chat rooms for existing stores
-- ==========================================

INSERT INTO public.chat_rooms (store_id, name, type)
SELECT s.id, s.store_name || ' — แชท', 'store'
FROM stores s
WHERE s.active = true
  AND NOT EXISTS (SELECT 1 FROM chat_rooms cr WHERE cr.store_id = s.id AND cr.type = 'store');

INSERT INTO chat_members (room_id, user_id, role)
SELECT cr.id, us.user_id, 'member'
FROM user_stores us
JOIN chat_rooms cr ON cr.store_id = us.store_id AND cr.type = 'store'
WHERE cr.is_active = true
ON CONFLICT (room_id, user_id) DO NOTHING;
