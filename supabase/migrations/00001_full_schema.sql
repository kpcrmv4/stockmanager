-- ==========================================
-- StockManager — Full Schema
-- รวม migration ทั้งหมดเป็นไฟล์เดียว (fresh install)
-- ==========================================

-- ==========================================
-- TIMEZONE: Set database default to Asia/Bangkok (GMT+7)
-- ==========================================
ALTER DATABASE postgres SET timezone TO 'Asia/Bangkok';
SET timezone = 'Asia/Bangkok';

-- ==========================================
-- ENUMS
-- ==========================================
CREATE TYPE user_role AS ENUM ('owner', 'accountant', 'manager', 'bar', 'staff', 'customer', 'hq');
CREATE TYPE deposit_status AS ENUM ('pending_confirm', 'in_store', 'pending_withdrawal', 'withdrawn', 'expired', 'transferred_out');
CREATE TYPE comparison_status AS ENUM ('pending', 'explained', 'approved', 'rejected');
CREATE TYPE withdrawal_status AS ENUM ('pending', 'approved', 'completed', 'rejected');
CREATE TYPE transfer_status AS ENUM ('pending', 'confirmed', 'rejected');
CREATE TYPE print_job_status AS ENUM ('pending', 'printing', 'completed', 'failed');
CREATE TYPE print_job_type AS ENUM ('receipt', 'label');

-- ==========================================
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

CREATE TYPE hq_deposit_status AS ENUM ('awaiting_withdrawal', 'withdrawn');

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

CREATE TYPE borrow_status AS ENUM ('pending_approval', 'approved', 'pos_adjusting', 'completed', 'rejected');

CREATE TABLE borrows (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
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
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE borrow_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  borrow_id UUID REFERENCES borrows(id) ON DELETE CASCADE,
  product_name TEXT NOT NULL,
  category TEXT,
  quantity NUMERIC(10,2) NOT NULL,
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
  follow_up_enabled BOOLEAN DEFAULT true
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
-- ROW LEVEL SECURITY
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

-- Helper function to check user role
CREATE OR REPLACE FUNCTION get_user_role()
RETURNS user_role AS $$
  SELECT role FROM profiles WHERE id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to check if user is owner/accountant
CREATE OR REPLACE FUNCTION is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('owner', 'accountant', 'hq')
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Helper function to get user's store IDs
CREATE OR REPLACE FUNCTION get_user_store_ids()
RETURNS SETOF UUID AS $$
  SELECT store_id FROM user_stores WHERE user_id = auth.uid();
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- Profiles policies
CREATE POLICY "Users view own profile" ON profiles
  FOR SELECT USING (id = auth.uid());
CREATE POLICY "Admin view all profiles" ON profiles
  FOR SELECT USING (is_admin());
CREATE POLICY "Owner manages profiles" ON profiles
  FOR ALL USING (get_user_role() = 'owner');

-- Stores policies
CREATE POLICY "Admin see all stores" ON stores
  FOR SELECT USING (is_admin());
CREATE POLICY "Users see assigned stores" ON stores
  FOR SELECT USING (id IN (SELECT get_user_store_ids()));
CREATE POLICY "Owner manages stores" ON stores
  FOR ALL USING (get_user_role() = 'owner');

-- User stores policies
CREATE POLICY "Users see own assignments" ON user_stores
  FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "Owner manages assignments" ON user_stores
  FOR ALL USING (get_user_role() = 'owner');

-- Deposits policies
CREATE POLICY "Staff see store deposits" ON deposits
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Customer see own deposits" ON deposits
  FOR SELECT USING (
    customer_id = auth.uid()
    OR line_user_id = (SELECT line_user_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "Staff manage store deposits" ON deposits
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Withdrawals policies
CREATE POLICY "Staff see store withdrawals" ON withdrawals
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Customer see own withdrawals" ON withdrawals
  FOR SELECT USING (
    line_user_id = (SELECT line_user_id FROM profiles WHERE id = auth.uid())
  );
CREATE POLICY "Staff manage withdrawals" ON withdrawals
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Products policies
CREATE POLICY "Staff see store products" ON products
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Admin manage products" ON products
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Comparisons policies
CREATE POLICY "Staff see store comparisons" ON comparisons
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage comparisons" ON comparisons
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Manual counts policies
CREATE POLICY "Staff see store counts" ON manual_counts
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage counts" ON manual_counts
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Notifications policies
CREATE POLICY "Users see own notifications" ON notifications
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users update own notifications" ON notifications
  FOR UPDATE USING (user_id = auth.uid());

-- Notification preferences policies
CREATE POLICY "Users see own preferences" ON notification_preferences
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users manage own preferences" ON notification_preferences
  FOR ALL USING (user_id = auth.uid());

-- Push subscriptions policies
CREATE POLICY "Users see own subscriptions" ON push_subscriptions
  FOR SELECT USING (user_id = auth.uid());
CREATE POLICY "Users manage own subscriptions" ON push_subscriptions
  FOR ALL USING (user_id = auth.uid());

-- Announcements policies
CREATE POLICY "Anyone see active announcements" ON announcements
  FOR SELECT USING (active = true AND start_date <= now() AND (end_date IS NULL OR end_date >= now()));
CREATE POLICY "Owner manage announcements" ON announcements
  FOR ALL USING (get_user_role() = 'owner');

-- Store settings policies
CREATE POLICY "Staff see store settings" ON store_settings
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Owner manage settings" ON store_settings
  FOR ALL USING (get_user_role() = 'owner');

-- Transfers policies
CREATE POLICY "Staff see store transfers" ON transfers
  FOR SELECT USING (
    from_store_id IN (SELECT get_user_store_ids())
    OR to_store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );
CREATE POLICY "Staff manage transfers" ON transfers
  FOR ALL USING (
    from_store_id IN (SELECT get_user_store_ids())
    OR to_store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );

-- Penalties policies
CREATE POLICY "Staff see store penalties" ON penalties
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Admin manage penalties" ON penalties
  FOR ALL USING (is_admin());

-- User permissions policies
CREATE POLICY "Users see own permissions" ON user_permissions
  FOR SELECT USING (user_id = auth.uid() OR is_admin());
CREATE POLICY "Owner manage permissions" ON user_permissions
  FOR ALL USING (get_user_role() = 'owner');

-- OCR policies
CREATE POLICY "Staff see store ocr_logs" ON ocr_logs
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage ocr_logs" ON ocr_logs
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff see ocr_items" ON ocr_items
  FOR SELECT USING (
    ocr_log_id IN (SELECT id FROM ocr_logs WHERE store_id IN (SELECT get_user_store_ids()))
    OR is_admin()
  );
CREATE POLICY "Staff manage ocr_items" ON ocr_items
  FOR ALL USING (
    ocr_log_id IN (SELECT id FROM ocr_logs WHERE store_id IN (SELECT get_user_store_ids()))
    OR is_admin()
  );

-- Deposit requests policies
CREATE POLICY "Staff see store deposit_requests" ON deposit_requests
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Anyone insert deposit_requests" ON deposit_requests
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Staff manage deposit_requests" ON deposit_requests
  FOR UPDATE USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Audit logs policies
CREATE POLICY "Admin see audit_logs" ON audit_logs
  FOR SELECT USING (is_admin() OR store_id IN (SELECT get_user_store_ids()));

-- Print queue policies
CREATE POLICY "Staff see store print jobs" ON print_queue
  FOR SELECT USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());
CREATE POLICY "Staff manage print jobs" ON print_queue
  FOR ALL USING (store_id IN (SELECT get_user_store_ids()) OR is_admin());

-- Borrows policies
CREATE POLICY "Staff see related borrows" ON borrows
  FOR SELECT USING (
    from_store_id IN (SELECT get_user_store_ids())
    OR to_store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );
CREATE POLICY "Staff manage related borrows" ON borrows
  FOR ALL USING (
    from_store_id IN (SELECT get_user_store_ids())
    OR to_store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );

-- Borrow items policies
CREATE POLICY "Staff see borrow items" ON borrow_items
  FOR SELECT USING (
    borrow_id IN (
      SELECT id FROM borrows
      WHERE from_store_id IN (SELECT get_user_store_ids())
        OR to_store_id IN (SELECT get_user_store_ids())
    )
    OR is_admin()
  );
CREATE POLICY "Staff manage borrow items" ON borrow_items
  FOR ALL USING (
    borrow_id IN (
      SELECT id FROM borrows
      WHERE from_store_id IN (SELECT get_user_store_ids())
        OR to_store_id IN (SELECT get_user_store_ids())
    )
    OR is_admin()
  );

-- HQ deposits policies
CREATE POLICY "HQ and admin see hq_deposits" ON hq_deposits
  FOR SELECT USING (is_admin());
CREATE POLICY "HQ and admin manage hq_deposits" ON hq_deposits
  FOR ALL USING (is_admin());

-- ==========================================
-- TRIGGERS: Auto-create profile on signup
-- ==========================================

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
-- REALTIME: Enable for key tables
-- ==========================================

ALTER PUBLICATION supabase_realtime ADD TABLE deposits;
ALTER PUBLICATION supabase_realtime ADD TABLE withdrawals;
ALTER PUBLICATION supabase_realtime ADD TABLE comparisons;
ALTER PUBLICATION supabase_realtime ADD TABLE notifications;
ALTER PUBLICATION supabase_realtime ADD TABLE deposit_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE announcements;
ALTER PUBLICATION supabase_realtime ADD TABLE print_queue;
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
