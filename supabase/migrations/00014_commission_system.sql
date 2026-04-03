-- Commission System: AE profiles + commission entries
-- AE = Account Executive (คนพาลูกค้ามาร้าน)

-- ─── Enum ───
DO $$ BEGIN
  CREATE TYPE commission_type AS ENUM ('ae_commission', 'bottle_commission');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── AE Profiles (ใช้ร่วมทุกสาขา) ───
CREATE TABLE IF NOT EXISTS ae_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  nickname    text,
  phone       text,
  bank_name   text,
  bank_account_no   text,
  bank_account_name text,
  notes       text,
  is_active   boolean NOT NULL DEFAULT true,
  created_by  uuid REFERENCES profiles(id),
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- ─── Commission Entries (แยกตามสาขา) ───
CREATE TABLE IF NOT EXISTS commission_entries (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id          uuid NOT NULL REFERENCES stores(id),
  type              commission_type NOT NULL,

  -- AE commission fields
  ae_id             uuid REFERENCES ae_profiles(id),

  -- Bottle commission fields
  staff_id          uuid REFERENCES profiles(id),

  -- Bill info
  bill_date         date NOT NULL,
  receipt_no        text,
  receipt_photo_url text,
  table_no          text,

  -- AE commission calculation
  subtotal_amount   numeric(12,2),       -- ยอดรวมก่อน VAT/SVC
  commission_rate   numeric(5,4) NOT NULL DEFAULT 0.10,  -- 10%
  tax_rate          numeric(5,4) NOT NULL DEFAULT 0.03,  -- 3% withholding
  commission_amount numeric(12,2),       -- = subtotal × rate
  tax_amount        numeric(12,2),       -- = commission × tax_rate
  net_amount        numeric(12,2) NOT NULL, -- = commission - tax (or bottle_count × bottle_rate)

  -- Bottle commission
  bottle_count      integer,
  bottle_rate       numeric(10,2) DEFAULT 500,

  notes             text,
  created_by        uuid REFERENCES profiles(id),
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

-- ─── Indexes ───
CREATE INDEX IF NOT EXISTS idx_commission_entries_store_id ON commission_entries(store_id);
CREATE INDEX IF NOT EXISTS idx_commission_entries_ae_id ON commission_entries(ae_id);
CREATE INDEX IF NOT EXISTS idx_commission_entries_bill_date ON commission_entries(bill_date);
CREATE INDEX IF NOT EXISTS idx_commission_entries_type ON commission_entries(type);
CREATE INDEX IF NOT EXISTS idx_commission_entries_store_date ON commission_entries(store_id, bill_date);
CREATE INDEX IF NOT EXISTS idx_ae_profiles_active ON ae_profiles(is_active);

-- ─── RLS ───
ALTER TABLE ae_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE commission_entries ENABLE ROW LEVEL SECURITY;

-- AE profiles: ทุกคนที่ login ดูได้ (ใช้ร่วมทุกสาขา)
CREATE POLICY "ae_profiles_select" ON ae_profiles
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "ae_profiles_insert" ON ae_profiles
  FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "ae_profiles_update" ON ae_profiles
  FOR UPDATE TO authenticated USING (true);

-- Commission entries: ดูได้ตามสาขา (owner/accountant ดูทุกสาขา)
CREATE POLICY "commission_entries_select" ON commission_entries
  FOR SELECT TO authenticated
  USING (
    store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );

CREATE POLICY "commission_entries_insert" ON commission_entries
  FOR INSERT TO authenticated
  WITH CHECK (
    store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );

CREATE POLICY "commission_entries_update" ON commission_entries
  FOR UPDATE TO authenticated
  USING (
    store_id IN (SELECT get_user_store_ids())
    OR is_admin()
  );

CREATE POLICY "commission_entries_delete" ON commission_entries
  FOR DELETE TO authenticated
  USING (
    is_admin()
  );

-- ─── Updated_at trigger ───
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  CREATE TRIGGER trg_ae_profiles_updated_at
    BEFORE UPDATE ON ae_profiles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TRIGGER trg_commission_entries_updated_at
    BEFORE UPDATE ON commission_entries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
